from __future__ import annotations

from pathlib import Path

from .config import PipelineConfig
from .json_io import find_json_files, read_model_list, write_models
from .models import NormalizedLead, RawLead
from .qualify import filter_relevant_leads
from .text_utils import canonicalize_url, detect_pain_hints, extract_complaint_text, normalize_whitespace


def run(
    config: PipelineConfig,
    input_paths: list[Path] | None = None,
    input_dir: Path | None = None,
    output_path: Path | None = None,
) -> list[NormalizedLead]:
    candidate_paths = input_paths or find_json_files(input_dir or config.paths.raw_dir)
    raw_leads: list[RawLead] = []
    for path in candidate_paths:
        raw_leads.extend(read_model_list(Path(path), RawLead))

    normalized: list[NormalizedLead] = []
    for lead in raw_leads:
        full_text = normalize_whitespace(" ".join(part for part in [lead.title, lead.text] if part))
        complaint_text = extract_complaint_text(lead.title, lead.text)
        metadata = dict(lead.metadata)
        metadata["original_url"] = lead.url
        normalized.append(
            NormalizedLead(
                lead_id=lead.lead_id,
                source=lead.source,
                query=lead.query,
                url=lead.url,
                canonical_url=canonicalize_url(lead.url),
                title=lead.title,
                author=lead.author,
                created_at=lead.created_at,
                fetched_at=lead.fetched_at,
                complaint_text=complaint_text,
                full_text=full_text,
                pain_hints=detect_pain_hints(full_text),
                metadata=metadata,
            )
        )

    qualified = filter_relevant_leads(normalized, config.qualification)
    qualified.sort(key=lambda item: item.created_at, reverse=True)
    write_models(output_path or config.paths.normalized_path, qualified)
    return qualified
