from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .models import LeadRecord, ReplyQueueItem
from .settings import (
    DATA_DIR,
    LOGS_DIR,
    PIPELINE_LOG_PATH,
    QUALIFIED_LEADS_PATH,
    RAW_LEADS_PATH,
    REPLY_QUEUE_PATH,
    SEEN_HASHES_PATH,
    SEEN_URLS_PATH,
    TOP_LEADS_PATH,
)


def ensure_runtime_files() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    _ensure_json_array(RAW_LEADS_PATH)
    _ensure_json_array(QUALIFIED_LEADS_PATH)
    _ensure_json_array(TOP_LEADS_PATH)
    _ensure_json_array(REPLY_QUEUE_PATH)
    _ensure_json_array(SEEN_URLS_PATH)
    _ensure_json_array(SEEN_HASHES_PATH)
    PIPELINE_LOG_PATH.touch(exist_ok=True)


def _ensure_json_array(path: Path) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump([], handle, indent=2)


def write_leads(path: Path, leads: Iterable[LeadRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = [lead.model_dump(mode="json") for lead in leads]
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def write_json_items(path: Path, items: Iterable[object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = []
    for item in items:
        if hasattr(item, "model_dump"):
            payload.append(item.model_dump(mode="json"))
        else:
            payload.append(item)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def read_leads(path: Path) -> list[LeadRecord]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle) or []
    return [LeadRecord.model_validate(item) for item in payload]


def read_json_queue_leads(path: Path) -> list[LeadRecord]:
    return read_leads(path)


def read_reply_queue(path: Path) -> list[ReplyQueueItem]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle) or []
    return [ReplyQueueItem.model_validate(item) for item in payload]


def read_string_list(path: Path) -> list[str]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle) or []
    return [str(item) for item in payload]


def write_string_list(path: Path, values: Iterable[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    unique_sorted = sorted({value for value in values if value})
    with path.open("w", encoding="utf-8") as handle:
        json.dump(unique_sorted, handle, indent=2, ensure_ascii=False)
