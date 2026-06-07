from __future__ import annotations

from pathlib import Path

from .config import PipelineConfig
from .json_io import read_model_list, write_models
from .models import DedupedLead, NormalizedLead
from .text_utils import complaint_similarity, compact_text


def run(
    config: PipelineConfig,
    input_path: Path | None = None,
    output_path: Path | None = None,
) -> list[DedupedLead]:
    leads = read_model_list(input_path or config.paths.normalized_path, NormalizedLead)
    url_collapsed = _collapse_exact_urls(leads)
    deduped = _collapse_similar_leads(url_collapsed, config.dedupe.complaint_similarity_threshold)
    deduped.sort(key=lambda item: item.created_at, reverse=True)
    write_models(output_path or config.paths.deduped_path, deduped)
    return deduped


def _collapse_exact_urls(leads: list[NormalizedLead]) -> list[DedupedLead]:
    grouped: dict[str, list[NormalizedLead]] = {}
    for lead in leads:
        grouped.setdefault(lead.canonical_url or lead.url, []).append(lead)

    collapsed: list[DedupedLead] = []
    for _, group in grouped.items():
        primary = max(group, key=_priority_key)
        duplicates = [lead for lead in group if lead.lead_id != primary.lead_id]
        collapsed.append(
            DedupedLead(
                **primary.model_dump(),
                duplicate_lead_ids=[lead.lead_id for lead in duplicates],
                duplicate_urls=sorted({lead.url for lead in duplicates}),
                dedupe_reasons=["canonical_url_match"] if duplicates else [],
            )
        )
    return collapsed


def _collapse_similar_leads(leads: list[DedupedLead], threshold: float) -> list[DedupedLead]:
    survivors: list[DedupedLead] = []
    for lead in sorted(leads, key=_priority_key, reverse=True):
        match = next((item for item in survivors if _is_duplicate(item, lead, threshold)), None)
        if match is None:
            survivors.append(lead)
            continue
        _merge_duplicate(match, lead)
    return survivors


def _is_duplicate(left: DedupedLead, right: DedupedLead, threshold: float) -> bool:
    if left.canonical_url == right.canonical_url:
        return True

    similarity = complaint_similarity(left.complaint_text, right.complaint_text)
    same_author = bool(left.author and right.author and left.author.lower() == right.author.lower())
    same_title = bool(left.title and right.title and compact_text(left.title) == compact_text(right.title))
    highly_similar = similarity >= max(threshold, 0.92)
    relaxed_threshold = max(0.55, threshold - 0.15)
    if same_author or same_title:
        return similarity >= relaxed_threshold
    return similarity >= threshold and highly_similar


def _merge_duplicate(target: DedupedLead, duplicate: DedupedLead) -> None:
    target.duplicate_lead_ids.extend([duplicate.lead_id, *duplicate.duplicate_lead_ids])
    target.duplicate_urls.extend([duplicate.url, *duplicate.duplicate_urls])
    target.dedupe_reasons.extend(["complaint_similarity_match", *duplicate.dedupe_reasons])
    target.duplicate_lead_ids = sorted(set(target.duplicate_lead_ids))
    target.duplicate_urls = sorted(set(url for url in target.duplicate_urls if url))
    target.dedupe_reasons = sorted(set(target.dedupe_reasons))
    if len(duplicate.full_text) > len(target.full_text):
        target.full_text = duplicate.full_text
        target.complaint_text = duplicate.complaint_text
        target.pain_hints = duplicate.pain_hints


def _priority_key(lead: NormalizedLead | DedupedLead) -> tuple[int, int, str]:
    return (len(lead.full_text), len(lead.pain_hints), lead.created_at.isoformat())
