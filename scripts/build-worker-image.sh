#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-junglegrid/outreach-qwen-worker:latest}"
docker build --file Dockerfile.worker --tag "$IMAGE" .
