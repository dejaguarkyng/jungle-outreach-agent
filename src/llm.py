"""Compatibility shim for the legacy heuristic lead pipeline."""

from __future__ import annotations

from typing import Any


def available() -> bool:
    return False


def call_json(system: str, user: str) -> dict[str, Any]:
    del system, user
    raise RuntimeError(
        "The legacy lead pipeline is template-only. Model generation runs in the Jungle Grid worker."
    )
