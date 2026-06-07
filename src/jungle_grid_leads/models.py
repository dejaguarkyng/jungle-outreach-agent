from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LeadSource(str, Enum):
    REDDIT = "reddit"
    GITHUB = "github"
    HACKERNEWS = "hackernews"
    X = "x"


class LeadCategory(str, Enum):
    PROVIDER_PAIN = "provider_pain"
    GPU_SELECTION_PAIN = "gpu_selection_pain"
    DEPLOYMENT_PAIN = "deployment_pain"
    NON_FIT = "non_fit"


class RawLead(BaseModel):
    model_config = ConfigDict(extra="allow")

    lead_id: str
    source: LeadSource
    query: str
    url: str
    title: str = ""
    author: str = ""
    created_at: datetime
    fetched_at: datetime
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class NormalizedLead(BaseModel):
    lead_id: str
    source: LeadSource
    query: str
    url: str
    canonical_url: str
    title: str = ""
    author: str = ""
    created_at: datetime
    fetched_at: datetime
    complaint_text: str
    full_text: str
    pain_hints: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DedupedLead(NormalizedLead):
    duplicate_lead_ids: list[str] = Field(default_factory=list)
    duplicate_urls: list[str] = Field(default_factory=list)
    dedupe_reasons: list[str] = Field(default_factory=list)


class LeadClassification(BaseModel):
    category: LeadCategory
    rationale: str
    confidence: float = Field(ge=0.0, le=1.0)
    model_source: str = "heuristic"


class ClassifiedLead(DedupedLead):
    classification: LeadClassification


class LeadScore(BaseModel):
    fit_score: int = Field(ge=0, le=10)
    rationale: str
    buying_signals: list[str] = Field(default_factory=list)
    model_source: str = "heuristic"


class ScoredLead(ClassifiedLead):
    score: LeadScore


class OutreachDraft(BaseModel):
    subject: str
    message: str
    why_jungle_grid: str
    call_to_action: str
    generated_by: str = "heuristic"


class DraftedLead(ScoredLead):
    outreach: OutreachDraft | None = None


class OutreachQueueItem(BaseModel):
    lead_id: str
    source: LeadSource
    url: str
    author: str
    created_at: datetime
    category: LeadCategory
    fit_score: int = Field(ge=0, le=10)
    pain_summary: str
    why_jungle_grid: str
    draft_subject: str
    draft_message: str
    manual_status: str = "pending_review"
