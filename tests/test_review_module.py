from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

from src import pipeline, review
from src.models import LeadRecord, ReplyQueueItem
from src.storage import write_json_items, write_leads

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def review_scratch_dir() -> Path:
    root = ROOT / "test_runs" / f"review-{uuid.uuid4().hex[:8]}"
    root.mkdir(parents=True, exist_ok=True)
    yield root
    shutil.rmtree(root, ignore_errors=True)


def test_review_store_updates_both_files(review_scratch_dir: Path) -> None:
    top_path = review_scratch_dir / "top_leads.json"
    reply_path = review_scratch_dir / "reply_queue.json"
    lead = _lead("lead-1")
    reply_item = _reply("lead-1")
    write_leads(top_path, [lead])
    write_json_items(reply_path, [reply_item])

    store = review.ReviewStore(top_path=top_path, reply_path=reply_path)
    store.apply_action("lead-1", "approve")
    store.choose_variant("lead-1", "v2")
    store.append_note("lead-1", "Worth a manual follow-up.")
    store.apply_action("lead-1", "contacted")
    store.mark_custom_reply_written("lead-1")

    saved_lead = json.loads(top_path.read_text(encoding="utf-8"))[0]
    saved_reply = json.loads(reply_path.read_text(encoding="utf-8"))[0]

    assert saved_lead["review_status"] == "approved"
    assert saved_reply["review_status"] == "approved"
    assert saved_lead["outreach_status"] == "contacted"
    assert saved_reply["outreach_status"] == "contacted"
    assert saved_lead["approved_reply_variant"] == "custom"
    assert saved_reply["approved_reply_variant"] == "custom"
    assert saved_lead["custom_reply_written"] is True
    assert saved_reply["custom_reply_written"] is True
    assert saved_lead["notes"] == ["Worth a manual follow-up."]
    assert saved_reply["notes"] == ["Worth a manual follow-up."]
    assert saved_lead["last_reviewed_at"] is not None
    assert saved_lead["last_outreach_action_at"] is not None


def test_apply_filters_supports_pending_search_and_score_thresholds() -> None:
    item_a = review.ReviewItem(
        lead=_lead("a", username="alice", complaint="RunPod is unreliable for production inference", fit_score=8, final_score=7.6),
        reply=_reply("a"),
    )
    item_b = review.ReviewItem(
        lead=_lead("b", username="bob", complaint="Which GPU should we pick for L40S or H100", fit_score=7, final_score=6.7),
        reply=_reply("b"),
    )
    item_b.lead.review_status = "approved"
    item_c = review.ReviewItem(
        lead=_lead("c", username="charlie", complaint="Deployment latency is hurting users", fit_score=6, final_score=5.5),
        reply=_reply("c"),
    )

    filters = review.ReviewFilters(only_pending_review=True, search="runpod", fit_score_min=7, final_score_min=7.0)
    results = review.apply_filters([item_a, item_b, item_c], filters)

    assert [item.id for item in results] == ["a"]


def test_pipeline_review_command_routes_to_interactive(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}

    def fake_interactive_review():
        captured["called"] = True
        return 0

    monkeypatch.setattr(pipeline.review, "interactive_review", fake_interactive_review)
    exit_code = pipeline.main(["review"])

    assert exit_code == 0
    assert captured["called"] is True


def _lead(
    identifier: str,
    *,
    username: str = "founder",
    complaint: str = "RunPod retries are blocking our production inference pipeline.",
    fit_score: int = 8,
    final_score: float = 7.4,
) -> LeadRecord:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    return LeadRecord(
        id=identifier,
        date_found=now,
        platform="reddit",
        username=username,
        profile_url=f"https://reddit.com/u/{username}",
        post_url=f"https://reddit.com/r/mlops/comments/{identifier}",
        post_date=now,
        exact_complaint=complaint,
        pain_type="provider_pain",
        fit_score=fit_score,
        final_score=final_score,
    )


def _reply(identifier: str) -> ReplyQueueItem:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    return ReplyQueueItem(
        lead_id=identifier,
        platform="reddit",
        username="founder",
        profile_url="https://reddit.com/u/founder",
        post_url=f"https://reddit.com/r/mlops/comments/{identifier}",
        post_date=now,
        exact_complaint="RunPod retries are blocking our production inference pipeline.",
        pain_type="provider_pain",
        fit_score=8,
        final_score=7.4,
        personalized_opener="founder, saw your post. The part about retries sounds familiar. Is the bigger issue reliability or queue time?",
        opener_v1="v1",
        opener_v2="v2",
        opener_v3="v3",
        reply_angle="provider_instability",
        diagnostic_question="Is the bigger issue reliability or queue time?",
        why_this_reply_fits="It mirrors provider pain and opens a conversation.",
        confidence_score=8,
        recommended_variant="v1",
    )
