<div align="center">
  <img src="public/openline-logo.png" alt="OpenLine logo" width="120" height="120" />

  <h1>OpenLine</h1>

  <p><strong>Open-source contact discovery and prospect research powered by Jungle Grid.</strong></p>

  <p>
    OpenLine discovers organizations, investigates public sources, identifies publicly available contact channels, and produces structured prospect data for reviewable outreach workflows.
  </p>

  <p>
    <a href="https://github.com/Jungle-Grid/openline"><img alt="GitHub repository" src="https://img.shields.io/badge/GitHub-Repository-181717?logo=github" /></a>
    <a href="docs/architecture.md"><img alt="Documentation" src="https://img.shields.io/badge/Docs-Architecture-2563eb" /></a>
    <a href="https://discord.gg/kpJqxXFFCs"><img alt="Join the Jungle Grid Discord" src="https://img.shields.io/badge/Community-Discord-5865f2?logo=discord&logoColor=white" /></a>
    <a href="https://x.com/jungle_grid"><img alt="Follow Jungle Grid on X" src="https://img.shields.io/badge/Follow-@jungle__grid-000000?logo=x" /></a>
    <a href="mailto:run@junglegrid.dev"><img alt="Email Jungle Grid" src="https://img.shields.io/badge/Email-run%40junglegrid.dev-16a34a" /></a>
    <a href="https://junglegrid.dev"><img alt="Powered by Jungle Grid" src="https://img.shields.io/badge/Powered%20by-Jungle%20Grid-7c3aed" /></a>
    <a href="SECURITY.md"><img alt="Security contact" src="https://img.shields.io/badge/Contact-security%40junglegrid.dev-0f766e" /></a>
    <a href="LICENSE"><img alt="Apache-2.0 license" src="https://img.shields.io/badge/License-Apache--2.0-blue" /></a>
    <a href="https://github.com/Jungle-Grid/openline/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/Jungle-Grid/openline/actions/workflows/ci.yml/badge.svg" /></a>
  </p>

  <p><em>Powered by Jungle Grid for managed, asynchronous research workloads. OpenLine remains open source and self-hostable.</em></p>
</div>

## What is OpenLine?

OpenLine is an open-source, self-hostable prospect intelligence and contact discovery system. Developers can clone it, configure campaigns and sources, and adapt it for their own public research workflows.

OpenLine can collect leads and contact channels from supported public sources, preserve evidence, score fit, produce structured prospect data, and create reviewable outreach drafts. Jungle Grid is used as the execution layer for compute-heavy, asynchronous discovery, scraping, enrichment, extraction, model inference, research, and validation jobs.

Users must supply their own credentials, API keys, source configuration, and Jungle Grid access wherever required. OpenLine should only process public or explicitly authorized information, and operators are responsible for respecting platform terms, robots.txt, privacy rules, rate limits, and applicable laws.

## Who it is for

OpenLine is for teams and developers who want a self-hosted research system that keeps evidence, contacts, drafts, approvals, and delivery controls in their own application instead of a black-box outbound platform.

It is designed for:

- prospect research from public sources;
- evidence-bound contact discovery;
- campaign-specific scoring and qualification;
- reviewable first-touch outreach drafts;
- durable conversation tracking and approval gates;
- developers adding new source adapters or contact methods.

## What is implemented

- Business profile setup and saved campaigns in the UI.
- Configurable campaign contracts for offer, ICP, qualification, scoring, messaging, and model choices.
- Public-source adapter registry with health, retries, rate limits, source signals, and deterministic fixtures.
- Prospect research with public contact provenance and evidence URLs.
- Fit scoring, proof-of-value artifacts, and structured JSON exports.
- Managed Qwen/Ollama drafting and semantic validation inside the worker workload.
- Strict artifact contracts and backend revalidation before local persistence.
- Next.js dashboard, route handlers, SQLite persistence, run logs, artifact views, and exports.
- Seed prospect import from CSV or JSON with preview validation.
- Suppression import from CSV or JSON with preview validation.
- Internal draft review, editing, approval/rejection, suppression, blocklist controls, and policy-gated ZeptoMail sending.
- Conversation history, inbound reply ingestion, scheduled follow-up evaluation, and approval-required messages.
- Docker worker image workflow, CI, release automation, and sample dry-run data.

## Supported Sources

