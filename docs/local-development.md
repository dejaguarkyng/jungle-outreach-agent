# Local Development

## Requirements

- Node.js 20 or later
- npm
- Python 3.11 or later
- Docker for image tests

## Setup

```bash
npm run setup
npm run dev
```

Setup submits a one-item Jungle Grid template workload and verifies status,
events, logs, and artifacts. It may incur a small Jungle Grid charge.

The dashboard and deterministic tests can run without Jungle Grid credentials.
Campaign execution cannot: every `runOutreach` mode requires
`JUNGLEGRID_API_KEY`. The legacy `local-template` mode name is mapped to a
Jungle Grid Qwen workload so old clients cannot bypass the required backend.

Run the worker directly:

```bash
python3 workers/outreach/outreach_worker.py \
  --job full-run-template \
  --target 2 \
  --output ./artifacts \
  --input ./examples/sample-worker-input.json
```

Direct worker runs are development simulations only and are not production
eligible. They do not represent the application execution path.

Before opening a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run test:python
npm run build
```
