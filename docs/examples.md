# Examples

`examples/sample-worker-input.json` contains two fictional, public-style
prospect records for deterministic dry runs.

Run:

```bash
python3 workers/outreach/outreach_worker.py \
  --job full-run-template \
  --target 2 \
  --output examples/sample-artifacts \
  --input examples/sample-worker-input.json
```

Inspect:

```bash
find examples/sample-artifacts -maxdepth 1 -type f -print
```

`email_drafts.json` follows the shared schema and contains only drafts that
passed validation. `validation_report.json` records skipped or failed
prospects, while `run_summary.json` records mode, model, fallback, and counts.

## Excluded keyword false positive

The regression fixtures submit `sindresorhus/yocto-queue` and
`feross/queue-microtask` as generic queue utilities. Both produce an exclusion
record with `generic_package_without_direct_ai_workload`; neither reaches
research, scoring, or drafting.

## Qualified multi-source prospect

A qualified prospect carries one canonical project entity, verified
person-project and contact relationships, clean primary-source evidence, and
score evidence IDs:

```json
{
  "project": "sample/mcp-worker",
  "fit_score": 78,
  "score_evidence_ids": {
    "aiWorkloadRelevance": ["ev_f9bc22aa682a5a6d"],
    "jungleGridComprehension": ["ev_be9b87c519d02a3a"],
    "contactQuality": ["ev_ccd04ee46bc73b97"]
  }
}
```

## Degraded model run

When Qwen is unavailable in a fixture run with template fallback enabled, the
summary is explicit and the draft cannot be send-ready:

```json
{
  "status": "degraded",
  "primary_model_generated": 0,
  "fallback_generated": 1,
  "fallback_reason": "qwen_or_ollama_unavailable"
}
```

## Manual review and send-ready drafts

A fallback draft uses `manual_review_required` with
`fallback generation requires manual review`. A primary-model draft becomes
`send_ready` only after qualification, deterministic validation, and semantic
model validation all succeed. The backend send path rejects every other status.
