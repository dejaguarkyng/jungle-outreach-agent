# Jungle Outreach Agent

## 1. What is Jungle Outreach Agent?

`jungle-outreach-agent` is an open-source research and outreach draft agent for
Jungle Grid. It discovers public professional contacts, records evidence,
scores fit, generates short drafts, validates artifacts, stores internal drafts,
and sends through ZeptoMail only after explicit manual approval.

## 2. Why Jungle Grid?

This is a Jungle Grid dogfooding application. Research, scoring, Qwen/Ollama
generation, retries, logs, and output artifacts run as managed workloads.
Developers can use the same pattern for GTM and internal agents without a paid
hosted model account.

## 3. Features

- Three modes: `local-template`, `junglegrid-template`, and `junglegrid-qwen`
- Public GitHub/project research with email provenance
- Evidence-bound fit scoring and personalization
- Qwen through Ollama inside the worker
- Strict JSON artifact contracts and backend revalidation
- Next.js dashboard, SQLite persistence, run logs, and artifact views
- Internal draft review plus manually approved ZeptoMail sending
- Suppression and blocklist controls before any send attempt
- Docker, GHCR publishing, CI, release automation, and sample dry-run data

## 4. Safety principles

- Publicly listed professional email addresses only
- No guessed, leaked, hidden, brokered, or unrelated commit addresses
- Every personalization claim requires public evidence
- Draft bodies are 60–80 words with exactly one link: https://junglegrid.dev
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
  -> Qwen/Ollama or templates
  -> /workspace/artifacts/*.json
  -> backend validation + persistence
  -> internal draft review database
  -> manually approved ZeptoMail send
```

ZeptoMail credentials are not available inside the worker. See
[docs/architecture.md](docs/architecture.md).

## 6. Quickstart

```bash
./scripts/setup.sh
npm run dev
```

Open `http://localhost:3000`. The default configuration is safe for local dry
runs, but production mode requires the manual setup listed below.

## 7. Running locally

```bash
npm run outreach:run:local -- --count 2
python3 workers/outreach/outreach_worker.py \
  --job full-run-template \
  --target 2 \
  --output ./artifacts \
  --input ./examples/sample-worker-input.json
```

Local template mode requires no Jungle Grid credits and no model runtime. See
[docs/local-development.md](docs/local-development.md).

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

The first command performs an estimate only. The full run uses
`qwen2.5:3b` by default. If Ollama or the model is unavailable, the worker uses
templates only when `LLM_FALLBACK_MODE=template`; fallback is recorded in logs
and `run_summary.json`.

## 10. ZeptoMail setup

Configure a ZeptoMail send-mail token, verified sender domain, sender address,
reply-to address, and a test recipient. `ZEPTOMAIL_API_BASE` is required and
configurable because account regions can differ. Sending remains disabled until
`EMAIL_SEND_MODE=manual_approval_only` and `DRY_RUN=false` are set intentionally.
See [docs/zeptomail-setup.md](docs/zeptomail-setup.md) and
[docs/zeptomail-implementation-notes.md](docs/zeptomail-implementation-notes.md).

## 11. Frontend dashboard

The dashboard includes:

- Daily progress, latest run, Jungle Grid job, validation, ZeptoMail, and model status
- Prospect filters, evidence, score breakdown, and blocklist controls
- Research approval/rejection
- Draft editing, validation, approval/rejection, suppression, and manual ZeptoMail sending
- Runs with job IDs, events, logs, artifacts, JSON/CSV export, and retry metadata
- Settings for mode, worker image, model, thresholds, dry-run, and safety limits
- Manual runs with mode, category, target, and live phase polling

Add release screenshots under `docs/screenshots/` and link them here.

## 12. CLI commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Build the production application |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run test` | Run TypeScript unit and UI tests |
| `npm run test:python` | Run worker smoke tests |
| `npm run outreach:run:local` | Run local research and deterministic templates |
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

## 13. Worker image

```bash
./scripts/build-worker-image.sh
./scripts/test-worker-local.sh
./scripts/push-worker-image.sh
```

The release image is
`ghcr.io/jungle-grid/outreach-qwen-worker:latest`. Two supported strategies are
documented in [docs/worker-image.md](docs/worker-image.md): pull the model at job
start, or publish a larger image with the model preloaded.

## 14. Releases

The project uses semantic versioning and Keep a Changelog. Planned milestones
are `v0.1.0` MVP, `v0.2.0` worker mode, `v0.3.0` Qwen mode, and `v1.0.0`
stable. See [docs/releasing.md](docs/releasing.md).

## 15. Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Use `dev` for active integration and
feature branches for pull requests.

## 16. Security

Report validation bypasses, token exposure, private contact data, or any email
send path privately as described in [SECURITY.md](SECURITY.md).

## 17. License

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
