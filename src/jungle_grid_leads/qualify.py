from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from .config import PipelineConfig, QualificationConfig
from .json_io import read_model_list, write_models
from .models import LeadSource, NormalizedLead
from .text_utils import normalize_for_similarity

BOT_AUTHOR_SUFFIXES = ("[bot]", "-bot", "_bot")
BOT_AUTHOR_SUBSTRINGS = ("github-actions", "dependabot", "renovate", "codecov", "snyk-bot")


class QualificationDecision(BaseModel):
    accepted: bool
    reason: str
    matched_ai_terms: list[str] = Field(default_factory=list)
    subreddit: str = ""


def run(
    config: PipelineConfig,
    input_path: Path | None = None,
    output_path: Path | None = None,
) -> list[NormalizedLead]:
    leads = read_model_list(input_path or config.paths.normalized_path, NormalizedLead)
    qualified = filter_relevant_leads(leads, config.qualification)
    qualified.sort(key=lambda item: item.created_at, reverse=True)
    write_models(output_path or config.paths.normalized_path, qualified)
    return qualified


def filter_relevant_leads(
    leads: list[NormalizedLead],
    config: QualificationConfig,
) -> list[NormalizedLead]:
    qualified: list[NormalizedLead] = []
    for lead in leads:
        decision = evaluate_lead_relevance(lead, config)
        if not decision.accepted:
            continue
        metadata = dict(lead.metadata)
        metadata["matched_ai_terms"] = decision.matched_ai_terms
        if decision.subreddit:
            metadata["qualified_subreddit"] = decision.subreddit
        qualified.append(lead.model_copy(update={"metadata": metadata}, deep=True))
    return qualified


def evaluate_lead_relevance(
    lead: NormalizedLead,
    config: QualificationConfig,
) -> QualificationDecision:
    text = normalize_for_similarity(" ".join([lead.title, lead.complaint_text, lead.full_text]))
    subreddit = _extract_reddit_subreddit(lead)

    if _is_bot_author(lead.author):
        return QualificationDecision(
            accepted=False,
            reason="bot_author",
            subreddit=subreddit,
        )

    if lead.source == LeadSource.REDDIT and config.allowed_reddit_subreddits:
        allowed_subreddits = {_normalize_subreddit(name) for name in config.allowed_reddit_subreddits}
        if not subreddit or subreddit not in allowed_subreddits:
            return QualificationDecision(
                accepted=False,
                reason="reddit_subreddit_not_allowed",
                subreddit=subreddit,
            )

    matched_hard_reject_terms = _matched_terms(text, config.hard_reject_terms)
    if matched_hard_reject_terms:
        return QualificationDecision(
            accepted=False,
            reason=f"hard_reject_topic:{matched_hard_reject_terms[0]}",
            subreddit=subreddit,
        )

    matched_ai_terms = _matched_terms(text, config.required_ai_terms)
    if not matched_ai_terms:
        return QualificationDecision(
            accepted=False,
            reason="missing_ai_relevance",
            subreddit=subreddit,
        )

    return QualificationDecision(
        accepted=True,
        reason="qualified",
        matched_ai_terms=matched_ai_terms,
        subreddit=subreddit,
    )


def _matched_terms(text: str, terms: list[str]) -> list[str]:
    matched: list[str] = []
    for term in terms:
        normalized_term = normalize_for_similarity(term)
        if normalized_term and normalized_term in text:
            matched.append(term)
    return matched


def _extract_reddit_subreddit(lead: NormalizedLead) -> str:
    metadata_subreddit = str(lead.metadata.get("subreddit", "")).strip()
    if metadata_subreddit:
        return _normalize_subreddit(metadata_subreddit)

    parsed = urlparse(lead.url)
    match = re.search(r"/r/([^/]+)/", parsed.path or "", flags=re.IGNORECASE)
    if not match:
        return ""
    return _normalize_subreddit(match.group(1))


def _normalize_subreddit(value: str) -> str:
    return normalize_for_similarity(value).replace(" ", "")


def _is_bot_author(author: str) -> bool:
    if not author:
        return False
    lowered = author.lower()
    return any(lowered.endswith(suffix) for suffix in BOT_AUTHOR_SUFFIXES) or any(
        substring in lowered for substring in BOT_AUTHOR_SUBSTRINGS
    )
