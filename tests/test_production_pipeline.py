from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from src import classify, collect, dedupe, draft, pipeline, score
from src.models import LeadRecord, PipelineStats, RawCandidate, ScoringConfig, ScoringThresholds, ScoringWeights, SourceAdapterConfig, SourcesConfig

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def scratch_dir() -> Path:
    root = ROOT / "test_runs" / f"prod-{uuid.uuid4().hex[:8]}"
    root.mkdir(parents=True, exist_ok=True)
    yield root
    shutil.rmtree(root, ignore_errors=True)


def test_collect_applies_strict_timestamp_filtering(scratch_dir: Path) -> None:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    output_path = scratch_dir / "raw.json"
    sources_config = SourcesConfig(
        max_age_days=14,
        adapters={"fake": SourceAdapterConfig(enabled=True, limit_per_query=10)},
        queries={"provider_pain": ["gpu provider pain"]},
    )

    def fake_adapter(settings, queries, now_utc, client):
        return [
            RawCandidate(
                platform="reddit",
                username="fresh",
                profile_url="https://example.com/fresh",
                post_url="https://reddit.com/r/mlops/comments/fresh",
                post_date="2026-04-08T10:00:00+02:00",
                complaint_text="RunPod retries are blocking production inference.",
            ),
            RawCandidate(
                platform="reddit",
                username="old",
                profile_url="https://example.com/old",
                post_url="https://reddit.com/r/mlops/comments/old",
                post_date=(now - timedelta(days=20)).isoformat(),
                complaint_text="Old complaint",
            ),
            RawCandidate(
                platform="reddit",
                username="missing",
                profile_url="https://example.com/missing",
                post_url="https://reddit.com/r/mlops/comments/missing",
                post_date=None,
                complaint_text="No timestamp",
            ),
        ]

    leads, stats = collect.run(
        now_utc=now,
        sources_config=sources_config,
        adapter_registry={"fake": fake_adapter},
        output_path=output_path,
    )

    assert stats.collected == 3
    assert stats.filtered == 2
    assert len(leads) == 1
    assert leads[0].post_date.tzinfo is not None
    assert leads[0].post_date.utcoffset() == timedelta(0)
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert len(payload) == 1


