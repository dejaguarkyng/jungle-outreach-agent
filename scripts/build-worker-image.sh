#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/jungle-grid/outreach-qwen-worker:latest}"
docker build --file Dockerfile.worker --tag "$IMAGE" .
