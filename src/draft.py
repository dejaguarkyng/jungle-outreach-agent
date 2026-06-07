from __future__ import annotations

from . import llm
from .common import clip_text
from .logging_utils import get_logger
from .models import LeadRecord, ScoringConfig
from .settings import PROMPTS_DIR, QUALIFIED_LEADS_PATH, load_scoring_config
from .storage import read_leads, write_leads


def run(
    leads: list[LeadRecord] | None = None,
    *,
    scoring_config: ScoringConfig | None = None,
    input_path=None,
    output_path=None,
) -> list[LeadRecord]:
    logger = get_logger()
    config = scoring_config or load_scoring_config()
    current = leads or read_leads(input_path or QUALIFIED_LEADS_PATH)
    qualified: list[LeadRecord] = []

    for lead in current:
        reason = _drop_reason(lead, config)
        if reason is not None:
            lead.status = "filtered_out"
            logger.info("dropped_lead stage=draft reason=%s post_url=%s", reason, lead.post_url)
            continue

        lead.suggested_reply = _draft_reply(lead, logger)
        lead.status = "ready_for_review"
        qualified.append(lead)

    qualified.sort(key=lambda item: (item.final_score, item.post_date), reverse=True)
    write_leads(output_path or QUALIFIED_LEADS_PATH, qualified)
    return qualified


def _draft_reply(lead: LeadRecord, logger=None) -> str:
    if llm.available():
        try:
            result = _llm_draft(lead)
            if result:
                if logger:
                    logger.info("draft_llm_generated lead_id=%s", lead.id)
                return result
        except Exception as exc:
            if logger:
                logger.warning("draft_llm_failed lead_id=%s error=%s", lead.id, exc)
    return _template_draft(lead)


def _llm_draft(lead: LeadRecord) -> str:
    system = (PROMPTS_DIR / "drafter.md").read_text(encoding="utf-8")
    user = f"Post complaint: {clip_text(lead.exact_complaint, 800)}\nPain category: {lead.pain_type}"
    result = llm.call_json(system, user)
    return str(result.get("suggested_reply", "")).strip()


def _template_draft(lead: LeadRecord) -> str:
    opener = {
        "provider_pain": "Saw your note about GPU provider friction.",
        "gpu_selection_pain": "Saw your note about GPU selection tradeoffs.",
        "deployment_pain": "Saw your note about inference and deployment pain.",
    }.get(lead.pain_type, "Saw your note.")
    complaint = clip_text(lead.exact_complaint, 180)
    return (
        f"{opener} The part about \"{complaint}\" stood out. "
        "We spend a lot of time helping teams get past exactly this kind of GPU bottleneck. "
        "Happy to compare notes if a short, practical exchange would be useful."
    )


def _drop_reason(lead: LeadRecord, config: ScoringConfig) -> str | None:
    if lead.pain_type == "non_fit":
        return "non_fit"
    if lead.fit_score < config.thresholds.fit_score_min:
        return "fit_score_below_threshold"
    if lead.final_score < config.thresholds.final_score_min:
        return "final_score_below_threshold"
    return None
