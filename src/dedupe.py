from __future__ import annotations

from .common import canonicalize_url, complaint_hash, complaint_similarity
from .logging_utils import get_logger
from .models import LeadRecord, PipelineStats, ScoringConfig
from .settings import QUALIFIED_LEADS_PATH, RAW_LEADS_PATH, SEEN_HASHES_PATH, SEEN_URLS_PATH, load_scoring_config
from .storage import read_leads, read_string_list, write_leads, write_string_list


def run(
    leads: list[LeadRecord] | None = None,
    *,
    scoring_config: ScoringConfig | None = None,
    input_path=None,
    output_path=None,
    persist_seen: bool = True,
) -> tuple[list[LeadRecord], PipelineStats]:
    logger = get_logger()
    config = scoring_config or load_scoring_config()
    current_leads = leads or read_leads(input_path or RAW_LEADS_PATH)
    stats = PipelineStats()
    stats.collected = len(current_leads)

    seen_urls = set(read_string_list(SEEN_URLS_PATH))
    seen_hashes = set(read_string_list(SEEN_HASHES_PATH))

    fresh: list[LeadRecord] = []
    for lead in current_leads:
        url = canonicalize_url(lead.post_url)
        hashed = complaint_hash(lead.exact_complaint)
        if url in seen_urls:
            _record_drop(stats, logger, lead, "seen_url")
            continue
        if hashed in seen_hashes:
            _record_drop(stats, logger, lead, "seen_hash")
            continue
        fresh.append(lead)

    url_deduped: list[LeadRecord] = []
    by_url: dict[str, LeadRecord] = {}
    for lead in sorted(fresh, key=lambda item: (item.post_date, len(item.exact_complaint)), reverse=True):
        url = canonicalize_url(lead.post_url)
        existing = by_url.get(url)
        if existing is None:
            by_url[url] = lead
            url_deduped.append(lead)
            continue
        _record_drop(stats, logger, lead, "duplicate_exact_url")

    survivors: list[LeadRecord] = []
    threshold = config.thresholds.similarity_threshold
    for lead in sorted(url_deduped, key=lambda item: (item.post_date, len(item.exact_complaint)), reverse=True):
        duplicate = next(
            (
                candidate
                for candidate in survivors
                if complaint_similarity(candidate.exact_complaint, lead.exact_complaint) >= threshold
            ),
            None,
        )
        if duplicate is None:
            lead.status = "deduped"
            survivors.append(lead)
            continue
        _record_drop(stats, logger, lead, "duplicate_fuzzy_complaint")

    if persist_seen:
        write_string_list(SEEN_URLS_PATH, [*seen_urls, *[lead.post_url for lead in survivors]])
        write_string_list(SEEN_HASHES_PATH, [*seen_hashes, *[complaint_hash(lead.exact_complaint) for lead in survivors]])

    write_leads(output_path or QUALIFIED_LEADS_PATH, survivors)
    logger.info(
        "dedupe_summary input=%s kept=%s filtered=%s persist_seen=%s",
        len(current_leads),
        len(survivors),
        stats.filtered,
        persist_seen,
    )
    return survivors, stats


def _record_drop(stats: PipelineStats, logger, lead: LeadRecord, reason: str) -> None:
    stats.filtered += 1
    stats.dropped_reasons[reason] = stats.dropped_reasons.get(reason, 0) + 1
    logger.info("dropped_lead stage=dedupe reason=%s post_url=%s", reason, lead.post_url)
