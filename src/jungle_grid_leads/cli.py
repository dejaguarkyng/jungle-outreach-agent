from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv()
except ImportError:
    pass

from . import classify, dedupe, discover, draft, normalize, queue, score
from .config import load_config
from .models import LeadSource
from .openclaw_tasks import TASK_STAGE_CHOICES, describe_contracts, run_task
from .pipeline import run_all


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "handler"):
        parser.print_help()
        return 1
    return int(args.handler(args) or 0)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Jungle Grid lead-hunting pipeline")
    subparsers = parser.add_subparsers(dest="command")

    discover_parser = subparsers.add_parser("discover", help="Fetch raw leads from configured sources")
    _add_config_arg(discover_parser)
    discover_parser.add_argument(
        "--source",
        action="append",
        choices=[source.value for source in LeadSource],
        help="Optional source filter. Can be repeated.",
    )
    discover_parser.add_argument("--output-dir", type=Path, help="Override raw output directory.")
    discover_parser.set_defaults(handler=_handle_discover)

    normalize_parser = subparsers.add_parser("normalize", help="Normalize raw lead files and apply relevance filters")
    _add_config_arg(normalize_parser)
    normalize_parser.add_argument("--input-file", action="append", type=Path, help="Specific raw file to normalize.")
    normalize_parser.add_argument("--input-dir", type=Path, help="Directory containing raw files.")
    normalize_parser.add_argument("--output", type=Path, help="Override normalized output path.")
    normalize_parser.set_defaults(handler=_handle_normalize)

    dedupe_parser = subparsers.add_parser("dedupe", help="Collapse exact and near-duplicate qualified leads")
    _add_config_arg(dedupe_parser)
    dedupe_parser.add_argument("--input", type=Path, help="Override normalized input path.")
    dedupe_parser.add_argument("--output", type=Path, help="Override deduped output path.")
    dedupe_parser.set_defaults(handler=_handle_dedupe)

    classify_parser = subparsers.add_parser("classify", help="Classify lead pain themes")
    _add_config_arg(classify_parser)
    classify_parser.add_argument("--input", type=Path, help="Override deduped input path.")
    classify_parser.add_argument("--output", type=Path, help="Override classified output path.")
    classify_parser.set_defaults(handler=_handle_classify)

    score_parser = subparsers.add_parser("score", help="Score Jungle Grid fit")
    _add_config_arg(score_parser)
    score_parser.add_argument("--input", type=Path, help="Override classified input path.")
    score_parser.add_argument("--output", type=Path, help="Override scored output path.")
    score_parser.set_defaults(handler=_handle_score)

    draft_parser = subparsers.add_parser("draft", help="Create outreach drafts for high-fit leads")
    _add_config_arg(draft_parser)
    draft_parser.add_argument("--input", type=Path, help="Override scored input path.")
    draft_parser.add_argument("--output", type=Path, help="Override draft output path.")
    draft_parser.set_defaults(handler=_handle_draft)

    queue_parser = subparsers.add_parser("queue", help="Build outreach_queue.json")
    _add_config_arg(queue_parser)
    queue_parser.add_argument("--input", type=Path, help="Override draft input path.")
    queue_parser.add_argument("--output", type=Path, help="Override queue output path.")
    queue_parser.set_defaults(handler=_handle_queue)

    run_all_parser = subparsers.add_parser("run-all", help="Run the full pipeline in order")
    _add_config_arg(run_all_parser)
    run_all_parser.add_argument(
        "--source",
        action="append",
        choices=[source.value for source in LeadSource],
        help="Optional source filter. Can be repeated.",
    )
    run_all_parser.set_defaults(handler=_handle_run_all)

    task_parser = subparsers.add_parser("task", help="Run a package stage through the OpenClaw task wrapper")
    _add_config_arg(task_parser)
    task_parser.add_argument("stage", choices=TASK_STAGE_CHOICES, help="Task stage to execute.")
    task_parser.add_argument(
        "--source",
        action="append",
        choices=[source.value for source in LeadSource],
        help="Optional source filter for discover or pipeline tasks. Can be repeated.",
    )
    task_parser.add_argument("--input", type=Path, help="Optional input override for file-based tasks.")
    task_parser.add_argument("--output", type=Path, help="Optional output override for file-based tasks.")
    task_parser.add_argument("--output-dir", type=Path, help="Optional raw output directory override for discover.")
    task_parser.add_argument("--manifest-dir", type=Path, help="Directory for task manifests.")
    task_parser.add_argument("--manifest-path", type=Path, help="Exact manifest path override.")
    task_parser.set_defaults(handler=_handle_task)

    contracts_parser = subparsers.add_parser("task-contracts", help="Print OpenClaw task contracts as JSON")
    _add_config_arg(contracts_parser)
    contracts_parser.add_argument("--stage", choices=TASK_STAGE_CHOICES, help="Optional single-stage contract.")
    contracts_parser.set_defaults(handler=_handle_task_contracts)

    return parser


def _add_config_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", default="config/settings.yaml", help="Path to pipeline config YAML.")


def _parse_sources(values: list[str] | None) -> list[LeadSource] | None:
    if not values:
        return None
    return [LeadSource(value) for value in values]


def _handle_discover(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    files, total = discover.run(
        config,
        selected_sources=_parse_sources(args.source),
        output_dir=args.output_dir,
    )
    print(f"discovered={total} files={len(files)}")
    return 0


def _handle_normalize(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    leads = normalize.run(config, input_paths=args.input_file, input_dir=args.input_dir, output_path=args.output)
    print(f"normalized={len(leads)}")
    return 0


def _handle_dedupe(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    leads = dedupe.run(config, input_path=args.input, output_path=args.output)
    print(f"deduped={len(leads)}")
    return 0


def _handle_classify(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    leads = classify.run(config, input_path=args.input, output_path=args.output)
    print(f"classified={len(leads)}")
    return 0


def _handle_score(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    leads = score.run(config, input_path=args.input, output_path=args.output)
    print(f"scored={len(leads)}")
    return 0


def _handle_draft(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    leads = draft.run(config, input_path=args.input, output_path=args.output)
    drafted_count = len([lead for lead in leads if lead.outreach is not None])
    print(f"drafts={drafted_count}")
    return 0


def _handle_queue(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    leads = queue.run(config, input_path=args.input, output_path=args.output)
    print(f"queued={len(leads)}")
    return 0


def _handle_run_all(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    summary = run_all(config, selected_sources=_parse_sources(args.source))
    print(" ".join(f"{key}={value}" for key, value in summary.items()))
    return 0


def _handle_task(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    manifest = run_task(
        args.stage,
        config,
        config_path=args.config,
        selected_sources=_parse_sources(args.source),
        input_path=args.input,
        output_path=args.output,
        output_dir=args.output_dir,
        manifest_dir=args.manifest_dir,
        manifest_path=args.manifest_path,
    )
    print(manifest.model_dump_json(indent=2))
    return 0 if manifest.success else 1


def _handle_task_contracts(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    contracts = describe_contracts(config, stage=args.stage)
    if hasattr(contracts, "model_dump"):
        payload = contracts.model_dump(mode="json")
    else:
        payload = {key: value.model_dump(mode="json") for key, value in contracts.items()}
    print(json.dumps(payload, indent=2))
    return 0
