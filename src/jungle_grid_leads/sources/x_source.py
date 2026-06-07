from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import httpx

from ..config import SourceSettings
from ..models import LeadSource, RawLead
from ..text_utils import stable_id
from .common import OptionalSourceError


def search(
    queries: dict[str, list[str]],
    settings: SourceSettings,
    recent_days: int,
    now: datetime,
    client: httpx.Client,
) -> list[RawLead]:
    token_env = settings.bearer_token_env or "X_API_BEARER_TOKEN"
    bearer_token = os.getenv(token_env, "")
    if not bearer_token:
        raise OptionalSourceError(
            "x",
            f"X source requires a bearer token in the {token_env} environment variable."
        )

    cutoff = now - timedelta(days=recent_days)
    fetched_at = now.astimezone(timezone.utc)
    headers = {"Authorization": f"Bearer {bearer_token}"}
    leads: list[RawLead] = []

    for theme, query_list in queries.items():
        for query in query_list:
            try:
                response = client.get(
                    "https://api.twitter.com/2/tweets/search/recent",
                    params={
                        "query": f"{query} lang:en -is:retweet",
                        "max_results": min(settings.limit_per_query, 100),
                        "tweet.fields": "created_at,author_id,lang,public_metrics",
                        "expansions": "author_id",
                        "user.fields": "username,name",
                    },
                    headers=headers,
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code if exc.response is not None else None
                if status_code in {401, 403}:
                    raise OptionalSourceError(
                        "x",
                        f"X API returned {status_code}; skipping the optional X source.",
                        status_code=status_code,
                    ) from exc
                raise
            payload = response.json()
            users = {user["id"]: user for user in payload.get("includes", {}).get("users", [])}

            for tweet in payload.get("data", []):
                created_at = datetime.fromisoformat(tweet["created_at"].replace("Z", "+00:00"))
                if created_at < cutoff:
                    continue
                user = users.get(tweet.get("author_id", ""), {})
                username = user.get("username", "")
                url = f"https://x.com/{username}/status/{tweet['id']}" if username else ""
                leads.append(
                    RawLead(
                        lead_id=stable_id("x", url, query, tweet.get("id", "")),
                        source=LeadSource.X,
                        query=query,
                        url=url,
                        title="",
                        author=username,
                        created_at=created_at.astimezone(timezone.utc),
                        fetched_at=fetched_at,
                        text=tweet.get("text", ""),
                        metadata={
                            "query_theme": theme,
                            "tweet_id": tweet.get("id"),
                            "public_metrics": tweet.get("public_metrics", {}),
                        },
                    )
                )

    return leads
