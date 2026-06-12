# Openline

## 1. What is Openline?

Openline is an open-source, self-hostable prospect intelligence and outreach
research system powered by Jungle Grid. Users control campaigns, source
credentials, evidence, contacts, drafts, and exports. Jungle Grid provides
durable AI-job execution, batching, retries, logs, state, and artifacts.

## 2. Why Jungle Grid?

This is a Jungle Grid dogfooding application. Research, scoring, Qwen/Ollama
generation, retries, logs, and output artifacts run as managed workloads.
Developers can use the same pattern for GTM and internal agents without a paid
hosted model account.

## 3. Features

- Three backward-compatible mode names, all executed through Jungle Grid
- Configurable public-source adapter registry with GitHub, websites, feeds,
  package registries, community/news sources, jobs, research, funding, and
  restricted enrichment sources disabled unless authorized
- Public project research with email provenance
- Evidence-bound fit scoring and personalization
- Qwen through Ollama inside the worker
- Strict JSON artifact contracts and backend revalidation
- Next.js dashboard, SQLite persistence, run logs, and artifact views
- Internal draft review plus manually approved ZeptoMail sending
- Suppression and blocklist controls before any send attempt
- Docker, Docker Hub publishing, CI, release automation, and sample dry-run data

## 4. Safety principles

- Publicly listed professional email addresses only
- No guessed, leaked, hidden, brokered, or unrelated commit addresses
- Every personalization claim requires public evidence
- Draft bodies are 70-140 words with exactly one link: https://junglegrid.dev
- Semantic validation statuses are `send_ready`, `manual_review_required`,
  `regeneration_required`, and `excluded`; fallback drafts are never
  `send_ready`
- No attachments, tracking, pixels, calendar links, or automatic sending
- Internal drafts are stored only after artifact validation
- ZeptoMail sending is disabled by default and requires a manual dashboard click
- Bulk sending requires approved drafts plus the confirmation phrase `SEND APPROVED DRAFTS`
- First setup defaults to dry-run

See [docs/safety.md](docs/safety.md).

## 5. Architecture

```text
Next.js dashboard/API
  -> Jungle Grid REST API
  -> outreach worker
  -> public research + scoring
  -> Qwen/Ollama or deterministic templates inside the managed workload
  -> /workspace/artifacts/*.json
  -> backend validation + persistence
  -> internal draft review database
  -> manually approved ZeptoMail send
```

ZeptoMail credentials are not available inside the worker. See
[docs/architecture.md](docs/architecture.md).

## 6. Quickstart

```bash
npm run setup
npm run dev
```

Open `http://localhost:3000`. The UI can be inspected without credentials, but
campaign execution requires a working `JUNGLEGRID_API_KEY`.

