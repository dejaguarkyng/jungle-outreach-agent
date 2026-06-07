from __future__ import annotations

from datetime import datetime

import httpx

from ..common import clip_text, normalize_whitespace
from ..models import RawCandidate, SourceAdapterConfig


def collect_candidates(
    settings: SourceAdapterConfig,
    queries: dict[str, list[str]],
    now_utc: datetime,
    client: httpx.Client,
) -> list[RawCandidate]:
    results: list[RawCandidate] = []

    for query_group in queries.values():
        for query in query_group:
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
                post_url = (
                    hit.get("url")
                    or hit.get("story_url")
                    or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
                )
                title = normalize_whitespace(_strip_html(hit.get("title", "") or hit.get("story_title", "") or ""))
                body = normalize_whitespace(_strip_html(hit.get("comment_text", "") or hit.get("story_text", "") or ""))
                complaint = " ".join(part for part in [title, body] if part)
                results.append(
                    RawCandidate(
                        platform="hackernews",
                        username=hit.get("author", "") or "",
                        profile_url=f"https://news.ycombinator.com/user?id={hit.get('author', '')}" if hit.get("author") else "",
                        post_url=post_url,
                        post_date=hit.get("created_at"),
                        complaint_text=clip_text(complaint, 1200),
                        metadata={
                            "query": query,
                            "points": hit.get("points", 0),
                            "num_comments": hit.get("num_comments", 0),
                            "object_id": hit.get("objectID"),
                        },
                    )
                )
    return results


def _strip_html(text: str) -> str:
    import re

    return re.sub(r"<[^>]+>", " ", text or "")

