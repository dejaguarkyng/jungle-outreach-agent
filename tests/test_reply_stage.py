from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

from src import pipeline, reply
from src.models import LeadRecord, ScoringConfig, ScoringThresholds, ScoringWeights

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def reply_scratch_dir() -> Path:
    root = ROOT / "test_runs" / f"reply-{uuid.uuid4().hex[:8]}"
    root.mkdir(parents=True, exist_ok=True)
    yield root
    shutil.rmtree(root, ignore_errors=True)


def test_reply_generation_filters_and_builds_variants(reply_scratch_dir: Path) -> None:
    scoring_config = ScoringConfig(
        thresholds=ScoringThresholds(fit_score_min=7, final_score_min=6.5),
        weights=ScoringWeights(),
        recency_rules=[],
    )
    leads = [
        _lead(
            "provider",
            "RunPod retries are blocking our production inference pipeline and billing spend keeps rising.",
            pain_type="provider_pain",
            fit_score=9,
            final_score=8.2,
        ),
        _lead(
            "gpu",
            "We are stuck choosing between H100 and L40S for a customer-facing deployment.",
            pain_type="gpu_selection_pain",
            fit_score=7,
            final_score=6.8,
        ),
        _lead(
            "skip",
            "This looks like a local CUDA stack trace issue.",
            pain_type="deployment_pain",
            fit_score=8,
            final_score=7.2,
        ),
        _lead(
            "weak",
            "Provider is annoying sometimes.",
            pain_type="provider_pain",
            fit_score=6,
            final_score=7.5,
        ),
    ]

    output_path = reply_scratch_dir / "reply_queue.json"
    queue = reply.run(leads, scoring_config=scoring_config, output_path=output_path)

    assert len(queue) == 2
    assert queue[0].reply_angle in {
        "provider_instability",
        "gpu_selection_confusion",
        "deployment_pain",
        "cost_waste",
        "fallback_generic",
    }
    assert queue[0].recommended_variant in {"v1", "v2", "v3"}
    assert queue[0].personalized_opener in {queue[0].opener_v1, queue[0].opener_v2, queue[0].opener_v3}
    assert queue[0].review_status == "pending"
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert len(payload) == 2


def test_reply_stage_reads_top_leads_and_writes_reply_queue(reply_scratch_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    top_path = reply_scratch_dir / "top_leads.json"
    reply_path = reply_scratch_dir / "reply_queue.json"
    payload = [
        _lead(
            "deploy",
            "Inference latency is unstable in production and retries are piling up for users.",
            pain_type="deployment_pain",
            fit_score=8,
            final_score=7.4,
        ).model_dump(mode="json"),
    ]
    top_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    monkeypatch.setattr(reply, "TOP_LEADS_PATH", top_path)
    monkeypatch.setattr(reply, "REPLY_QUEUE_PATH", reply_path)

    queue = reply.run()

    assert len(queue) == 1
    assert queue[0].reply_angle == "deployment_pain"
    saved = json.loads(reply_path.read_text(encoding="utf-8"))
    assert saved[0]["review_status"] == "pending"


def test_pipeline_reply_command_uses_existing_top_leads(reply_scratch_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}

    def fake_run(*args, **kwargs):
        captured["called"] = True
        return []

    monkeypatch.setattr(pipeline.reply, "run", fake_run)

    exit_code = pipeline.main(["reply"])

    assert exit_code == 0
    assert captured["called"] is True


def _lead(identifier: str, complaint: str, *, pain_type: str, fit_score: int, final_score: float) -> LeadRecord:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    return LeadRecord(
        id=identifier,
        date_found=now,
        platform="reddit",
        username="founder",
        profile_url="https://reddit.com/u/founder",
        post_url=f"https://reddit.com/r/mlops/comments/{identifier}",
        post_date=now,
        exact_complaint=complaint,
        pain_type=pain_type,
        fit_score=fit_score,
        final_score=final_score,
    )