`config/sources.yaml` controls the adapter registry. Adapter hits are reported as `source_signals` in `run_summary.json`. A source signal becomes a prospect only when it resolves to an official repository or public official site with acceptable contact provenance.

### Fully supported sources

These adapters are implemented and enabled by default, subject to public endpoint availability and local configuration:

| Source | Access method | Notes |
| --- | --- | --- |
| GitHub | API | `GITHUB_TOKEN` is optional and improves rate limits. |
| Official websites | Public webpages | Used for public contact method discovery and provenance. |
| News/RSS | Feeds, APIs, public webpages | Discovery and why-now signals from configured feeds. |
| Hugging Face | API, public webpages | Models, spaces, and datasets. |
| Hacker News | API | Discovery signal; posters are not treated as contact targets. |
| GitLab | API | Project discovery. |
| npm | API | Package discovery with generic-package filtering. |
| PyPI | Public search page | Discovery signal from the public search page. |
| Docker Hub | API | Repository discovery. |
| Stack Exchange | API | Discovery signal; question authors are not treated as contact targets. |
| arXiv | API/feed | Research discovery signal. |
| Job listings | APIs, feeds, public webpages | Includes configured URLs and Remotive API. |
| Accelerators | APIs, feeds, public webpages | Uses configured public URLs. |
| Open Collective | Public search page | Funding/community discovery signal. |

### Experimental or credential-gated sources

These adapters exist in code but are disabled when required credentials are missing or authorization is not configured:

| Source | Required credentials | Status |
| --- | --- | --- |
| Reddit | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | Implemented, credential-gated. |
| YouTube | `YOUTUBE_API_KEY` | Implemented, credential-gated. |
| Discord | `DISCORD_BOT_TOKEN` | Restricted; authorized bot, visible channels only, no DMs. |
| Slack | `SLACK_BOT_TOKEN` | Restricted; authorized app, visible channels only, no DMs. |
| LinkedIn | `LINKEDIN_ENRICHMENT_API_KEY` | Restricted; approved API or user-supplied data only. |
| Facebook Pages | `META_ACCESS_TOKEN` | Restricted; approved Meta API or user-supplied public page URLs only. |
| Product Hunt | `PRODUCT_HUNT_TOKEN` | Restricted; approved API and commercial permission required. |

### Planned sources

No additional planned source adapters are advertised in this README because the repository does not currently contain an implementation contract for them. See [docs/source-adapters.md](docs/source-adapters.md) before adding a new source.

## High-level workflow

```text
Campaign criteria
  -> source adapter discovery
  -> public page/API/feed retrieval
  -> evidence extraction and normalization
  -> entity resolution and contact provenance checks
  -> qualification and fit scoring
  -> draft generation and semantic validation
  -> backend artifact validation
  -> SQLite persistence, review, export, and optional approved sending
```

## How Jungle Grid is used

OpenLine submits managed workloads through the Jungle Grid REST API from [src/providers/junglegrid-workload-provider.ts](src/providers/junglegrid-workload-provider.ts). The main run is asynchronous: the API route accepts a run, persists it locally, submits a remote job, and the UI polls local run state while the orchestrator polls Jungle Grid.

The production lead workflow submits the worker image and runs:

```bash
python /app/workers/outreach/outreach_worker.py \
  --job full-run-qwen \
  --target <count> \
  --output /workspace/artifacts
```

The template mode uses the same worker with `--job full-run-template`. Inbound replies and scheduled follow-ups submit a separate `conversation-turn-qwen` workload that returns `conversation_result.json`.

The backend handles remote execution by:

- estimating the workload before submission;
- storing each execution attempt in `junglegrid_jobs`;
- polling queued, starting, running, and terminal phases;
- recording remote status, events, logs, artifacts, failure reasons, retry count, and job IDs;
- retrying failed or timed-out attempts up to the configured bound;
- resuming non-terminal jobs after server restart without submitting duplicates;
- downloading required artifacts only after completion;
- validating every artifact bundle locally before saving drafts;
- allowing operators to cancel active remote jobs.

Required and relevant environment variables include:

