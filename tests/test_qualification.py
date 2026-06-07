from __future__ import annotations

from datetime import datetime, timezone

from jungle_grid_leads.models import LeadSource, NormalizedLead
from jungle_grid_leads.qualify import evaluate_lead_relevance, filter_relevant_leads


def test_accepts_allowed_reddit_ai_infra_post(pipeline_config) -> None:
    lead = _normalized_lead(
        url="https://reddit.com/r/LocalLLaMA/comments/abc/provider-pain/",
        title="GPU provider outages are breaking inference",
        complaint="Our LLM inference deployment keeps failing when GPU capacity disappears.",
        subreddit="LocalLLaMA",
    )

    decision = evaluate_lead_relevance(lead, pipeline_config.qualification)

    assert decision.accepted is True
    assert "gpu" in decision.matched_ai_terms
    assert "inference" in decision.matched_ai_terms


def test_rejects_disallowed_subreddit_even_with_gpu_terms(pipeline_config) -> None:
    lead = _normalized_lead(
        url="https://reddit.com/r/buildapc/comments/abc/gpu-question/",
        title="GPU issue for my setup",
        complaint="I am confused about this GPU purchase for my home PC.",
        subreddit="buildapc",
    )

    decision = evaluate_lead_relevance(lead, pipeline_config.qualification)

    assert decision.accepted is False
    assert decision.reason == "reddit_subreddit_not_allowed"


def test_rejects_missing_ai_relevance_on_allowed_subreddit(pipeline_config) -> None:
    lead = _normalized_lead(
        url="https://reddit.com/r/MLOps/comments/abc/general-discussion/",
        title="Team advice request",
        complaint="How do you organize meetings and handoffs across a busy team?",
        subreddit="MLOps",
    )

    decision = evaluate_lead_relevance(lead, pipeline_config.qualification)

    assert decision.accepted is False
    assert decision.reason == "missing_ai_relevance"


def test_rejects_hard_reject_topics_before_downstream_scoring(pipeline_config) -> None:
    accepted = _normalized_lead(
        url="https://reddit.com/r/MLOps/comments/keep/inference/",
        title="Inference deployment is blocked on GPU capacity",
        complaint="Our deployment is stuck because we keep losing GPU instances for inference.",
        subreddit="MLOps",
    )
    rejected = _normalized_lead(
        url="https://reddit.com/r/LocalLLaMA/comments/drop/gaming/",
        title="Need a GPU for gaming",
        complaint="I mainly want better FPS in Fortnite and Minecraft on my next GPU.",
        subreddit="LocalLLaMA",
    )

    qualified = filter_relevant_leads([accepted, rejected], pipeline_config.qualification)

    assert [lead.lead_id for lead in qualified] == [accepted.lead_id]


def _normalized_lead(
    *,
    url: str,
    title: str,
    complaint: str,
    subreddit: str,
) -> NormalizedLead:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    return NormalizedLead(
        lead_id=url.rsplit("/", 2)[-2],
        source=LeadSource.REDDIT,
        query="gpu provider pain",
        url=url,
        canonical_url=url,
        title=title,
        author="alice",
        created_at=now,
        fetched_at=now,
        complaint_text=complaint,
        full_text=f"{title} {complaint}",
        pain_hints=[],
        metadata={"subreddit": subreddit},
    )
