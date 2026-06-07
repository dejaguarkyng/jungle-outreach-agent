from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from pydantic import BaseModel, Field

from . import classify, dedupe, discover, draft, normalize, pipeline, queue, score
from .config import PipelineConfig
from .json_io import find_json_files, write_json
from .models import LeadSource

TASK_STAGE_CHOICES = (
    "discover",
    "dedupe",
    "classify",
    "score",
    "draft",
    "queue",
    "pipeline",
)


class TaskFileContract(BaseModel):
    path: str
    description: str
    dynamic: bool = False


class TaskContract(BaseModel):
    stage_name: str
    description: str
    input_files: list[TaskFileContract] = Field(default_factory=list)
    output_files: list[TaskFileContract] = Field(default_factory=list)
    internal_steps: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class TaskManifest(BaseModel):
    contract_version: str = "openclaw-task.v1"
    run_id: str
    stage_name: str
    config_path: str | None = None
    input_files: list[str] = Field(default_factory=list)
    output_files: list[str] = Field(default_factory=list)
    success: bool
    started_at: datetime
    finished_at: datetime
    duration_seconds: float
    error_message: str | None = None
    selected_sources: list[str] = Field(default_factory=list)
    counts: dict[str, int] = Field(default_factory=dict)
    internal_steps: list[str] = Field(default_factory=list)
    manifest_path: str = ""


def describe_contracts(
    config: PipelineConfig,
    *,
    stage: str | None = None,
) -> dict[str, TaskContract] | TaskContract:
    contracts = _build_contracts(config)
    if stage is None:
        return contracts
    normalized = _normalize_stage_name(stage)
    return contracts[normalized]


def run_task(
    stage: str,
    config: PipelineConfig,
    *,
    config_path: str | Path | None = None,
    selected_sources: list[LeadSource] | None = None,
    input_path: Path | None = None,
    output_path: Path | None = None,
    output_dir: Path | None = None,
    manifest_dir: Path | None = None,
    manifest_path: Path | None = None,
    now: datetime | None = None,
    client: httpx.Client | None = None,
) -> TaskManifest:
    normalized_stage = _normalize_stage_name(stage)
    started_at = _utc_now()
    run_id = f"{started_at.strftime('%Y%m%dT%H%M%SZ')}-{normalized_stage}-{uuid4().hex[:8]}"

    input_files = _resolve_runtime_inputs(config, normalized_stage, input_path=input_path)
    output_files: list[str] = []
    counts: dict[str, int] = {}
    internal_steps = _build_contracts(config)[normalized_stage].internal_steps
    error_message: str | None = None
    success = False

    try:
        if normalized_stage == "discover":
            output_files, counts = _run_discover_task(
                config,
                selected_sources=selected_sources,
                output_dir=output_dir,
                output_path=output_path,
                now=now,
                client=client,
            )
        elif normalized_stage == "dedupe":
            output_files, counts = _run_dedupe_task(config, input_path=input_path, output_path=output_path)
        elif normalized_stage == "classify":
            output_files, counts = _run_classify_task(config, input_path=input_path, output_path=output_path)
        elif normalized_stage == "score":
            output_files, counts = _run_score_task(config, input_path=input_path, output_path=output_path)
        elif normalized_stage == "draft":
            output_files, counts = _run_draft_task(config, input_path=input_path, output_path=output_path)
        elif normalized_stage == "queue":
            output_files, counts = _run_queue_task(config, input_path=input_path, output_path=output_path)
        else:
            output_files, counts = _run_pipeline_task(
                config,
                selected_sources=selected_sources,
                now=now,
                client=client,
            )
        success = True
    except Exception as exc:
        error_message = f"{type(exc).__name__}: {exc}"

    finished_at = _utc_now()
    manifest = TaskManifest(
        run_id=run_id,
        stage_name=normalized_stage,
        config_path=str(Path(config_path).resolve()) if config_path is not None else None,
        input_files=input_files,
        output_files=output_files,
        success=success,
        started_at=started_at,
        finished_at=finished_at,
        duration_seconds=round((finished_at - started_at).total_seconds(), 6),
        error_message=error_message,
        selected_sources=[source.value for source in selected_sources or []],
        counts=counts,
        internal_steps=internal_steps,
    )
    manifest.manifest_path = str(
        _write_manifest(
            manifest,
            config=config,
            manifest_dir=manifest_dir,
            manifest_path=manifest_path,
        )
    )
    return manifest


