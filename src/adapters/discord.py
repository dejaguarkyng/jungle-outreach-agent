from __future__ import annotations

from datetime import datetime

import httpx

from ..models import RawCandidate, SourceAdapterConfig


def collect_candidates(
    settings: SourceAdapterConfig,
    queries: dict[str, list[str]],
    now_utc: datetime,
    client: httpx.Client,
) -> list[RawCandidate]:
    return []
