from __future__ import annotations

from datetime import datetime, timezone

import httpx

from ..common import clip_text
from ..models import RawCandidate, SourceAdapterConfig


def collect_candidates(
    settings: SourceAdapterConfig,
    queries: dict[str, list[str]],
    now_utc: datetime,
    client: httpx.Client,
) -> list[RawCandidate]:
    headers = {"User-Agent": settings.user_agent, **settings.headers}
    results: list[RawCandidate] = []

    for query_group in queries.values():
        for query in query_group:
            response = client.get(
                "https://www.reddit.com/search.json",
                params={"q": query, "sort": "new", "t": "month", "limit": settings.limit_per_query},
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
            for item in payload.get("data", {}).get("children", []):
                data = item.get("data", {})
                permalink = data.get("permalink", "")
                post_url = f"https://www.reddit.com{permalink}" if permalink else data.get("url", "")
                complaint = " ".join(part for part in [data.get("title", ""), data.get("selftext", "")] if part)
                results.append(
                    RawCandidate(
                        platform="reddit",
                        username=data.get("author", "") or "",
                        profile_url=f"https://www.reddit.com/user/{data.get('author', '')}" if data.get("author") else "",
                        post_url=post_url,
                        post_date=datetime.fromtimestamp(
                            float(data.get("created_utc", 0)),
                            tz=timezone.utc,
                        ).isoformat(),
                        complaint_text=clip_text(complaint, 1200),
                        metadata={
                            "query": query,
                            "subreddit": data.get("subreddit", ""),
                            "score": data.get("score", 0),
                            "num_comments": data.get("num_comments", 0),
                        },
                    )
                )
    return results
