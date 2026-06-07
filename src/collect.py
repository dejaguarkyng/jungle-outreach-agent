from __future__ import annotations

from datetime import datetime, timedelta

import httpx

from .adapters import ADAPTER_REGISTRY
from .common import canonicalize_url, clip_text, parse_timestamp, stable_lead_id, utc_now
from .logging_utils import get_logger
from .models import LeadRecord, PipelineStats, RawCandidate, SourcesConfig
from .settings import RAW_LEADS_PATH, load_sources_config
from .storage import ensure_runtime_files, write_leads


def run(
    *,
    now_utc: datetime | None = None,
    sources_config: SourcesConfig | None = None,
    adapter_registry: dict[str, object] | None = None,
    output_path=None,
    client: httpx.Client | None = None,
) -> tuple[list[LeadRecord], PipelineStats]:
    ensure_runtime_files()
    logger = get_logger()
    current_time = now_utc or utc_now()
    sources = sources_config or load_sources_config()
    registry = adapter_registry or ADAPTER_REGISTRY
    stats = PipelineStats()
    accepted: list[LeadRecord] = []

    managed_client = client or httpx.Client(timeout=30.0, follow_redirects=True)
    should_close = client is None

    try:
        for adapter_name, adapter_settings in sources.adapters.items():
            if not adapter_settings.enabled:
                continue
            adapter = registry.get(adapter_name)
            if adapter is None:
                logger.warning("adapter_missing adapter=%s", adapter_name)
                stats.adapter_errors[adapter_name] = "adapter not registered"
                continue

            try:
                candidates = adapter(adapter_settings, sources.queries, current_time, managed_client)
            except Exception as exc:
                logger.exception("adapter_error adapter=%s error=%s", adapter_name, exc)
                stats.adapter_errors[adapter_name] = str(exc)
                continue

            stats.collected += len(candidates)
            for candidate in candidates:
                lead = _normalize_candidate(candidate, current_time, sources.max_age_days)
                if lead is None:
                    reason = candidate.metadata.get("drop_reason", "filtered")
                    stats.filtered += 1
                    stats.dropped_reasons[reason] = stats.dropped_reasons.get(reason, 0) + 1
                    logger.info(
                        "dropped_lead stage=collect adapter=%s reason=%s post_url=%s",
                        adapter_name,
                        reason,
                        candidate.post_url,
                    )
                    continue
                accepted.append(lead)
    finally:
        if should_close:
            managed_client.close()

    write_leads(output_path or RAW_LEADS_PATH, accepted)
    logger.info(
        "collect_summary collected=%s accepted=%s filtered=%s adapter_errors=%s",
        stats.collected,
        len(accepted),
        stats.filtered,
        len(stats.adapter_errors),
    )
    return accepted, stats


def _normalize_candidate(candidate: RawCandidate, now_utc: datetime, max_age_days: int) -> LeadRecord | None:
    post_date = parse_timestamp(candidate.post_date)
    if post_date is None:
        candidate.metadata["drop_reason"] = "missing_or_invalid_timestamp"
        return None

    if post_date < (now_utc - timedelta(days=max_age_days)):
        candidate.metadata["drop_reason"] = "older_than_14_days"
        return None

    canonical_url = canonicalize_url(candidate.post_url)
    if not canonical_url:
        candidate.metadata["drop_reason"] = "missing_post_url"
        return None

    complaint = clip_text(candidate.complaint_text, 1200)
    if not complaint:
        candidate.metadata["drop_reason"] = "missing_complaint_text"
        return None

    return LeadRecord(
        id=stable_lead_id(candidate.platform, canonical_url, complaint),
        date_found=now_utc,
        platform=candidate.platform,
        username=candidate.username,
        profile_url=candidate.profile_url,
        post_url=canonical_url,
        post_date=post_date,
        exact_complaint=complaint,
        status="collected",
    )
