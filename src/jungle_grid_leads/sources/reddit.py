from __future__ import annotations

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
    headers = {"User-Agent": settings.user_agent}
    leads: list[RawLead] = []

    for theme, query_list in queries.items():
        for query in query_list:
            response = client.get(
                "https://www.reddit.com/search.json",
                params={"q": query, "sort": "new", "t": "month", "limit": settings.limit_per_query},
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
            for item in payload.get("data", {}).get("children", []):
                data = item.get("data", {})
                created_at = datetime.fromtimestamp(float(data.get("created_utc", 0)), tz=timezone.utc)
                if created_at < cutoff:
                    continue

                permalink = data.get("permalink", "")
                url = f"https://www.reddit.com{permalink}" if permalink else data.get("url", "")
                lead = RawLead(
                    lead_id=stable_id("reddit", url, query, data.get("id", "")),
                    source=LeadSource.REDDIT,
                    query=query,
                    url=url,
                    title=data.get("title", "") or "",
                    author=data.get("author", "") or "",
                    created_at=created_at,
                    fetched_at=fetched_at,
                    text=data.get("selftext", "") or data.get("title", "") or "",
                    metadata={
                        "query_theme": theme,
                        "subreddit": data.get("subreddit", ""),
                        "score": data.get("score", 0),
                        "num_comments": data.get("num_comments", 0),
                    },
                )
                leads.append(lead)

    return leads