def test_dedupe_uses_seen_memory_and_fuzzy_similarity(scratch_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    seen_urls_path = scratch_dir / "seen_urls.json"
    seen_hashes_path = scratch_dir / "seen_hashes.json"
    qualified_path = scratch_dir / "qualified.json"
    seen_urls_path.write_text(json.dumps(["https://reddit.com/r/mlops/comments/seen"]), encoding="utf-8")
    seen_hashes_path.write_text("[]", encoding="utf-8")
    monkeypatch.setattr(dedupe, "SEEN_URLS_PATH", seen_urls_path)
    monkeypatch.setattr(dedupe, "SEEN_HASHES_PATH", seen_hashes_path)

    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    leads = [
        _lead(
            "seen",
            "https://reddit.com/r/mlops/comments/seen",
            "RunPod retries are blocking our inference deployment.",
            now,
        ),
        _lead(
            "a",
            "https://reddit.com/r/mlops/comments/a",
            "RunPod retries are blocking our inference deployment.",
            now,
        ),
            _lead(
                "b",
                "https://reddit.com/r/mlops/comments/b",
                "RunPod retry loops are blocking our inference deployment.",
                now,
            ),
        _lead(
            "c",
            "https://reddit.com/r/mlops/comments/c",
            "Which GPU should we pick for production inference cost?",
            now,
        ),
    ]
    scoring_config = ScoringConfig(
        thresholds=ScoringThresholds(similarity_threshold=0.55),
        weights=ScoringWeights(),
        recency_rules=[],
    )

    survivors, stats = dedupe.run(
        leads,
        scoring_config=scoring_config,
        output_path=qualified_path,
        persist_seen=True,
    )

    assert len(survivors) == 2
    assert stats.filtered == 2
    persisted_urls = json.loads(seen_urls_path.read_text(encoding="utf-8"))
    assert any(
        url in persisted_urls
        for url in [
            "https://reddit.com/r/mlops/comments/a",
            "https://reddit.com/r/mlops/comments/b",
        ]
    )
    assert "https://reddit.com/r/mlops/comments/c" in persisted_urls


def test_score_applies_weighted_formula_and_recency_boost(scratch_dir: Path) -> None:
    now = datetime.now(timezone.utc)
    lead = _lead(
        "score",
        "https://reddit.com/r/mlops/comments/score",
        "RunPod retries are blocking our production inference endpoint and billing spend is getting expensive.",
        now - timedelta(hours=5),
        pain_type="provider_pain",
    )
    output_path = scratch_dir / "scored.json"
    scoring_config = ScoringConfig(
        thresholds=ScoringThresholds(final_score_min=6.0, fit_score_min=7),
        weights=ScoringWeights(pain_score=0.4, urgency_score=0.3, budget_signal=0.2, production_usage=0.1),
        recency_rules=[
            {"max_age_hours": 24, "boost": 2},
            {"max_age_hours": 72, "boost": 1},
            {"max_age_hours": 336, "boost": 0},
        ],
        penalties={"low_fit_terms": ["cuda"]},
    )

    scored = score.run([lead], scoring_config=scoring_config, output_path=output_path)

    assert len(scored) == 1
    assert scored[0].recency_boost == 2
    expected = round(
        (scored[0].pain_score * 0.4)
        + (scored[0].urgency_score * 0.3)
        + (scored[0].budget_signal * 0.2)
        + (scored[0].production_usage * 0.1)
        + 2,
        2,
    )
    assert scored[0].final_score == expected
    assert scored[0].fit_score >= 7


def test_run_all_limits_top_leads_and_skips_seen_on_second_run(
    scratch_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    raw_path = scratch_dir / "raw.json"
    qualified_path = scratch_dir / "qualified.json"
    top_path = scratch_dir / "top.json"
    seen_urls_path = scratch_dir / "seen_urls.json"
    seen_hashes_path = scratch_dir / "seen_hashes.json"
    seen_urls_path.write_text("[]", encoding="utf-8")
    seen_hashes_path.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(collect, "RAW_LEADS_PATH", raw_path)
    monkeypatch.setattr(dedupe, "RAW_LEADS_PATH", raw_path)
    monkeypatch.setattr(dedupe, "QUALIFIED_LEADS_PATH", qualified_path)
    monkeypatch.setattr(dedupe, "SEEN_URLS_PATH", seen_urls_path)
    monkeypatch.setattr(dedupe, "SEEN_HASHES_PATH", seen_hashes_path)
    monkeypatch.setattr(classify, "QUALIFIED_LEADS_PATH", qualified_path)
    monkeypatch.setattr(score, "QUALIFIED_LEADS_PATH", qualified_path)
    monkeypatch.setattr(draft, "QUALIFIED_LEADS_PATH", qualified_path)
    monkeypatch.setattr(pipeline, "TOP_LEADS_PATH", top_path)

    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    sources_config = SourcesConfig(
        max_age_days=14,
        adapters={"fake": SourceAdapterConfig(enabled=True, limit_per_query=20)},
        queries={"provider_pain": ["runpod retries"]},
    )
    scoring_config = ScoringConfig(
        thresholds=ScoringThresholds(final_score_min=6.0, fit_score_min=7, top_n=10, similarity_threshold=0.9999),
        weights=ScoringWeights(),
        recency_rules=[
            {"max_age_hours": 24, "boost": 2},
            {"max_age_hours": 72, "boost": 1},
            {"max_age_hours": 336, "boost": 0},
        ],
        penalties={"low_fit_terms": ["cuda", "framework bug"]},
    )

    def fake_adapter(settings, queries, now_utc, client):
        complaints = [
            "RunPod retries are blocking our production inference pipeline for video moderation and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for legal search and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for support copilots and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for medical triage and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for fraud review and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for ad ranking and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for speech cleanup and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for contract review and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for image tagging and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for onboarding assistants and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for customer support and billing spend keeps rising for paying users.",
            "RunPod retries are blocking our production inference pipeline for document parsing and billing spend keeps rising for paying users.",
        ]
        return [
            RawCandidate(
                platform="reddit",
                username=f"user{i}",
                profile_url=f"https://reddit.com/u/user{i}",
                post_url=f"https://reddit.com/r/mlops/comments/{i}",
                post_date=(now - timedelta(hours=i)).isoformat(),
                complaint_text=complaints[i],
            )
            for i in range(12)
        ]

    first = pipeline.run_all(
        now_utc=now,
        sources_config=sources_config,
        scoring_config=scoring_config,
        adapter_registry={"fake": fake_adapter},
    )
    top_payload = json.loads(top_path.read_text(encoding="utf-8"))
    assert first.qualified == 12
    assert len(top_payload) == 10

    second = pipeline.run_all(
        now_utc=now,
        sources_config=sources_config,
        scoring_config=scoring_config,
        adapter_registry={"fake": fake_adapter},
    )
    second_top = json.loads(top_path.read_text(encoding="utf-8"))
    assert second.qualified == 0
    assert second_top == []


def test_runner_run_once_uses_pipeline_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    import runner

    captured: dict[str, int] = {}

    def fake_run_all():
        captured["called"] = 1
        return PipelineStats(collected=5, filtered=3, qualified=2)

    monkeypatch.setattr(runner, "run_all", fake_run_all)
    runner.run_once()
    assert captured["called"] == 1


def _lead(identifier: str, post_url: str, complaint: str, post_date: datetime, pain_type: str = "unclassified") -> LeadRecord:
    return LeadRecord(
        id=identifier,
        date_found=post_date,
        platform="reddit",
        username="user",
        profile_url="https://reddit.com/u/user",
        post_url=post_url,
        post_date=post_date,
        exact_complaint=complaint,
        pain_type=pain_type,
    )
