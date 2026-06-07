from __future__ import annotations

import argparse

from . import classify, collect, dedupe, draft, reply, review, score
from .adapters import ADAPTER_REGISTRY
from .logging_utils import get_logger
from .models import LeadRecord, PipelineStats
from .review_state import merge_lead_review_state
from .settings import (
    QUALIFIED_LEADS_PATH,
    RAW_LEADS_PATH,
    TOP_LEADS_PATH,
    load_scoring_config,
    load_sources_config,
)
from .storage import ensure_runtime_files, read_leads, write_leads


def run_all(
    *,
    now_utc=None,
    sources_config=None,
    scoring_config=None,
    adapter_registry=None,
    client=None,
) -> PipelineStats:
    ensure_runtime_files()
    logger = get_logger()
    scoring = scoring_config or load_scoring_config()
    sources = sources_config or load_sources_config()
    registry = adapter_registry or ADAPTER_REGISTRY
    collected, collect_stats = collect.run(
        now_utc=now_utc,
        sources_config=sources,
        adapter_registry=registry,
        client=client,
    )
    deduped, dedupe_stats = dedupe.run(collected, scoring_config=scoring, persist_seen=True)
    classified = classify.run(deduped)
    scored = score.run(classified, scoring_config=scoring, now_utc=now_utc)
    qualified = draft.run(scored, scoring_config=scoring)
    top_leads = _select_top_leads(qualified, scoring.thresholds.top_n)
    top_leads = merge_lead_review_state(top_leads, read_leads(TOP_LEADS_PATH))
    write_leads(TOP_LEADS_PATH, top_leads)
    reply_queue = reply.run(top_leads, scoring_config=scoring)

    summary = PipelineStats(
        collected=collect_stats.collected,
        filtered=collect_stats.filtered + dedupe_stats.filtered + max(0, len(scored) - len(qualified)),
        qualified=len(qualified),
        dropped_reasons=_merge_counts(collect_stats.dropped_reasons, dedupe_stats.dropped_reasons),
        adapter_errors=collect_stats.adapter_errors,
    )
    logger.info(
        "pipeline_summary collected=%s filtered=%s qualified=%s top=%s",
        summary.collected,
        summary.filtered,
        summary.qualified,
        len(top_leads),
    )
    logger.info("reply_summary generated=%s", len(reply_queue))
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "collect":
        records, stats = collect.run()
        print(f"collected={stats.collected} accepted={len(records)} filtered={stats.filtered}")
        return 0
    if args.command == "dedupe":
        current = read_leads(RAW_LEADS_PATH)
        leads, stats = dedupe.run(current or None)
        print(f"deduped={len(leads)} filtered={stats.filtered}")
        return 0
    if args.command == "classify":
        leads = classify.run()
        print(f"classified={len(leads)}")
        return 0
    if args.command == "score":
        leads = score.run()
        print(f"scored={len(leads)}")
        return 0
    if args.command == "draft":
        leads = draft.run()
        top = _select_top_leads(leads, load_scoring_config().thresholds.top_n)
        write_leads(TOP_LEADS_PATH, top)
        print(f"qualified={len(leads)} top={len(top)}")
        return 0
    if args.command == "reply":
        queue = reply.run()
        print(f"reply_queue={len(queue)}")
        return 0
    if args.command == "review":
        return review.interactive_review()

    summary = run_all()
    print(
        " ".join(
            [
                f"collected={summary.collected}",
                f"filtered={summary.filtered}",
                f"qualified={summary.qualified}",
            ]
        )
    )
    return 0


def _select_top_leads(leads: list[LeadRecord], limit: int) -> list[LeadRecord]:
    ranked = sorted(leads, key=lambda item: (item.final_score, item.post_date), reverse=True)
    return ranked[:limit]


def _merge_counts(*mappings: dict[str, int]) -> dict[str, int]:
    merged: dict[str, int] = {}
    for mapping in mappings:
        for key, value in mapping.items():
            merged[key] = merged.get(key, 0) + value
    return merged


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Jungle Grid production lead engine")
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("collect", help="Collect fresh leads only")
    subparsers.add_parser("dedupe", help="Apply within-run and persistent-memory dedupe")
    subparsers.add_parser("classify", help="Classify pain types")
    subparsers.add_parser("score", help="Score leads with the weighted model")
    subparsers.add_parser("draft", help="Draft founder-style openers for qualified leads")
    subparsers.add_parser("reply", help="Generate reply variants for top qualified leads")
    subparsers.add_parser("review", help="Open the local review workflow")
    subparsers.add_parser("all", help="Run the full pipeline")
    parser.set_defaults(command="all")
    return parser


if __name__ == "__main__":
    raise SystemExit(main())
