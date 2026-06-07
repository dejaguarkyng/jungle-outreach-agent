from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import warnings

import httpx

from .config import PipelineConfig
from .json_io import write_models
from .models import LeadSource
from .sources import github_issues, hackernews, reddit, x_source
from .sources.common import OptionalSourceError

SOURCE_HANDLERS = {
    LeadSource.REDDIT: reddit.search,
    LeadSource.GITHUB: github_issues.search,
    LeadSource.HACKERNEWS: hackernews.search,
    LeadSource.X: x_source.search,
}


def run(
    config: PipelineConfig,
    selected_sources: list[LeadSource] | None = None,
    output_dir: Path | None = None,
    now: datetime | None = None,
    client: httpx.Client | None = None,
) -> tuple[list[Path], int]:
    current_time = now or datetime.now(timezone.utc)
    selected = selected_sources or [
        source
        for source in LeadSource
        if config.discovery.sources.get(source.value, None)
        and config.discovery.sources[source.value].enabled
    ]
    target_dir = output_dir or config.paths.raw_dir
    timestamp = current_time.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    created_files: list[Path] = []
    total_count = 0

    managed_client = client or httpx.Client(timeout=30.0, follow_redirects=True)
    should_close = client is None

    try:
        for source in selected:
            settings = config.discovery.sources.get(source.value)
            if not settings or not settings.enabled:
                continue

            try:
                leads = SOURCE_HANDLERS[source](
                    queries=config.discovery.queries,
                    settings=settings,
                    recent_days=config.discovery.recent_days,
                    now=current_time,
                    client=managed_client,
                )
            except OptionalSourceError as exc:
                if settings.optional:
                    warnings.warn(f"Skipping optional source {source.value}: {exc}", stacklevel=2)
                    continue
                raise
            output_path = target_dir / source.value / f"{timestamp}.json"
            write_models(output_path, leads)
            created_files.append(output_path)
            total_count += len(leads)
    finally:
        if should_close:
            managed_client.close()

    return created_files, total_count