`npm run setup` installs dependencies, prompts for the API key when run in a
terminal, verifies API reachability, estimates and submits a one-item template
workload, waits for completion, and checks its events, logs, and six artifacts.
The verification job uses Jungle Grid capacity and may incur a small charge.
Create a Jungle Grid account at [junglegrid.dev](https://junglegrid.dev), issue
an API key from the account dashboard, and provide it when setup prompts.

## 7. Development fixtures

```bash
python3 workers/outreach/outreach_worker.py \
  --job full-run-template \
  --target 2 \
  --output ./artifacts \
  --input ./examples/sample-worker-input.json
```

Direct worker execution is only for deterministic fixture and image testing.
It is not production eligible. The legacy `outreach:run:local` command remains
for CLI compatibility but now submits the Qwen workload through Jungle Grid.

## 8. Running on Jungle Grid

Set `JUNGLEGRID_API_KEY`, then:

```bash
npm run outreach:run:junglegrid -- --count 17
```

The backend submits the configured worker image, polls the job, downloads all
required artifacts, validates them, and stores local drafts.

## 9. Running Qwen/Ollama on Jungle Grid

```bash
npm run outreach:test:junglegrid:qwen
npm run outreach:run:junglegrid:qwen -- --count 17
```

The first command performs an estimate only. The full run uses `qwen2.5:3b` by
default. Production submissions force `LLM_FALLBACK_MODE=disabled`: a failed
model workload fails or degrades explicitly and never silently switches to a
local or external provider. Worker-only fixture tests may exercise fallback
reporting, but those outputs are not production eligible.

## 10. Source adapters

`config/sources.yaml` controls public discovery adapters. Core adapters use
public APIs, feeds, or public webpages where available; adapter hits are
reported as `source_signals` in `run_summary.json`. A source signal becomes a
prospect only when it resolves to an official repository or public official
site with acceptable contact provenance. Restricted sources remain disabled
unless the required authorized app/API configuration is present. Use
`OUTREACH_ADAPTER_FIXTURES=true` for deterministic adapter fixtures in local
worker testing. See [docs/source-adapters.md](docs/source-adapters.md) for
configuration, access constraints, error behavior, and adding an adapter.

## Campaigns

Campaign files under `config/campaigns/` configure the offer, ICP, qualification
signals, scoring interpretation, messaging, and per-stage model choices. The
manual-run screen can select any valid campaign. The included
`generic-saas.json` example targets release observability rather than AI
infrastructure, while still executing through Jungle Grid. See
[docs/campaign-configuration.md](docs/campaign-configuration.md).

## 11. ZeptoMail setup

Configure a ZeptoMail send-mail token, verified sender domain, sender address,
reply-to address, and a test recipient. `ZEPTOMAIL_API_BASE` is required and
configurable because account regions can differ. Sending remains disabled until
`EMAIL_SEND_MODE=manual_approval_only` and `DRY_RUN=false` are set intentionally.
See [docs/zeptomail-setup.md](docs/zeptomail-setup.md) and
[docs/zeptomail-implementation-notes.md](docs/zeptomail-implementation-notes.md).

## 12. Frontend dashboard

The dashboard includes:

- Daily progress, latest run, Jungle Grid job, validation, ZeptoMail, and model status
- Prospect filters, evidence, score breakdown, and blocklist controls
- Research approval/rejection
- Draft editing, validation, approval/rejection, suppression, and manual ZeptoMail sending
- Runs with job IDs, events, logs, artifacts, JSON/CSV export, and retry metadata
- Settings for mode, worker image, model, thresholds, dry-run, and safety limits
- Manual runs with mode, category, target, and live phase polling

Add release screenshots under `docs/screenshots/` and link them here.

## 13. CLI commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Build the production application |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run test` | Run TypeScript unit and UI tests |
| `npm run test:python` | Run worker smoke tests |
| `npm run outreach:run:local` | Legacy alias; submit the Qwen pipeline through Jungle Grid |
| `npm run outreach:run:junglegrid` | Run the template worker on Jungle Grid |
| `npm run outreach:run:junglegrid:qwen` | Run the Qwen/Ollama worker on Jungle Grid |
| `npm run outreach:test:junglegrid:qwen` | Estimate the Qwen worker contract without starting a job |
| `npm run outreach:discover` | Discover and store public contacts locally |
| `npm run outreach:research` | Collect public project evidence |
| `npm run outreach:score` | Score researched prospects |
| `npm run outreach:draft` | Generate local drafts for approved prospects |
| `npm run outreach:list` | List stored prospects |
| `npm run outreach:status` | Show dashboard totals and recent runs |
| `npm run outreach:export -- --format json` | Export prospects as JSON or CSV |
| `npm run outreach:zeptomail:test` | Send a controlled ZeptoMail test message to `ZEPTOMAIL_TEST_RECIPIENT` |
| `npm run outreach:jg:logs -- --job-id ID` | Print Jungle Grid job logs |
| `npm run outreach:jg:artifacts -- --job-id ID` | List managed job artifacts |

## 14. Worker image

```bash
./scripts/build-worker-image.sh
./scripts/test-worker-local.sh
./scripts/push-worker-image.sh
```

The release image is
`junglegrid/outreach-qwen-worker:latest`. Two supported strategies are
documented in [docs/worker-image.md](docs/worker-image.md): pull the model at job
start, or publish a larger image with the model preloaded.

## 15. Releases

The project uses semantic versioning and Keep a Changelog. Planned milestones
are `v0.1.0` MVP, `v0.2.0` worker mode, `v0.3.0` Qwen mode, and `v1.0.0`
stable. See [docs/releasing.md](docs/releasing.md).

## 16. Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Use `dev` for active integration and
feature branches for pull requests.

## 17. Security

Report validation bypasses, token exposure, private contact data, or any email
send path privately as described in [SECURITY.md](SECURITY.md).

## 18. License

Apache-2.0. It provides permissive reuse plus an explicit patent grant, which
is useful for a public infrastructure example intended for commercial and
open-source adoption.

## Manual setup

Required for production:

- A Jungle Grid API key
- A ZeptoMail send-mail token
- A verified ZeptoMail sender domain/address
- A compliant email use case before enabling `EMAIL_SEND_MODE=manual_approval_only`

Optional:

- A GitHub token for higher public API rate limits

No paid hosted model provider credential is required or supported.

## Execution persistence

Each managed run stores its estimate, Jungle Grid job ID, workspace and campaign
IDs, pipeline stage, execution phase, timestamps, retry count, log cursor,
artifacts, workload metadata, and failure reason. Restarting a run with an
already-submitted job resumes polling that job instead of submitting a duplicate.
Run summaries report `executionBackend: "jungle_grid"` and keep local and
external AI fallback counts at zero.

Active jobs are resumed automatically after a server restart. Failed and
timed-out attempts are retried through Jungle Grid up to the configured bound;
each attempt remains visible in the run detail page. Operators can cancel an
active remote job from the same page.

For Qwen campaigns, Jungle Grid also executes batched semantic research,
qualification, score explanations, angle selection, draft generation, and
semantic draft validation. Production ingestion fails closed if an applicable
semantic stage is missing or unsuccessful.

## Privacy and retention

Only public or explicitly authorized source data may be collected. Restricted
adapters do not process DMs, hidden channels, private groups, member lists, or
unapproved profile scraping. Contacts must retain their public source URL and
person-project relationship evidence. Source errors redact configured secrets.

Set `DATA_RETENTION_DAYS` to prune terminal runs, their dependent events and
execution records, stale prospects and dependent research/drafts, and old audit
logs at application startup. `0` disables automatic pruning. See
[docs/migration.md](docs/migration.md) for artifact and stored-data
compatibility notes.
