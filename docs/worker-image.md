# Worker Image

## Build and test

```bash
./scripts/build-worker-image.sh
./scripts/test-worker-local.sh
```

Override `IMAGE` to test another registry or tag.

## Strategy 1: lightweight model startup

The default image installs Ollama from its official architecture-specific
Linux package and includes the Python worker, Chromium, and
Playwright dependencies. The worker starts or connects to Ollama and pulls
`OLLAMA_MODEL` when Qwen mode begins. This keeps the image smaller but increases
cold-start time and requires model registry access.

## Strategy 2: preloaded model

Build a larger derivative image that starts Ollama during the image build,
pulls the selected model into `/root/.ollama`, and preserves that directory in
the final layer. This reduces job startup time but increases image transfer and
storage. Pin both the Ollama base image and model digest for reproducibility.

## Publish

```bash
docker login ghcr.io
IMAGE=ghcr.io/jungle-grid/outreach-qwen-worker:v0.1.0 \
  ./scripts/build-worker-image.sh
IMAGE=ghcr.io/jungle-grid/outreach-qwen-worker:v0.1.0 \
  ./scripts/push-worker-image.sh
```

Release tags publish the version tag and `latest` through GitHub Actions.
