#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-jungle-outreach-worker:test}"
OUTPUT="${OUTPUT:-$(pwd)/artifacts}"
JOB="${JOB:-full-run-template}"

mkdir -p "$OUTPUT"
docker build --file Dockerfile.worker --tag "$IMAGE" .
docker run --rm \
  -e FIT_SCORE_THRESHOLD=60 \
  -e MAX_DRAFTS_PER_DOMAIN=2 \
  -v "$OUTPUT:/workspace/artifacts" \
  --entrypoint python \
  "$IMAGE" \
  /app/outreach_worker.py \
  --job "$JOB" \
  --target 2 \
  --output /workspace/artifacts \
  --input /app/examples/sample-worker-input.json
