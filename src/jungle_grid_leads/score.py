from __future__ import annotations

from pathlib import Path

from .config import PipelineConfig
from .heuristics import score_lead_heuristic
from .json_io import read_model_list, write_models
from .llm import LLMClient
from .models import ClassifiedLead, ScoredLead


def run(
    config: PipelineConfig,
    input_path: Path | None = None,
    output_path: Path | None = None,
) -> list[ScoredLead]:
    leads = read_model_list(input_path or config.paths.classified_path, ClassifiedLead)
    llm = LLMClient(config.llm, config.paths)
    results: list[ScoredLead] = []

    for lead in leads:
        score = score_lead_heuristic(lead)
        if llm.available():
            try:
                score = llm.score_lead(lead)
            except Exception:
                pass
        results.append(ScoredLead(**lead.model_dump(), score=score))

    write_models(output_path or config.paths.scored_path, results)
    return results
