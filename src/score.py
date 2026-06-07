from __future__ import annotations

from datetime import datetime, timezone

from .common import normalize_for_similarity, utc_now
from .logging_utils import get_logger
from .models import LeadRecord, ScoringConfig
from .settings import QUALIFIED_LEADS_PATH, load_scoring_config
from .storage import read_leads, write_leads

PROVIDER_HIGH_SIGNALS = ("runpod", "vast", "provider", "quota", "unreliable", "preempted", "billing", "pricing")
GPU_SELECTION_SIGNALS = ("which gpu", "a100", "h100", "l40", "l40s", "vram", "cost performance", "cost/performance")
DEPLOYMENT_SIGNALS = ("deploy", "deployment", "inference", "serving", "endpoint", "latency", "vllm", "triton", "autoscaling")
URGENCY_SIGNALS = ("urgent", "asap", "blocked", "stuck", "retry", "retries", "loop", "failing", "down", "outage", "cannot", "can't")
BUDGET_SIGNALS = ("cost", "pricing", "billing", "expensive", "spent", "spend", "wasted spend", "paid gpu", "budget", "credits")
PRODUCTION_SIGNALS = ("production", "prod", "pipeline", "users", "customers", "deployment", "endpoint", "sla", "latency", "workload")


def run(
    leads: list[LeadRecord] | None = None,
    *,
    scoring_config: ScoringConfig | None = None,
    now_utc: datetime | None = None,
    input_path=None,
    output_path=None,
) -> list[LeadRecord]:
    logger = get_logger()
    config = scoring_config or load_scoring_config()
    current = leads or read_leads(input_path or QUALIFIED_LEADS_PATH)
    scored: list[LeadRecord] = []
    scoring_time = now_utc or utc_now()

    for lead in current:
        normalized = normalize_for_similarity(lead.exact_complaint)
        lead.pain_score = _pain_score(lead.pain_type, normalized)
        lead.urgency_score = _keyword_score(normalized, URGENCY_SIGNALS, base=0.0, step=2.2, cap=10.0)
        lead.budget_signal = _keyword_score(normalized, BUDGET_SIGNALS, base=0.0, step=2.5, cap=10.0)
        lead.production_usage = _keyword_score(normalized, PRODUCTION_SIGNALS, base=0.0, step=2.0, cap=10.0)
        lead.recency_boost = _recency_boost(lead.post_date, config, scoring_time)
        lead.final_score = round(
            (lead.pain_score * config.weights.pain_score)
            + (lead.urgency_score * config.weights.urgency_score)
            + (lead.budget_signal * config.weights.budget_signal)
            + (lead.production_usage * config.weights.production_usage)
            + lead.recency_boost,
            2,
        )
        lead.fit_score = _fit_score(lead, normalized, config)
        lead.why_jg_fit = _why_jg_fit(lead)
        lead.status = "scored"
        logger.info(
            "scoring_breakdown lead_id=%s pain=%.2f urgency=%.2f budget=%.2f production=%.2f recency=%.2f final=%.2f fit=%s",
            lead.id,
            lead.pain_score,
            lead.urgency_score,
            lead.budget_signal,
            lead.production_usage,
            lead.recency_boost,
            lead.final_score,
            lead.fit_score,
        )
        scored.append(lead)

    write_leads(output_path or QUALIFIED_LEADS_PATH, scored)
    return scored


def _pain_score(pain_type: str, normalized: str) -> float:
    if pain_type == "provider_pain":
        return _keyword_score(normalized, PROVIDER_HIGH_SIGNALS, base=4.0, step=1.2, cap=10.0)
    if pain_type == "gpu_selection_pain":
        return _keyword_score(normalized, GPU_SELECTION_SIGNALS, base=4.0, step=1.1, cap=10.0)
    if pain_type == "deployment_pain":
        return _keyword_score(normalized, DEPLOYMENT_SIGNALS, base=4.0, step=1.1, cap=10.0)
    return 1.0


def _keyword_score(normalized: str, keywords: tuple[str, ...], *, base: float, step: float, cap: float) -> float:
    hits = sum(1 for keyword in keywords if keyword in normalized)
    return round(min(cap, base + (hits * step)), 2)


def _recency_boost(post_date: datetime, config: ScoringConfig, now_utc: datetime) -> float:
    current = now_utc if now_utc.tzinfo else now_utc.replace(tzinfo=timezone.utc)
    age_hours = max(0.0, (current - post_date).total_seconds() / 3600)
    for rule in sorted(config.recency_rules, key=lambda item: item.max_age_hours):
        if age_hours < rule.max_age_hours:
            return rule.boost
    return 0.0


def _fit_score(lead: LeadRecord, normalized: str, config: ScoringConfig) -> int:
    if lead.pain_type == "non_fit":
        return 1

    score = 5
    if lead.pain_type in {"provider_pain", "deployment_pain", "gpu_selection_pain"}:
        score += 1
    if lead.pain_score >= 7:
        score += 1
    if lead.urgency_score >= 6:
        score += 1
    if lead.production_usage >= 6 or lead.budget_signal >= 6:
        score += 1
    if any(keyword in normalized for keyword in config.penalties.get("low_fit_terms", [])):
        score -= 4
        lead.notes.append("low_fit_penalty_applied")
    return max(0, min(10, score))


def _why_jg_fit(lead: LeadRecord) -> str:
    if lead.pain_type == "provider_pain":
        return "The complaint is directly about GPU provider friction, capacity, or reliability."
    if lead.pain_type == "gpu_selection_pain":
        return "The lead is struggling with GPU choice, sizing, or cost/performance tradeoffs."
    if lead.pain_type == "deployment_pain":
        return "The issue is tied to production inference or deployment friction rather than a narrow code bug."
    return "The lead is not a strong fit for Jungle Grid."