def _run_discover_task(
    config: PipelineConfig,
    *,
    selected_sources: list[LeadSource] | None,
    output_dir: Path | None,
    output_path: Path | None,
    now: datetime | None,
    client: httpx.Client | None,
) -> tuple[list[str], dict[str, int]]:
    raw_files, discovered_count = discover.run(
        config,
        selected_sources=selected_sources,
        output_dir=output_dir,
        now=now,
        client=client,
    )
    normalized = normalize.run(
        config,
        input_paths=[Path(path) for path in raw_files],
        output_path=output_path,
    )
    normalized_path = _normalize_path(output_path or config.paths.normalized_path)
    output_files = [*_normalize_paths(raw_files), normalized_path]
    counts = {
        "discovered": discovered_count,
        "normalized": len(normalized),
    }
    return output_files, counts


def _run_dedupe_task(
    config: PipelineConfig,
    *,
    input_path: Path | None,
    output_path: Path | None,
) -> tuple[list[str], dict[str, int]]:
    leads = dedupe.run(config, input_path=input_path, output_path=output_path)
    return [_normalize_path(output_path or config.paths.deduped_path)], {"deduped": len(leads)}


def _run_classify_task(
    config: PipelineConfig,
    *,
    input_path: Path | None,
    output_path: Path | None,
) -> tuple[list[str], dict[str, int]]:
    leads = classify.run(config, input_path=input_path, output_path=output_path)
    return [_normalize_path(output_path or config.paths.classified_path)], {"classified": len(leads)}


def _run_score_task(
    config: PipelineConfig,
    *,
    input_path: Path | None,
    output_path: Path | None,
) -> tuple[list[str], dict[str, int]]:
    leads = score.run(config, input_path=input_path, output_path=output_path)
    return [_normalize_path(output_path or config.paths.scored_path)], {"scored": len(leads)}


def _run_draft_task(
    config: PipelineConfig,
    *,
    input_path: Path | None,
    output_path: Path | None,
) -> tuple[list[str], dict[str, int]]:
    leads = draft.run(config, input_path=input_path, output_path=output_path)
    drafted_count = len([lead for lead in leads if lead.outreach is not None])
    return [_normalize_path(output_path or config.paths.drafts_path)], {"drafted": drafted_count}


def _run_queue_task(
    config: PipelineConfig,
    *,
    input_path: Path | None,
    output_path: Path | None,
) -> tuple[list[str], dict[str, int]]:
    leads = queue.run(config, input_path=input_path, output_path=output_path)
    return [_normalize_path(output_path or config.paths.outreach_queue_path)], {"queued": len(leads)}


def _run_pipeline_task(
    config: PipelineConfig,
    *,
    selected_sources: list[LeadSource] | None,
    now: datetime | None,
    client: httpx.Client | None,
) -> tuple[list[str], dict[str, int]]:
    before_raw = {_normalize_path(path) for path in find_json_files(config.paths.raw_dir)}
    summary = pipeline.run_all(config, selected_sources=selected_sources)
    after_raw = {_normalize_path(path) for path in find_json_files(config.paths.raw_dir)}
    new_raw = sorted(after_raw - before_raw)
    output_files = [
        *new_raw,
        _normalize_path(config.paths.normalized_path),
        _normalize_path(config.paths.deduped_path),
        _normalize_path(config.paths.classified_path),
        _normalize_path(config.paths.scored_path),
        _normalize_path(config.paths.drafts_path),
        _normalize_path(config.paths.outreach_queue_path),
    ]
    return output_files, summary


