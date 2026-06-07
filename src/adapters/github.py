from __future__ import annotations

import os
from datetime import datetime

import httpx
from dotenv import load_dotenv

from ..common import clip_text
from ..models import RawCandidate, SourceAdapterConfig

load_dotenv()


def collect_candidates(
    settings: SourceAdapterConfig,
    queries: dict[str, list[str]],
    now_utc: datetime,
    client: httpx.Client,
) -> list[RawCandidate]:
    token = os.getenv("GITHUB_TOKEN", "")
    auth = {"Authorization": f"Bearer {token}"} if token else {}
    headers = {"Accept": "application/vnd.github+json", **auth, **settings.headers}
    results: list[RawCandidate] = []

    for query_group in queries.values():
        for query in query_group:
            response = client.get(
                "https://api.github.com/search/issues",
                params={"q": f"{query} is:issue", "sort": "updated", "order": "desc", "per_page": settings.limit_per_query},
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
            for item in payload.get("items", []):
                complaint = " ".join(part for part in [item.get("title", ""), item.get("body", "") or ""] if part)
                user = item.get("user", {}) or {}
                results.append(
                    RawCandidate(
                        platform="github",
                        username=user.get("login", "") or "",
                        profile_url=user.get("html_url", "") or "",
                        post_url=item.get("html_url", "") or "",
                        post_date=item.get("created_at"),
                        complaint_text=clip_text(complaint, 1200),
                        metadata={
                            "query": query,
                            "repository_url": item.get("repository_url", ""),
                            "comments": item.get("comments", 0),
                        },
                    )
                )
    return results

