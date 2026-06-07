from __future__ import annotations

from pathlib import Path

from .config import PipelineConfig
from .heuristics import classify_lead_heuristic
from .json_io import read_model_list, write_models
from .llm import LLMClient
from .models import ClassifiedLead, DedupedLead


def run(
    config: PipelineConfig,
    input_path: Path | None = None,
    output_path: Path | None = None,
) -> list[ClassifiedLead]:
    leads = read_model_list(input_path or config.paths.deduped_path, DedupedLead)
    llm = LLMClient(config.llm, config.paths)
    results: list[ClassifiedLead] = []

    for lead in leads:
        classification = classify_lead_heuristic(lead)
        if llm.available():
            try:
                classification = llm.classify_lead(lead)
            except Exception:
                pass
        results.append(ClassifiedLead(**lead.model_dump(), classification=classification))

    write_models(output_path or config.paths.classified_path, results)
    return results
