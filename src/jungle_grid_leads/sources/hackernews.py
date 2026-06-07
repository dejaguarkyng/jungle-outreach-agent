from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx

from ..config import SourceSettings
from ..models import LeadSource, RawLead
from ..text_utils import stable_id, strip_html


def search(
    queries: dict[str, list[str]],
    settings: SourceSettings,
    recent_days: int,
    now: datetime,
    client: httpx.Client,
) -> list[RawLead]:
    cutoff = now - timedelta(days=recent_days)
    fetched_at = now.astimezone(timezone.utc)
    leads: list[RawLead] = []

    for theme, query_list in queries.items():
        for query in query_list:
            response = client.get(
                "https://hn.algolia.com/api/v1/search_by_date",
                params={
                    "query": query,
                    "tags": "story,comment",
                    "hitsPerPage": settings.limit_per_query,
                },
            )
            response.raise_for_status()
            payload = response.json()
            for hit in payload.get("hits", []):
                created_at = datetime.fromisoformat(hit["created_at"].replace("Z", "+00:00"))
                if created_at < cutoff:
                    continue
                url = (
                    hit.get("url")
                    or hit.get("story_url")
                    or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
                )
                text = strip_html(hit.get("comment_text", "") or hit.get("story_text", "") or "")
                title = strip_html(hit.get("title", "") or hit.get("story_title", "") or "")
                leads.append(
                    RawLead(
                        lead_id=stable_id("hackernews", url, query, str(hit.get("objectID", ""))),
                        source=LeadSource.HACKERNEWS,
                        query=query,
                        url=url,
                        title=title,
                        author=hit.get("author", "") or "",
                        created_at=created_at.astimezone(timezone.utc),
                        fetched_at=fetched_at,
                        text=text or title,
                        metadata={
                            "query_theme": theme,
                            "points": hit.get("points", 0),
                            "num_comments": hit.get("num_comments", 0),
                            "hn_object_id": hit.get("objectID"),
                        },
                    )
                )

    return leads
