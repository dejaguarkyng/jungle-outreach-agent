from __future__ import annotations

from . import llm
from .common import clip_text, normalize_for_similarity
from .logging_utils import get_logger
from .models import LeadRecord, ReplyQueueItem, ScoringConfig
from .review_state import merge_reply_review_state
from .settings import PROMPTS_DIR, REPLY_QUEUE_PATH, TOP_LEADS_PATH, load_scoring_config
from .storage import read_json_queue_leads, read_reply_queue, write_json_items

ANGLE_PROVIDER_INSTABILITY = "provider_instability"
ANGLE_GPU_SELECTION = "gpu_selection_confusion"
ANGLE_DEPLOYMENT = "deployment_pain"
ANGLE_COST_WASTE = "cost_waste"
ANGLE_FALLBACK = "fallback_generic"

LIBRARY_BUG_TERMS = (
    "cuda",
    "cudnn",
    "framework bug",
    "pytorch bug",
    "tensorflow bug",
    "dependency conflict",
    "segmentation fault",
    "stack trace",
    "local bug",
)


def run(
    leads: list[LeadRecord] | None = None,
    *,
    scoring_config: ScoringConfig | None = None,
    input_path=None,
    output_path=None,
) -> list[ReplyQueueItem]:
    logger = get_logger()
    config = scoring_config or load_scoring_config()
    current = leads if leads is not None else read_json_queue_leads(input_path or TOP_LEADS_PATH)
    queue: list[ReplyQueueItem] = []

    for lead in current:
        reason = _skip_reason(lead, config)
        if reason is not None:
            logger.info("dropped_lead stage=reply reason=%s post_url=%s", reason, lead.post_url)
            continue

        item = _build_reply_item(lead)
        queue.append(item)
        logger.info(
            "reply_generated lead_id=%s angle=%s recommended=%s confidence=%s",
            item.lead_id,
            item.reply_angle,
            item.recommended_variant,
            item.confidence_score,
        )

    target_path = output_path or REPLY_QUEUE_PATH
    queue = merge_reply_review_state(queue, read_reply_queue(target_path))
    write_json_items(target_path, queue)
    return queue


def _skip_reason(lead: LeadRecord, config: ScoringConfig) -> str | None:
    normalized = normalize_for_similarity(lead.exact_complaint)
    if lead.fit_score < config.thresholds.fit_score_min:
        return "fit_score_below_threshold"
    if lead.final_score < config.thresholds.final_score_min:
        return "final_score_below_threshold"
    if any(term in normalized for term in LIBRARY_BUG_TERMS):
        return "framework_or_library_bug"
    return None


def _build_reply_item(lead: LeadRecord) -> ReplyQueueItem:
    angle = _reply_angle(lead)
    complaint = clip_text(lead.exact_complaint, 150)
    question = _diagnostic_question(angle, lead)
    llm_result = _llm_openers(lead, angle, question)
    if llm_result:
        opener_v1 = llm_result["v1"]
        opener_v2 = llm_result["v2"]
        opener_v3 = llm_result["v3"]
    else:
        opener_v1 = _opener_direct(angle, complaint, question, lead)
        opener_v2 = _opener_curious(angle, complaint, question, lead)
        opener_v3 = _opener_opinionated(angle, complaint, question, lead)
    recommended_variant = _recommended_variant(lead, angle)
    personalized = {
        "v1": opener_v1,
        "v2": opener_v2,
        "v3": opener_v3,
    }[recommended_variant]

    return ReplyQueueItem(
        lead_id=lead.id,
        platform=lead.platform,
        username=lead.username,
        profile_url=lead.profile_url,
        post_url=lead.post_url,
        post_date=lead.post_date,
        exact_complaint=lead.exact_complaint,
        pain_type=lead.pain_type,
        fit_score=lead.fit_score,
        final_score=lead.final_score,
        personalized_opener=personalized,
        opener_v1=opener_v1,
        opener_v2=opener_v2,
        opener_v3=opener_v3,
        reply_angle=angle,
        diagnostic_question=question,
        why_this_reply_fits=_why_reply_fits(lead, angle),
        confidence_score=_confidence_score(lead, angle),
        recommended_variant=recommended_variant,
        review_status="pending",
    )


def _reply_angle(lead: LeadRecord) -> str:
    normalized = normalize_for_similarity(lead.exact_complaint)
    # Cost waste overrides if the complaint explicitly signals it
    if any(term in normalized for term in ("cost", "billing", "expensive", "spent", "wasted spend", "budget")):
        if lead.pain_type in {"provider_pain", "deployment_pain", "gpu_selection_pain"}:
            return ANGLE_COST_WASTE
    # Use the classifier's pain_type as the primary signal
    if lead.pain_type == "provider_pain":
        return ANGLE_PROVIDER_INSTABILITY
    if lead.pain_type == "gpu_selection_pain":
        return ANGLE_GPU_SELECTION
    if lead.pain_type == "deployment_pain":
        return ANGLE_DEPLOYMENT
    # Keyword fallback for unclassified leads
    if any(term in normalized for term in ("runpod", "vast", "quota", "preempt", "unreliable", "provider", "capacity")):
        return ANGLE_PROVIDER_INSTABILITY
    if any(term in normalized for term in ("which gpu", "a100", "h100", "l40", "l40s", "vram", "sizing")):
        return ANGLE_GPU_SELECTION
    if any(term in normalized for term in ("deployment", "inference", "serving", "latency", "vllm", "triton", "endpoint")):
        return ANGLE_DEPLOYMENT
    return ANGLE_FALLBACK


