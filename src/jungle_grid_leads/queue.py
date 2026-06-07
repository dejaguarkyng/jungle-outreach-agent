from __future__ import annotations

from pathlib import Path

from .config import PipelineConfig
from .json_io import read_model_list, write_models
from .models import DraftedLead, LeadCategory, OutreachQueueItem
from .text_utils import truncate


def run(
    config: PipelineConfig,
    input_path: Path | None = None,
    output_path: Path | None = None,
) -> list[OutreachQueueItem]:
    leads = read_model_list(input_path or config.paths.drafts_path, DraftedLead)
    eligible: list[OutreachQueueItem] = []

    for lead in leads:
        if (
            lead.classification.category == LeadCategory.NON_FIT
            or lead.score.fit_score < config.scoring.outreach_threshold
            or lead.outreach is None
        ):
            continue

        eligible.append(
            OutreachQueueItem(
                lead_id=lead.lead_id,
                source=lead.source,
                url=lead.url,
                author=lead.author,
                created_at=lead.created_at,
                category=lead.classification.category,
                fit_score=lead.score.fit_score,
                pain_summary=truncate(lead.complaint_text, 180),
                why_jungle_grid=lead.outreach.why_jungle_grid,
                draft_subject=lead.outreach.subject,
                draft_message=lead.outreach.message,
                manual_status="pending_review",
            )
        )

    eligible.sort(key=lambda item: (item.fit_score, item.created_at), reverse=True)
    if config.scoring.queue_limit > 0:
        eligible = eligible[: config.scoring.queue_limit]

    write_models(output_path or config.paths.outreach_queue_path, eligible)
    return eligible
