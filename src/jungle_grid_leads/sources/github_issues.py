from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import httpx

from ..config import SourceSettings
from ..models import LeadSource, RawLead
from ..text_utils import stable_id


def search(
    queries: dict[str, list[str]],
    settings: SourceSettings,
    recent_days: int,
    now: datetime,
    client: httpx.Client,
) -> list[RawLead]:
    cutoff = now - timedelta(days=recent_days)
    fetched_at = now.astimezone(timezone.utc)
    token_env = settings.bearer_token_env or "GITHUB_TOKEN"
    token = os.getenv(token_env, "")
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": settings.user_agent,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    leads: list[RawLead] = []

    for theme, query_list in queries.items():
        for query in query_list:
            response = client.get(
                "https://api.github.com/search/issues",
                params={
                    "q": f"{query} is:issue",
                    "sort": "created",
                    "order": "desc",
                    "per_page": settings.limit_per_query,
                },
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
            for item in payload.get("items", []):
                created_at = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
                if created_at < cutoff:
                    continue
                leads.append(
                    RawLead(
                        lead_id=stable_id("github", item.get("html_url", ""), query, str(item.get("id", ""))),
                        source=LeadSource.GITHUB,
                        query=query,
                        url=item.get("html_url", "") or "",
                        title=item.get("title", "") or "",
                        author=(item.get("user") or {}).get("login", "") or "",
                        created_at=created_at.astimezone(timezone.utc),
                        fetched_at=fetched_at,
                        text=item.get("body", "") or item.get("title", "") or "",
                        metadata={
                            "query_theme": theme,
                            "repository_url": item.get("repository_url", ""),
                            "state": item.get("state", ""),
                            "comments": item.get("comments", 0),
                            "labels": [label.get("name", "") for label in item.get("labels", [])],
                            "updated_at": item.get("updated_at", ""),
                        },
                    )
                )

    return leads