| Variable | Purpose |
| --- | --- |
| `JUNGLEGRID_API_KEY` | Required to submit, poll, cancel, and inspect managed jobs. |
| `JUNGLEGRID_API_BASE` | API base URL; defaults to `https://api.junglegrid.dev`. |
| `JUNGLEGRID_DEFAULT_IMAGE` | Worker image submitted for managed runs. |
| `JUNGLEGRID_DEFAULT_WORKLOAD_TYPE` | Workload type used in job payloads. |
| `JUNGLEGRID_OPTIMIZE_FOR` | Routing preference for managed jobs. |
| `JUNGLEGRID_MAXIMUM_ATTEMPTS` | Maximum retry attempts. |
| `JUNGLEGRID_RETRY_BACKOFF_SECONDS` | Delay between retry attempts. |
| `JUNGLEGRID_POLL_INTERVAL_MS` | Polling interval for remote status. |
| `JUNGLEGRID_JOB_TIMEOUT_MS` | Local polling timeout. |
| `JUNGLEGRID_RESEARCH_BATCH_SIZE` | Research batch size passed in the job contract. |
| `JUNGLEGRID_SCORING_BATCH_SIZE` | Scoring batch size passed in the job contract. |
| `JUNGLEGRID_DRAFTING_BATCH_SIZE` | Drafting batch size passed in the job contract. |
| `JUNGLEGRID_VALIDATION_BATCH_SIZE` | Validation batch size passed in the job contract. |
| `JUNGLEGRID_REGISTRY_CREDENTIAL_ID` | Optional registry credential for private worker images. |
| `GITHUB_TOKEN` | Optional source credential for higher GitHub API limits. |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `YOUTUBE_API_KEY` | Required only for their credential-gated adapters. |
| `ZEPTOMAIL_*` | Required only for approved email delivery. ZeptoMail credentials are not passed to the worker. |

See [docs/architecture.md](docs/architecture.md), [docs/worker-image.md](docs/worker-image.md), and [docs/junglegrid-dogfooding.md](docs/junglegrid-dogfooding.md) for implementation details.

## Safety principles

- Publicly listed professional contact points only; no guessed or private contacts.
- No guessed, leaked, hidden, brokered, or unrelated commit addresses.
- Every personalization claim requires public evidence.
- Draft bodies are 70-140 words and must include exactly one allowed campaign link.
- Semantic validation statuses are `send_ready`, `manual_review_required`, `regeneration_required`, and `excluded`; fallback drafts are never `send_ready`.
- No attachments, tracking, pixels, or unapproved channel automation.
- Policy-autonomous email is allowed only after qualification, provenance, semantic validation, campaign, limit, opt-out, escalation, and managed-execution gates all pass.
- Internal drafts are stored only after artifact validation.
- ZeptoMail sending is disabled by default and requires a manual dashboard click.
- Bulk sending requires approved drafts plus the confirmation phrase `SEND APPROVED DRAFTS`.
- First setup defaults to dry-run.

See [docs/safety.md](docs/safety.md).

## Architecture

```text
Next.js dashboard/API
  -> managed workload API
  -> outreach worker
  -> public research + scoring
  -> Qwen/Ollama or deterministic templates inside the managed workload
  -> /workspace/artifacts/*.json
  -> backend validation + persistence
  -> internal draft review database
  -> manually approved ZeptoMail send
```

ZeptoMail credentials are not available inside the worker. See [docs/architecture.md](docs/architecture.md).

Inbound replies and scheduled follow-up evaluations run as separate managed conversation jobs. The backend persists their job IDs, applies deterministic policy gates, and sends only through an approved channel adapter.

## Quickstart

```bash
npm run setup
npm run dev
```

Open `http://localhost:3000`. The UI can be inspected without credentials, but campaign execution requires a working `JUNGLEGRID_API_KEY`.

Recommended first-run flow inside the app:

1. Open `Settings` and save the business profile.
2. Open `Campaigns` and create a saved campaign from a preset.
3. Open `Prospects` and import seed rows if you already have them.
4. Import suppressions in `Settings` if you have existing opt-outs or exclusions.
5. Configure only the provider credentials you plan to use.
6. Start a manual run.

