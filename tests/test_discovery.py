from __future__ import annotations

from datetime import datetime, timezone
import warnings
from pathlib import Path

import httpx

from jungle_grid_leads import discover
from jungle_grid_leads.models import LeadSource


def test_discover_writes_raw_files_with_mocked_sources(pipeline_config) -> None:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)

    def handler(request: httpx.Request) -> httpx.Response:
        if "reddit.com" in request.url.host:
            payload = {
                "data": {
                    "children": [
                        {
                            "data": {
                                "id": "r1",
                                "title": "GPU provider pain",
                                "author": "alice",
                                "created_utc": now.timestamp(),
                                "selftext": "We cannot get capacity from our provider.",
                                "permalink": "/r/mlops/comments/r1/gpu_provider_pain/",
                                "subreddit": "mlops",
                                "score": 10,
                                "num_comments": 2,
                            }
                        }
                    ]
                }
            }
            return httpx.Response(200, json=payload)

        if "hn.algolia.com" in request.url.host:
            payload = {
                "hits": [
                    {
                        "objectID": "42",
                        "created_at": now.isoformat().replace("+00:00", "Z"),
                        "author": "bob",
                        "title": "LLM deployment pain",
                        "comment_text": "Our team is blocked on GPU inference deployment.",
                        "points": 5,
                        "num_comments": 1,
                        "url": "https://example.com/hn-lead",
                    }
                ]
            }
            return httpx.Response(200, json=payload)

        return httpx.Response(404)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    files, total = discover.run(
        pipeline_config,
        selected_sources=[LeadSource.REDDIT, LeadSource.HACKERNEWS],
        now=now,
        client=client,
    )
    client.close()

    assert total == 6
    assert len(files) == 2
    assert all(Path(path).exists() for path in files)


def test_discover_skips_optional_x_on_403_and_continues_with_reddit_and_github(
    pipeline_config,
    monkeypatch,
) -> None:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    pipeline_config.discovery.sources["x"].enabled = True
    pipeline_config.discovery.sources["x"].optional = True
    monkeypatch.setenv("X_API_BEARER_TOKEN", "test-token")

    def handler(request: httpx.Request) -> httpx.Response:
        if "reddit.com" in request.url.host:
            payload = {
                "data": {
                    "children": [
                        {
                            "data": {
                                "id": "r1",
                                "title": "GPU provider pain",
                                "author": "alice",
                                "created_utc": now.timestamp(),
                                "selftext": "We cannot get capacity from our provider.",
                                "permalink": "/r/mlops/comments/r1/gpu_provider_pain/",
                                "subreddit": "mlops",
                                "score": 10,
                                "num_comments": 2,
                            }
                        }
                    ]
                }
            }
            return httpx.Response(200, json=payload)

        if "api.github.com" in request.url.host:
            payload = {
                "items": [
                    {
                        "id": 101,
                        "html_url": "https://github.com/acme/inference/issues/101",
                        "title": "GPU inference deployment keeps failing",
                        "body": "Our LLM deployment is blocked on GPU capacity and inference timeouts.",
                        "created_at": now.isoformat().replace("+00:00", "Z"),
                        "updated_at": now.isoformat().replace("+00:00", "Z"),
                        "state": "open",
                        "comments": 3,
                        "repository_url": "https://api.github.com/repos/acme/inference",
                        "user": {"login": "octocat"},
                        "labels": [{"name": "bug"}],
                    }
                ]
            }
            return httpx.Response(200, json=payload)

        if "api.twitter.com" in request.url.host:
            return httpx.Response(403, json={"title": "Forbidden"})

        return httpx.Response(404)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        files, total = discover.run(
            pipeline_config,
            selected_sources=[LeadSource.REDDIT, LeadSource.GITHUB, LeadSource.X],
            now=now,
            client=client,
        )
    client.close()

    assert total == 6
    assert len(files) == 2
    assert all("x" not in str(path).lower() for path in files)
    assert any("Skipping optional source x" in str(item.message) for item in caught)
