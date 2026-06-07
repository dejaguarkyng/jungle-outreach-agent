from __future__ import annotations

from pathlib import Path

from .config import PipelineConfig
from .heuristics import draft_outreach_heuristic
from .json_io import read_model_list, write_models
from .llm import LLMClient
from .models import DraftedLead, LeadCategory, ScoredLead


def run(
    config: PipelineConfig,
    input_path: Path | None = None,
    output_path: Path | None = None,
) -> list[DraftedLead]:
    leads = read_model_list(input_path or config.paths.scored_path, ScoredLead)
    llm = LLMClient(config.llm, config.paths)
    drafted: list[DraftedLead] = []

    for lead in leads:
        outreach = None
        if (
            lead.classification.category != LeadCategory.NON_FIT
            and lead.score.fit_score >= config.scoring.outreach_threshold
        ):
            outreach = draft_outreach_heuristic(lead, config.company)
            if llm.available():
                try:
                    outreach = llm.draft_outreach(
                        lead,
                        company_name=config.company.company_name,
                        company_pitch=config.company.company_pitch,
                    )
                except Exception:
                    pass
        drafted.append(DraftedLead(**lead.model_dump(), outreach=outreach))

    write_models(output_path or config.paths.drafts_path, drafted)
    return drafted
