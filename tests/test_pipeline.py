from __future__ import annotations

from datetime import datetime, timezone

from jungle_grid_leads import classify, dedupe, draft, normalize, queue, score
from jungle_grid_leads.json_io import write_models
from jungle_grid_leads.models import LeadCategory, LeadSource, RawLead


def test_pipeline_end_to_end_with_heuristics(pipeline_config) -> None:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    raw_path = pipeline_config.paths.raw_dir / "reddit" / "fixture.json"
    raw_leads = [
        RawLead(
            lead_id="lead-1",
            source=LeadSource.REDDIT,
            query="gpu provider pain",
            url="https://www.reddit.com/r/mlops/comments/abc/provider-pain/?utm_source=test",
            title="GPU provider quotas are blocking our team",
            author="alice",
            created_at=now,
            fetched_at=now,
            text="We cannot get H100 instances from our current provider and need an alternative for production.",
            metadata={"query_theme": "provider_pain"},
        ),
        RawLead(
            lead_id="lead-1-dup",
            source=LeadSource.REDDIT,
            query="gpu provider pain",
            url="https://reddit.com/r/mlops/comments/abc/provider-pain/?ref=feed",
            title="GPU provider quotas are blocking our team",
            author="alice",
            created_at=now,
            fetched_at=now,
            text="We cannot get H100 instances from our current provider and need an alternative for production.",
            metadata={"query_theme": "provider_pain"},
        ),
        RawLead(
            lead_id="lead-2",
            source=LeadSource.HACKERNEWS,
            query="llm deployment pain",
            url="https://news.ycombinator.com/item?id=999",
            title="Inference deployment keeps failing",
            author="bob",
            created_at=now,
            fetched_at=now,
            text="Our team is blocked shipping a production inference stack. Kubernetes GPU deployment and latency are painful.",
            metadata={"query_theme": "deployment_pain"},
        ),
        RawLead(
            lead_id="lead-3",
            source=LeadSource.REDDIT,
            query="which gpu for llm",
            url="https://reddit.com/r/buildapc/comments/zzz/rtx_question/",
            title="Which GPU should I buy for gaming?",
            author="carol",
            created_at=now,
            fetched_at=now,
            text="Need more FPS in Fortnite and Apex.",
            metadata={"query_theme": "gpu_selection_pain"},
        ),
    ]

    write_models(raw_path, raw_leads)
    normalized = normalize.run(pipeline_config, input_paths=[raw_path])
    deduped = dedupe.run(pipeline_config)
    classified = classify.run(pipeline_config)
    scored = score.run(pipeline_config)
    drafted = draft.run(pipeline_config)
    queued = queue.run(pipeline_config)

    assert len(normalized) == 3
    assert len(deduped) == 2
    assert {lead.classification.category for lead in classified} == {
        LeadCategory.PROVIDER_PAIN,
        LeadCategory.DEPLOYMENT_PAIN,
    }
    assert max(lead.score.fit_score for lead in scored) >= 7
    assert len([lead for lead in drafted if lead.outreach is not None]) == 2
    assert len(queued) == 2


def test_dedupe_merges_similar_complaints_from_same_author(pipeline_config) -> None:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    raw_path = pipeline_config.paths.raw_dir / "reddit" / "similar.json"
    raw_leads = [
        RawLead(
            lead_id="a",
            source=LeadSource.REDDIT,
            query="gpu provider pain",
            url="https://reddit.com/r/mlops/comments/one/provider/",
            title="Need a better GPU provider",
            author="same_user",
            created_at=now,
            fetched_at=now,
            text="Our team can't get H100 capacity and needs another provider.",
            metadata={},
        ),
        RawLead(
            lead_id="b",
            source=LeadSource.REDDIT,
            query="gpu provider pain",
            url="https://reddit.com/r/mlops/comments/two/provider/",
            title="Need a better GPU provider",
            author="same_user",
            created_at=now,
            fetched_at=now,
            text="We cannot get H100 instances from the current provider and need an alternative.",
            metadata={},
        ),
    ]

    write_models(raw_path, raw_leads)
    normalize.run(pipeline_config, input_paths=[raw_path], output_path=pipeline_config.paths.normalized_path)
    deduped = dedupe.run(pipeline_config)

    assert len(deduped) == 1
    assert "complaint_similarity_match" in deduped[0].dedupe_reasons