`npm run setup` installs dependencies, prompts for the API key when run in a terminal, verifies API reachability, estimates and submits a one-item template workload, waits for completion, and checks its events, logs, and six artifacts. The verification job uses managed capacity and may incur a small charge. Create an account at [junglegrid.dev](https://junglegrid.dev), issue an API key from the account dashboard, and provide it when setup prompts.

## Manual setup

Required for production:

- A Jungle Grid API key.
- A ZeptoMail send-mail token.
- A verified ZeptoMail sender domain/address.

## Import formats

### Seed prospects CSV

Use headers like:

```csv
name,email,company,project,category,websiteUrl,githubUrl,projectDescription
Jane Maintainer,jane@example.com,Acme,Acme Platform,saas,https://acme.example,https://github.com/acme/platform,Durable workflow platform
```

### Seed prospects JSON

```json
[
  {
    "name": "Jane Maintainer",
    "email": "jane@example.com",
    "company": "Acme",
    "project": "Acme Platform",
    "category": "saas",
    "websiteUrl": "https://acme.example"
  }
]
```

### Suppressions CSV

```csv
email,domain,reason,source
,no-contact.example,manual suppression,operator_import
blocked@example.com,,customer opt-out,crm_import
```

### Suppressions JSON

```json
[
  {
    "domain": "no-contact.example",
    "reason": "manual suppression",
    "source": "operator_import"
  }
]
```
- A compliant email use case before enabling `EMAIL_SEND_MODE=manual_approval_only`.

Optional:

- A GitHub token for higher public API rate limits.
- Source-specific credentials for adapters such as Reddit and YouTube.

No paid hosted model provider credential is required or supported.

## Development fixtures

```bash
python3 workers/outreach/outreach_worker.py \
  --job full-run-template \
  --target 2 \
  --output ./artifacts \
  --input ./examples/sample-worker-input.json
```

Direct worker execution is only for deterministic fixture and image testing. It is not production eligible. The legacy `outreach:run:local` command remains for CLI compatibility but now submits the Qwen workload through the managed pipeline.

## Running managed jobs

Set `JUNGLEGRID_API_KEY`, then:

```bash
npm run outreach:run:junglegrid -- --count 17
```

The backend submits the configured worker image, polls the job, downloads all required artifacts, validates them, and stores local drafts.

For Qwen/Ollama workloads:

```bash
npm run outreach:test:junglegrid:qwen
npm run outreach:run:junglegrid:qwen -- --count 17
```

The first command performs an estimate only. The full run uses `qwen2.5:3b` by default. Production submissions force `LLM_FALLBACK_MODE=disabled`: a failed model workload fails or degrades explicitly and never silently switches to a local or external provider. Worker-only fixture tests may exercise fallback reporting, but those outputs are not production eligible.

## Campaigns

Campaign files under `config/campaigns/` configure the offer, ICP, qualification signals, scoring interpretation, messaging, and per-stage model choices. The manual-run screen can select any valid campaign. The included `generic-saas.json` example targets release observability rather than AI infrastructure while still executing through the managed worker. See [docs/campaign-configuration.md](docs/campaign-configuration.md).

## ZeptoMail setup

Configure a ZeptoMail send-mail token, verified sender domain, sender address, reply-to address, and a test recipient. `ZEPTOMAIL_API_BASE` is required and configurable because account regions can differ. Sending remains disabled until `EMAIL_SEND_MODE=manual_approval_only` and `DRY_RUN=false` are set intentionally. See [docs/zeptomail-setup.md](docs/zeptomail-setup.md) and [docs/zeptomail-implementation-notes.md](docs/zeptomail-implementation-notes.md).

## Frontend dashboard

The dashboard includes:

- Daily progress, latest run, managed job, validation, ZeptoMail, and model status.
- Prospect filters, evidence, score breakdown, and blocklist controls.
- Research approval/rejection.
- Draft editing, validation, approval/rejection, suppression, and manual ZeptoMail sending.
- Runs with job IDs, events, logs, artifacts, JSON/CSV export, and retry metadata.
- Settings for mode, worker image, model, thresholds, dry-run, and safety limits.
- Manual runs with mode, category, target, and live phase polling.
- Conversation history, opportunity state, follow-up dates, managed job status, and approval-required messages.

Add release screenshots under `docs/screenshots/` and link them here.

## CLI commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Build the production application. |
| `npm run start` | Start the production server. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm run test` | Run TypeScript unit and UI tests. |
| `npm run test:python` | Run worker smoke tests. |
| `npm run outreach:run:local` | Legacy alias; submit the Qwen pipeline through the managed worker. |
| `npm run outreach:run:junglegrid` | Run the template worker on Jungle Grid. |
| `npm run outreach:run:junglegrid:qwen` | Run the Qwen/Ollama worker on Jungle Grid. |
| `npm run outreach:test:junglegrid:qwen` | Estimate the Qwen worker contract without starting a job. |
| `npm run outreach:discover` | Legacy alias for the unified managed pipeline. |
| `npm run outreach:research` | Legacy alias for the unified managed pipeline. |
| `npm run outreach:score` | Legacy alias for the unified managed pipeline. |
| `npm run outreach:draft` | Legacy alias for the unified managed pipeline. |
| `npm run outreach:list` | List stored prospects. |
| `npm run outreach:status` | Show dashboard totals and recent runs. |
| `npm run outreach:export -- --format json` | Export prospects as JSON or CSV. |
| `npm run outreach:zeptomail:test` | Send a controlled ZeptoMail test message to `ZEPTOMAIL_TEST_RECIPIENT`. |
| `npm run outreach:jg:logs -- --job-id ID` | Print managed job logs. |
| `npm run outreach:jg:artifacts -- --job-id ID` | List managed job artifacts. |

## Worker image

```bash
./scripts/build-worker-image.sh
./scripts/test-worker-local.sh
./scripts/push-worker-image.sh
```

The release image is `junglegrid/outreach-qwen-worker:latest`. Two supported strategies are documented in [docs/worker-image.md](docs/worker-image.md): pull the model at job start, or publish a larger image with the model preloaded.

## Adding a new source or contact method

Source adapters live in [workers/outreach/source_adapters.py](workers/outreach/source_adapters.py), with configuration in [config/sources.yaml](config/sources.yaml). To add a source:

1. Add a stable ID to `CORE_SOURCES` or `RESTRICTED_SOURCES`.
2. Declare credentials, access methods, authorization requirements, and permissions in `default_capabilities`.
3. Add a `_discover_<source_id>` method that uses an official API, feed, or permitted public page.
4. Return `SourceCandidate` records with source IDs, URLs, publication dates, retrieval methods, and metadata.
5. Reuse the shared fetch, normalize, retry, throttling, caching, and redacted error behavior.
6. Add deterministic fixture tests and credential-disabled tests.

Do not add anti-bot bypasses, private-channel collection, guessed contacts, or undocumented endpoints. Contact methods must preserve their public source URL, confidence, listing status, and authorization status.

## Execution persistence

Each managed run stores its estimate, remote job ID, workspace and campaign IDs, pipeline stage, execution phase, timestamps, retry count, log cursor, artifacts, workload metadata, and failure reason. Restarting a run with an already-submitted job resumes polling that job instead of submitting a duplicate. Run summaries report `executionBackend: "jungle_grid"` and keep local and external AI fallback counts at zero.

Active jobs are resumed automatically after a server restart. Failed and timed-out attempts are retried up to the configured bound; each attempt remains visible in the run detail page. Operators can cancel an active remote job from the same page.

For Qwen campaigns, the managed worker also executes batched semantic research, qualification, score explanations, angle selection, draft generation, and semantic draft validation. Production ingestion fails closed if an applicable semantic stage is missing or unsuccessful.

## Privacy and retention

Only public or explicitly authorized source data may be collected. Restricted adapters do not process DMs, hidden channels, private groups, member lists, or unapproved profile scraping. Contacts must retain their public source URL and person-project relationship evidence. Source errors redact configured secrets.

Set `DATA_RETENTION_DAYS` to prune terminal runs, their dependent events and execution records, stale prospects and dependent research/drafts, and old audit logs at application startup. `0` disables automatic pruning. See [docs/migration.md](docs/migration.md) for artifact and stored-data compatibility notes.

## Releases

The project uses semantic versioning and Keep a Changelog. Planned milestones are `v0.1.0` MVP, `v0.2.0` worker mode, `v0.3.0` Qwen mode, and `v1.0.0` stable. See [docs/releasing.md](docs/releasing.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Use `dev` for active integration and feature branches for pull requests.

## Security

Report validation bypasses, token exposure, private contact data, or any email send path privately as described in [SECURITY.md](SECURITY.md).

## License

Apache-2.0. It provides permissive reuse plus an explicit patent grant, which is useful for a public infrastructure example intended for commercial and open-source adoption.

## Compatibility command

The historical `jungle-grid-leads` Python command remains available as a compatibility adapter. Its former independent local stages were removed; each legacy stage name submits the same OpenLine managed pipeline used by the web application and TypeScript CLI.