def _llm_openers(lead: LeadRecord, angle: str, question: str) -> dict[str, str] | None:
    if not llm.available():
        return None
    logger = get_logger()
    try:
        system = (PROMPTS_DIR / "drafter.md").read_text(encoding="utf-8")
        user = (
            f"Post complaint: {clip_text(lead.exact_complaint, 600)}\n"
            f"Pain category: {lead.pain_type}\n"
            f"Reply angle: {angle}\n"
            f"Diagnostic question to end with: {question}"
        )
        result = llm.call_json(system, user)
        v1 = str(result.get("opener_v1", "")).strip()
        v2 = str(result.get("opener_v2", "")).strip()
        v3 = str(result.get("opener_v3", "")).strip()
        if v1 and v2 and v3:
            logger.info("reply_llm_generated lead_id=%s angle=%s", lead.id, angle)
            return {"v1": v1, "v2": v2, "v3": v3}
    except Exception as exc:
        logger.warning("reply_llm_failed lead_id=%s error=%s", lead.id, exc)
    return None


def _diagnostic_question(angle: str, lead: LeadRecord) -> str:
    if angle == ANGLE_PROVIDER_INSTABILITY:
        return "Is the bigger issue reliability, queue time, or how often you have to reroute around failed capacity?"
    if angle == ANGLE_GPU_SELECTION:
        return "Are you mostly trying to de-risk the wrong GPU choice, or just get to a good enough answer faster?"
    if angle == ANGLE_DEPLOYMENT:
        return "Is the main drag right now serving stability, latency, or the operational overhead around deployment?"
    if angle == ANGLE_COST_WASTE:
        return "Is the spend problem coming more from overprovisioning, retries, or just not knowing where the waste is yet?"
    return "What part of this is actually the most expensive in time right now?"


def _opener_direct(angle: str, complaint: str, question: str, lead: LeadRecord) -> str:
    prefix = _prefix(lead)
    return f"{prefix} The part about \"{complaint}\" sounds familiar. {question}"


def _opener_curious(angle: str, complaint: str, question: str, lead: LeadRecord) -> str:
    prefix = _prefix(lead)
    return f"{prefix} Curious about the complaint around \"{complaint}\". {question}"


def _opener_opinionated(angle: str, complaint: str, question: str, lead: LeadRecord) -> str:
    prefix = _prefix(lead)
    point = {
        ANGLE_PROVIDER_INSTABILITY: "A lot of provider pain turns into routing pain faster than people expect.",
        ANGLE_GPU_SELECTION: "GPU-choice confusion usually gets expensive before it gets obvious.",
        ANGLE_DEPLOYMENT: "Deployment pain usually means the infra path is fighting the workload, not the other way around.",
        ANGLE_COST_WASTE: "Wasted GPU spend usually shows up before teams have clean visibility into why.",
        ANGLE_FALLBACK: "This feels like the kind of issue that hides the real bottleneck until you dig once.",
    }[angle]
    return f"{prefix} {point} When you said \"{complaint}\", that jumped out. {question}"


def _recommended_variant(lead: LeadRecord, angle: str) -> str:
    normalized = normalize_for_similarity(lead.exact_complaint)
    strong = lead.fit_score >= 8 and lead.final_score >= 7.5
    if not strong:
        return "v2"
    if angle in {ANGLE_PROVIDER_INSTABILITY, ANGLE_COST_WASTE} and any(term in normalized for term in ("blocked", "urgent", "retry", "retries")):
        return "v3"
    return "v1"


def _why_reply_fits(lead: LeadRecord, angle: str) -> str:
    if angle == ANGLE_PROVIDER_INSTABILITY:
        return "It mirrors the provider reliability or routing pain in the complaint and opens with one concrete diagnostic question."
    if angle == ANGLE_GPU_SELECTION:
        return "It stays focused on GPU-choice uncertainty without pretending Jungle Grid solves unrelated engineering problems."
    if angle == ANGLE_DEPLOYMENT:
        return "It acknowledges deployment friction directly and invites the lead to clarify the real bottleneck."
    if angle == ANGLE_COST_WASTE:
        return "It leans into wasted spend only because the complaint explicitly signals cost or billing pain."
    return "It keeps the tone exploratory because the fit is weaker or the complaint is less specific."


def _confidence_score(lead: LeadRecord, angle: str) -> int:
    score = 6
    if lead.fit_score >= 8:
        score += 1
    if lead.final_score >= 8:
        score += 1
    if angle != ANGLE_FALLBACK:
        score += 1
    if len(lead.exact_complaint.split()) >= 10:
        score += 1
    return max(0, min(10, score))


def _prefix(lead: LeadRecord) -> str:
    if lead.username:
        return f"{lead.username}, saw your post."
    return "Saw your post."
