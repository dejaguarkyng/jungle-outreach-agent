from __future__ import annotations

from pathlib import Path

import yaml

from .models import ScoringConfig, SourcesConfig

ROOT_DIR = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT_DIR / "config"
DATA_DIR = ROOT_DIR / "data"
LOGS_DIR = ROOT_DIR / "logs"
PROMPTS_DIR = ROOT_DIR / "prompts"

RAW_LEADS_PATH = DATA_DIR / "raw_leads.json"
QUALIFIED_LEADS_PATH = DATA_DIR / "qualified_leads.json"
TOP_LEADS_PATH = DATA_DIR / "top_leads.json"
REPLY_QUEUE_PATH = DATA_DIR / "reply_queue.json"
SEEN_URLS_PATH = DATA_DIR / "seen_urls.json"
SEEN_HASHES_PATH = DATA_DIR / "seen_hashes.json"
PIPELINE_LOG_PATH = LOGS_DIR / "pipeline.log"


def load_sources_config(path: Path | None = None) -> SourcesConfig:
    config_path = path or (CONFIG_DIR / "sources.yaml")
    with config_path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle) or {}
    return SourcesConfig.model_validate(payload)


def load_scoring_config(path: Path | None = None) -> ScoringConfig:
    config_path = path or (CONFIG_DIR / "scoring.yaml")
    with config_path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle) or {}
    return ScoringConfig.model_validate(payload)
