from __future__ import annotations

import sys
from pathlib import Path
import shutil
import uuid

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from jungle_grid_leads.config import (  # noqa: E402
    CompanyConfig,
    DedupeConfig,
    DiscoveryConfig,
    LLMConfig,
    PathsConfig,
    PipelineConfig,
    ScoringConfig,
    SourceSettings,
)


@pytest.fixture
def pipeline_config() -> PipelineConfig:
    scratch_root = ROOT / "test_runs"
    scratch_root.mkdir(exist_ok=True)
    run_root = scratch_root / f"pipeline-{uuid.uuid4().hex[:8]}"
    run_root.mkdir(parents=True, exist_ok=True)
    data_dir = run_root / "data"
    config = PipelineConfig(
        discovery=DiscoveryConfig(
            recent_days=14,
            sources={
                "reddit": SourceSettings(enabled=True, limit_per_query=5),
                "github": SourceSettings(enabled=True, limit_per_query=5),
                "hackernews": SourceSettings(enabled=True, limit_per_query=5),
                "x": SourceSettings(enabled=False, optional=True, limit_per_query=5, bearer_token_env="X_API_BEARER_TOKEN"),
            },
            queries={
                "provider_pain": ["gpu provider pain"],
                "gpu_selection_pain": ["which gpu for llm"],
                "deployment_pain": ["llm deployment pain"],
            },
        ),
        dedupe=DedupeConfig(complaint_similarity_threshold=0.75),
        llm=LLMConfig(mode="heuristic"),
        scoring=ScoringConfig(outreach_threshold=7, queue_limit=10),
        company=CompanyConfig(
            company_name="Jungle Grid",
            company_pitch="Jungle Grid helps teams choose GPUs and deploy AI workloads faster.",
        ),
        paths=PathsConfig(
            raw_dir=data_dir / "raw",
            normalized_path=data_dir / "normalized" / "leads.json",
            deduped_path=data_dir / "processed" / "deduped_leads.json",
            classified_path=data_dir / "enriched" / "classified.json",
            scored_path=data_dir / "enriched" / "scored.json",
            drafts_path=data_dir / "outreach" / "drafts.json",
            outreach_queue_path=run_root / "outreach_queue.json",
            prompts_dir=ROOT / "prompts",
        ),
    )
    yield config
    shutil.rmtree(run_root, ignore_errors=True)
