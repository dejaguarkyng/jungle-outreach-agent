from __future__ import annotations

from pathlib import Path

from . import classify, dedupe, discover, draft, normalize, queue, score
from .config import PipelineConfig
from .models import LeadSource


def run_all(
    config: PipelineConfig,
    selected_sources: list[LeadSource] | None = None,
) -> dict[str, int]:
    raw_files, discovered_count = discover.run(config, selected_sources=selected_sources)
    normalized = normalize.run(config, input_paths=[Path(path) for path in raw_files])
    deduped = dedupe.run(config)
    classified = classify.run(config)
    scored = score.run(config)
    drafted = draft.run(config)
    queued = queue.run(config)

    return {
        "discovered": discovered_count,
        "normalized": len(normalized),
        "deduped": len(deduped),
        "classified": len(classified),
        "scored": len(scored),
        "drafted": len([item for item in drafted if item.outreach is not None]),
        "queued": len(queued),
    }