def _build_contracts(config: PipelineConfig) -> dict[str, TaskContract]:
    return {
        "discover": TaskContract(
            stage_name="discover",
            description=(
                "Fetch raw source snapshots, then run internal normalization plus relevance qualification "
                "so the dedupe task has a stable filtered artifact to consume."
            ),
            input_files=[],
            output_files=[
                TaskFileContract(
                    path=str((config.paths.raw_dir / "<source>" / "<timestamp>.json").resolve()),
                    description="Raw discovery snapshot for each selected source.",
                    dynamic=True,
                ),
                TaskFileContract(
                    path=_normalize_path(config.paths.normalized_path),
                    description="Qualified normalized lead list written for downstream dedupe.",
                ),
            ],
            internal_steps=["discover", "normalize", "qualify"],
            notes=[
                "OpenClaw should treat this task as the discover entrypoint even though normalization and qualification run internally.",
            ],
        ),
        "dedupe": TaskContract(
            stage_name="dedupe",
            description="Collapse exact URL duplicates and fuzzy complaint duplicates from the normalized lead set.",
            input_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.normalized_path),
                    description="Qualified normalized leads produced by the discover task.",
                )
            ],
            output_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.deduped_path),
                    description="Deduplicated leads for classification.",
                )
            ],
            internal_steps=["dedupe"],
        ),
        "classify": TaskContract(
            stage_name="classify",
            description="Classify deduplicated leads into Jungle Grid pain categories.",
            input_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.deduped_path),
                    description="Deduplicated leads.",
                )
            ],
            output_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.classified_path),
                    description="Classified leads.",
                )
            ],
            internal_steps=["classify"],
        ),
        "score": TaskContract(
            stage_name="score",
            description="Score Jungle Grid fit for classified leads.",
            input_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.classified_path),
                    description="Classified leads.",
                )
            ],
            output_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.scored_path),
                    description="Scored leads.",
                )
            ],
            internal_steps=["score"],
        ),
        "draft": TaskContract(
            stage_name="draft",
            description="Generate manual outreach drafts for high-fit scored leads.",
            input_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.scored_path),
                    description="Scored leads.",
                )
            ],
            output_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.drafts_path),
                    description="Drafted leads with optional outreach payloads.",
                )
            ],
            internal_steps=["draft"],
        ),
        "queue": TaskContract(
            stage_name="queue",
            description="Build the final outreach queue from drafted leads.",
            input_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.drafts_path),
                    description="Drafted leads.",
                )
            ],
            output_files=[
                TaskFileContract(
                    path=_normalize_path(config.paths.outreach_queue_path),
                    description="Manual outreach queue.",
                )
            ],
            internal_steps=["queue"],
        ),
        "pipeline": TaskContract(
            stage_name="pipeline",
            description="Run the package pipeline end to end using the existing package orchestration order.",
            input_files=[],
            output_files=[
                TaskFileContract(
                    path=str((config.paths.raw_dir / "<source>" / "<timestamp>.json").resolve()),
                    description="Raw discovery snapshots created during the run.",
                    dynamic=True,
                ),
                TaskFileContract(
                    path=_normalize_path(config.paths.normalized_path),
                    description="Qualified normalized leads.",
                ),
                TaskFileContract(
                    path=_normalize_path(config.paths.deduped_path),
                    description="Deduplicated leads.",
                ),
                TaskFileContract(
                    path=_normalize_path(config.paths.classified_path),
                    description="Classified leads.",
                ),
                TaskFileContract(
                    path=_normalize_path(config.paths.scored_path),
                    description="Scored leads.",
                ),
                TaskFileContract(
                    path=_normalize_path(config.paths.drafts_path),
                    description="Drafted leads.",
                ),
                TaskFileContract(
                    path=_normalize_path(config.paths.outreach_queue_path),
                    description="Outreach queue.",
                ),
            ],
            internal_steps=["discover", "normalize", "qualify", "dedupe", "classify", "score", "draft", "queue"],
            notes=["This task delegates to jungle_grid_leads.pipeline.run_all()."],
        ),
    }


def _resolve_runtime_inputs(
    config: PipelineConfig,
    stage: str,
    *,
    input_path: Path | None,
) -> list[str]:
    if stage == "discover":
        return []
    if stage == "dedupe":
        return [_normalize_path(input_path or config.paths.normalized_path)]
    if stage == "classify":
        return [_normalize_path(input_path or config.paths.deduped_path)]
    if stage == "score":
        return [_normalize_path(input_path or config.paths.classified_path)]
    if stage == "draft":
        return [_normalize_path(input_path or config.paths.scored_path)]
    if stage == "queue":
        return [_normalize_path(input_path or config.paths.drafts_path)]
    return []


def _write_manifest(
    manifest: TaskManifest,
    *,
    config: PipelineConfig,
    manifest_dir: Path | None,
    manifest_path: Path | None,
) -> Path:
    if manifest_path is not None:
        target = Path(manifest_path)
    else:
        base_dir = manifest_dir or (config.paths.raw_dir.parent / "openclaw" / "manifests")
        target = Path(base_dir) / f"{manifest.run_id}.json"
    target = target.resolve()
    write_json(target, manifest.model_dump(mode="json"))
    return target


def _normalize_stage_name(stage: str) -> str:
    normalized = stage.strip().lower().replace("-", "_")
    if normalized == "full_pipeline":
        normalized = "pipeline"
    if normalized not in TASK_STAGE_CHOICES:
        raise ValueError(f"Unsupported task stage: {stage}")
    return normalized


def _normalize_path(path: Path) -> str:
    return str(Path(path).resolve())


def _normalize_paths(paths: list[Path]) -> list[str]:
    return [_normalize_path(path) for path in paths]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
