from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class SourceSettings(BaseModel):
    enabled: bool = True
    optional: bool = False
    limit_per_query: int = 25
    user_agent: str = "jungle-grid-leads/0.1"
    bearer_token_env: str | None = None


class DiscoveryConfig(BaseModel):
    recent_days: int = 14
    sources: dict[str, SourceSettings] = Field(default_factory=dict)
    queries: dict[str, list[str]] = Field(default_factory=dict)


class DedupeConfig(BaseModel):
    complaint_similarity_threshold: float = 0.82


class QualificationConfig(BaseModel):
    allowed_reddit_subreddits: list[str] = Field(
        default_factory=lambda: [
            "LocalLLaMA",
            "MachineLearning",
            "StableDiffusion",
            "MLOps",
            "kubernetes",
            "selfhosted",
            "dataengineering",
        ]
    )
    required_ai_terms: list[str] = Field(
        default_factory=lambda: [
            "gpu",
            "cuda",
            "inference",
            "model training",
            "training job",
            "fine tuning",
            "fine-tuning",
            "finetuning",
            "deployment",
            "deploying",
            "llm",
            "llms",
            "large language model",
            "ai infra",
            "ai infrastructure",
            "ml infra",
            "model serving",
            "vllm",
            "triton",
        ]
    )
    hard_reject_terms: list[str] = Field(
        default_factory=lambda: [
            "relationship",
            "dating",
            "boyfriend",
            "girlfriend",
            "marriage",
            "divorce",
            "personal life",
            "parenting",
            "parent",
            "mother",
            "father",
            "mom",
            "dad",
            "baby",
            "child",
            "children",
            "gaming",
            "video game",
            "fortnite",
            "minecraft",
            "playstation",
            "xbox",
            "fps",
            "music",
            "song",
            "album",
            "band",
            "guitar",
            "storytelling",
            "novel",
            "character arc",
            "plot twist",
        ]
    )


class LLMConfig(BaseModel):
    mode: str = "heuristic"
    model: str = "template"
    temperature: float = 0.2
    timeout_seconds: float = 45.0


class ScoringConfig(BaseModel):
    outreach_threshold: int = 7
    queue_limit: int = 25


class CompanyConfig(BaseModel):
    company_name: str = "Jungle Grid"
    company_pitch: str = (
        "Jungle Grid helps AI teams move from GPU search and deployment friction "
        "to a simpler path for finding capacity, choosing hardware, and shipping workloads."
    )


class SafetyConfig(BaseModel):
    manual_only: bool = True


class PathsConfig(BaseModel):
    raw_dir: Path = Path("data/raw")
    normalized_path: Path = Path("data/normalized/leads.json")
    deduped_path: Path = Path("data/processed/deduped_leads.json")
    classified_path: Path = Path("data/enriched/leads_classified.json")
    scored_path: Path = Path("data/enriched/leads_scored.json")
    drafts_path: Path = Path("data/outreach/outreach_drafts.json")
    outreach_queue_path: Path = Path("outreach_queue.json")
    prompts_dir: Path = Path("prompts")


class PipelineConfig(BaseModel):
    discovery: DiscoveryConfig = Field(default_factory=DiscoveryConfig)
    dedupe: DedupeConfig = Field(default_factory=DedupeConfig)
    qualification: QualificationConfig = Field(default_factory=QualificationConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    scoring: ScoringConfig = Field(default_factory=ScoringConfig)
    company: CompanyConfig = Field(default_factory=CompanyConfig)
    safety: SafetyConfig = Field(default_factory=SafetyConfig)
    paths: PathsConfig = Field(default_factory=PathsConfig)


def load_config(path: str | Path) -> PipelineConfig:
    config_path = Path(path).resolve()
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}

    config = PipelineConfig.model_validate(raw)
    base_dir = config_path.parent.parent if config_path.parent.name == "config" else config_path.parent
    config.paths = _resolve_paths(config.paths, base_dir)
    return config


def _resolve_paths(paths: PathsConfig, base_dir: Path) -> PathsConfig:
    def resolve(value: Path) -> Path:
        return value if value.is_absolute() else (base_dir / value).resolve()

    return PathsConfig(
        raw_dir=resolve(paths.raw_dir),
        normalized_path=resolve(paths.normalized_path),
        deduped_path=resolve(paths.deduped_path),
        classified_path=resolve(paths.classified_path),
        scored_path=resolve(paths.scored_path),
        drafts_path=resolve(paths.drafts_path),
        outreach_queue_path=resolve(paths.outreach_queue_path),
        prompts_dir=resolve(paths.prompts_dir),
    )
