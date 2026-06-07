from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class LeadRecord(BaseModel):
    id: str
    date_found: datetime
    platform: str
    username: str = ""
    profile_url: str = ""
    post_url: str
    post_date: datetime
    exact_complaint: str
    pain_type: str = "unclassified"
    fit_score: int = Field(default=0, ge=0, le=10)
    pain_score: float = Field(default=0.0, ge=0.0, le=10.0)
    urgency_score: float = Field(default=0.0, ge=0.0, le=10.0)
    budget_signal: float = Field(default=0.0, ge=0.0, le=10.0)
    production_usage: float = Field(default=0.0, ge=0.0, le=10.0)
    recency_boost: float = 0.0
    final_score: float = 0.0
    why_jg_fit: str = ""
    suggested_reply: str = ""
    status: str = "new"
    notes: list[str] = Field(default_factory=list)
    review_status: str = "pending"
    outreach_status: str = "not_contacted"
    approved_reply_variant: str = ""
    custom_reply_written: bool = False
    last_reviewed_at: datetime | None = None
    last_outreach_action_at: datetime | None = None


class ReplyQueueItem(BaseModel):
    lead_id: str
    platform: str
    username: str = ""
    profile_url: str = ""
    post_url: str
    post_date: datetime
    exact_complaint: str
    pain_type: str
    fit_score: int = Field(ge=0, le=10)
    final_score: float
    personalized_opener: str
    opener_v1: str
    opener_v2: str
    opener_v3: str
    reply_angle: str
    diagnostic_question: str
    why_this_reply_fits: str
    confidence_score: int = Field(ge=0, le=10)
    recommended_variant: str
    review_status: str = "pending"
    outreach_status: str = "not_contacted"
    approved_reply_variant: str = ""
    custom_reply_written: bool = False
    notes: list[str] = Field(default_factory=list)
    last_reviewed_at: datetime | None = None
    last_outreach_action_at: datetime | None = None


class SourceAdapterConfig(BaseModel):
    enabled: bool = True
    limit_per_query: int = 20
    user_agent: str = "jungle-grid-leads/0.2"
    base_url: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)


class SourcesConfig(BaseModel):
    max_age_days: int = 14
    adapters: dict[str, SourceAdapterConfig] = Field(default_factory=dict)
    queries: dict[str, list[str]] = Field(default_factory=dict)


class ScoringWeights(BaseModel):
    pain_score: float = 0.4
    urgency_score: float = 0.3
    budget_signal: float = 0.2
    production_usage: float = 0.1


class ScoringThresholds(BaseModel):
    fit_score_min: int = 7
    final_score_min: float = 6.5
    top_n: int = 10
    similarity_threshold: float = 0.82


class RecencyRule(BaseModel):
    max_age_hours: int
    boost: float


class ScoringConfig(BaseModel):
    thresholds: ScoringThresholds = Field(default_factory=ScoringThresholds)
    weights: ScoringWeights = Field(default_factory=ScoringWeights)
    recency_rules: list[RecencyRule] = Field(default_factory=list)
    penalties: dict[str, list[str]] = Field(default_factory=dict)
    high_signal_keywords: dict[str, list[str]] = Field(default_factory=dict)


class PipelineStats(BaseModel):
    collected: int = 0
    filtered: int = 0
    qualified: int = 0
    dropped_reasons: dict[str, int] = Field(default_factory=dict)
    adapter_errors: dict[str, str] = Field(default_factory=dict)


class RawCandidate(BaseModel):
    platform: str
    username: str = ""
    profile_url: str = ""
    post_url: str
    post_date: datetime | str | None
    complaint_text: str
    metadata: dict[str, Any] = Field(default_factory=dict)
