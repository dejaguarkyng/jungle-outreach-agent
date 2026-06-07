from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, TypeVar

from pydantic import BaseModel

ModelT = TypeVar("ModelT", bound=BaseModel)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    ensure_parent(path)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def write_models(path: Path, items: Iterable[BaseModel]) -> None:
    write_json(path, [item.model_dump(mode="json") for item in items])


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def read_model_list(path: Path, model_type: type[ModelT]) -> list[ModelT]:
    payload = read_json(path)
    if not isinstance(payload, list):
        raise ValueError(f"Expected list payload in {path}")
    return [model_type.model_validate(item) for item in payload]


def find_json_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    if not root.exists():
        return []
    return sorted(file for file in root.rglob("*.json") if file.is_file())
