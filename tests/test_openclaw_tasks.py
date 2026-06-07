from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import httpx

from jungle_grid_leads.cli import main as cli_main
from jungle_grid_leads.models import LeadSource
from jungle_grid_leads.openclaw_tasks import describe_contracts, run_task


def test_describe_contracts_includes_discover_and_pipeline(pipeline_config) -> None:
    contracts = describe_contracts(pipeline_config)

    assert set(contracts) == {"discover", "dedupe", "classify", "score", "draft", "queue", "pipeline"}
    assert contracts["discover"].internal_steps == ["discover", "normalize", "qualify"]
    assert contracts["pipeline"].internal_steps == [
        "discover",
        "normalize",
        "qualify",
        "dedupe",
        "classify",
        "score",
        "draft",
        "queue",
    ]


def test_run_discover_task_writes_success_manifest_and_normalized_output(pipeline_config) -> None:
    now = datetime(2026, 4, 8, 12, 0, tzinfo=timezone.utc)
    manifest_dir = pipeline_config.paths.raw_dir.parent / "openclaw-manifests"

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
    manifest = run_task(
        "discover",
        pipeline_config,
        selected_sources=[LeadSource.REDDIT, LeadSource.HACKERNEWS],
        manifest_dir=manifest_dir,
        now=now,
        client=client,
    )
    client.close()

    assert manifest.success is True
    assert manifest.stage_name == "discover"
    assert manifest.counts == {"discovered": 6, "normalized": 6}
    assert pipeline_config.paths.normalized_path.exists()
    assert str(pipeline_config.paths.normalized_path.resolve()) in manifest.output_files
    assert manifest.input_files == []
    assert manifest.error_message is None

    payload = json.loads(Path(manifest.manifest_path).read_text(encoding="utf-8"))
    assert payload["stage_name"] == "discover"
    assert payload["success"] is True


def test_run_task_failure_writes_manifest_with_error(pipeline_config) -> None:
    manifest = run_task(
        "queue",
        pipeline_config,
        manifest_dir=pipeline_config.paths.raw_dir.parent / "openclaw-manifests",
    )

    assert manifest.success is False
    assert manifest.stage_name == "queue"
    assert manifest.error_message is not None
    assert manifest.output_files == []

    payload = json.loads(Path(manifest.manifest_path).read_text(encoding="utf-8"))
    assert payload["stage_name"] == "queue"
    assert payload["success"] is False
    assert "error_message" in payload


def test_cli_task_contracts_outputs_json() -> None:
    exit_code = cli_main(["task-contracts", "--config", "config/settings.yaml", "--stage", "discover"])
    assert exit_code == 0
