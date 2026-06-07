from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import LLMConfig, PathsConfig
from .models import (
    ClassifiedLead,
    DedupedLead,
    LeadCategory,
    LeadClassification,
    LeadScore,
    OutreachDraft,
    ScoredLead,
)
from .text_utils import truncate


class LLMClient:
    def __init__(self, config: LLMConfig, paths: PathsConfig):
        self.config = config
        self.paths = paths

    def available(self) -> bool:
        return False

    def classify_lead(self, lead: DedupedLead) -> LeadClassification:
        payload = self._call_json(
            "classify_lead.md",
            {"lead_json": json.dumps(_lead_prompt_payload(lead), indent=2)},
        )
        return LeadClassification(
            category=LeadCategory(payload["category"]),
            rationale=str(payload["rationale"]),
            confidence=float(payload["confidence"]),
            model_source=f"llm:{self.config.model}",
        )

    def score_lead(self, lead: ClassifiedLead) -> LeadScore:
        payload = self._call_json(
            "score_lead.md",
            {
                "lead_json": json.dumps(_lead_prompt_payload(lead), indent=2),
                "classification_json": json.dumps(lead.classification.model_dump(mode="json"), indent=2),
            },
        )
        return LeadScore(
            fit_score=max(0, min(int(payload["fit_score"]), 10)),
            rationale=str(payload["rationale"]),
            buying_signals=[str(item) for item in payload.get("buying_signals", [])],
            model_source=f"llm:{self.config.model}",
        )

    def draft_outreach(self, lead: ScoredLead, company_name: str, company_pitch: str) -> OutreachDraft:
        payload = self._call_json(
            "draft_outreach.md",
            {
                "lead_json": json.dumps(_lead_prompt_payload(lead), indent=2),
                "classification_json": json.dumps(lead.classification.model_dump(mode="json"), indent=2),
                "score_json": json.dumps(lead.score.model_dump(mode="json"), indent=2),
                "company_name": company_name,
                "company_pitch": company_pitch,
            },
        )
        return OutreachDraft(
            subject=str(payload["subject"]),
            message=str(payload["message"]),
            why_jungle_grid=str(payload["why_jungle_grid"]),
            call_to_action=str(payload["call_to_action"]),
            generated_by=f"llm:{self.config.model}",
        )

    def _call_json(self, prompt_name: str, variables: dict[str, str]) -> dict[str, Any]:
        del prompt_name, variables
        raise RuntimeError(
            "The legacy lead pipeline is heuristic-only. Model generation runs in the "
            "Jungle Grid outreach worker."
        )


def _render_prompt(path: Path, variables: dict[str, str]) -> str:
    template = path.read_text(encoding="utf-8")
    for key, value in variables.items():
        template = template.replace(f"{{{{{key}}}}}", value)
    return template


def _parse_json_object(content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("LLM response did not contain a JSON object.")
    return json.loads(content[start : end + 1])


def _lead_prompt_payload(lead: DedupedLead | ClassifiedLead | ScoredLead) -> dict[str, Any]:
    payload = lead.model_dump(mode="json")
    payload["full_text"] = truncate(str(payload.get("full_text", "")), 1600)
    payload["complaint_text"] = truncate(str(payload.get("complaint_text", "")), 700)
    return payload
