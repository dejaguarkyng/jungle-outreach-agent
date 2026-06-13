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

## First-run operator flow

After `npm run dev`:

1. Open `Settings` and save the business profile.
2. Import suppressions if you have an existing do-not-contact list.
3. Open `Campaigns` and create a saved campaign from a preset.
4. Open `Prospects` and import CSV or JSON seed rows if you already have lead lists.
5. Add provider credentials and browser authorization only for the channels you intend to use.
6. Start a manual run from `/run`.

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
