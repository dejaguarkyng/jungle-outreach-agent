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
