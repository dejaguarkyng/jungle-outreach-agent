# Local Development

## Requirements

- Node.js 20 or later
- npm
- Python 3.11 or later
- Docker for image tests

## Setup

```bash
./scripts/setup.sh
npm run dev
```

Use `JUNGLEGRID_MODE=local-template` and `DRY_RUN=true` when contributing
without Jungle Grid credits. Local mode uses deterministic templates and does
not require Ollama.

Run the worker directly:

```bash
python3 workers/outreach/outreach_worker.py \
  --job full-run-template \
  --target 2 \
  --output ./artifacts \
  --input ./examples/sample-worker-input.json
```

Before opening a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run test:python
npm run build
```
