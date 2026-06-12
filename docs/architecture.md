# Architecture

## Components

The root Next.js application owns the dashboard, route handlers, SQLite
persistence, ZeptoMail service, suppression controls, and the Jungle Grid
client. `packages/shared` owns schemas and validators. `workers/outreach` is
the isolated Python workload.

## Run flow

1. An operator starts a run and chooses a mode.
2. Every mode submits `Dockerfile.worker` through Jungle Grid. The old
   `local-template` value is a compatibility alias and does not bypass the
   managed execution backend.
3. The backend estimates the workload, persists an execution record, submits
   the job, and checkpoints queued, starting, running, and terminal phases.
4. The worker builds a source-adapter registry, records source health, discovers
   public contacts, researches clean evidence, scores fit, and writes six files
   under `/workspace/artifacts`.
5. The backend resumes an existing persisted job after a process restart,
   polls status, retrieves artifact metadata and signed downloads,
   parses every file, and revalidates all drafts.
6. Valid drafts are persisted locally. Invalid bundles fail closed.
7. Valid drafts are stored as internal review records with approval and delivery
   status.
8. An operator reviews evidence, edits the copy if needed, and explicitly
   approves or rejects the draft.
9. ZeptoMail is called only when an approved draft is manually sent from the
   dashboard. Bulk sends require the phrase `SEND APPROVED DRAFTS`.

## Artifact contract

- `prospects.json`
- `research_notes.json`
- `scored_prospects.json`
- `email_drafts.json`
- `run_summary.json`
- `validation_report.json`

The worker has no ZeptoMail credentials. The backend never trusts worker
validation alone.

`run_summary.json` records `status`, enabled/succeeded/degraded/failed sources,
adapter `source_signals`, raw and deduplicated counts, qualified/excluded
counts, model invocation attempts, primary model draft count, fallback draft
count, fallback reason, and latency. A fallback-only Qwen run must be
`degraded`.

Draft validation is semantic, not boolean. Worker artifacts may use
`send_ready`, `manual_review_required`, `regeneration_required`, or `excluded`.
The backend accepts fallback drafts only as `manual_review_required`; the send
path requires `send_ready` plus clean evidence, a public email source URL, one
allowed link, word-count limits, and domain caps.

## Source Registry

`workers/outreach/source_adapters.py` defines the adapter contract and registry.
Every source has a stable source type, capabilities, access method, required
credentials, permission notes, timeout/retry/rate-limit metadata, and health.
Core sources are enabled by configuration and use public APIs, feeds, or public
webpages where the platform provides them. The worker can run adapters in
deterministic fixture mode with `OUTREACH_ADAPTER_FIXTURES=true`.

Adapter candidates become draftable prospects only after they resolve to an
official repository or official website with public contact provenance. News,
HN, Reddit, Stack Exchange, YouTube, and arXiv items are treated as discovery
or why-now signals unless they point to an official project source; authors and
question posters are not used as contacts.

Adapters extract repository URLs, official URLs, and other resolved links from
API metadata, feed entries, descriptions, and public-page content. `source_signals`
include resolved repository/official URLs and evidence independence groups so
operators can distinguish a true project match from a third-party mention.
Syndicated copies can share a canonical event or content-derived independence
group; repeated press releases therefore do not count as independent evidence.

## Entity Resolution

The worker emits a conservative canonical graph on prospect artifacts. A
prospect has a `canonical_entity_id`, `canonical_entities`,
`verified_relationships`, and `conflicting_claims`. Entity types cover people,
projects, repositories, companies, domains, source documents, and contact
points. Relationships keep evidence IDs when a relationship is supported by a
structured claim. Conflicting domains or ownership hints are preserved as
conflicts instead of being merged by name similarity.

Research notes carry structured `evidence` items with claim type, source URL,
source type, authority, directness, freshness, independence group, and content
hash. Scored prospects expose `score_evidence_ids`, so every non-zero score
dimension can be traced back to specific evidence IDs. Backend ingestion checks
that score and relationship references point at known evidence IDs.

Restricted sources such as Discord, Slack, LinkedIn, Facebook Page enrichment,
and Product Hunt remain disabled or credential-gated unless explicit
authorization and approved API/configuration are present.

## Persistence

SQLite is the contributor default. `DATABASE_URL` points to the local file.
Tables retain prospects, evidence, scores, internal drafts, approval/delivery
state, ZeptoMail response metadata, run phases, Jungle Grid job IDs, events,
artifacts, blocklist entries, suppressions, settings, and audit records.

`junglegrid_jobs` is the durable workload ledger. It stores the run, workspace,
campaign, pipeline stage, estimate, remote job ID, normalized execution phase,
status message, submission/start/completion timestamps, retry count, log cursor,
artifact metadata, failure reason, workload metadata, and usage data when
available. Non-terminal rows are restart-recovery candidates.

Next.js server instrumentation scans that ledger during process startup and
resumes polling each non-terminal job. Recovery reuses the persisted remote job
ID and never submits a duplicate. A failed or timed-out attempt is retained,
then a new execution row is created for each bounded retry. Cancelled jobs are
terminal and are not retried. The run detail view exposes all attempts, their
pipeline stage, status, artifacts, and failure reason.

Operators can cancel an active run through
`POST /api/runs/:id/cancel` or the run detail screen. The API requests remote
cancellation first, then persists the cancelled state and audit event.

Production submissions disable worker template fallback. A failed Jungle Grid
or model workload may be retried through Jungle Grid or marked failed/degraded;
the application does not invoke a local or external AI provider.

## Workload Contract

Every submission carries `OUTREACH_JOB_CONTRACT`, a versioned JSON contract
containing workspace and campaign IDs, all pipeline stages, campaign
configuration, evidence policy, batching, concurrency, retry policy, and the
six-file output contract. Current stages are source discovery, research,
semantic qualification, entity resolution, scoring, drafting, and semantic
validation. Compatible stages execute within one bounded Jungle Grid batch job;
the backend does not create one remote job per prospect.

Qwen runs use structured batch inference for research analysis, semantic
qualification, evidence-bound score explanations, and outreach-angle selection.
Generated Qwen drafts pass through a second structured semantic-validation
batch. Deterministic qualification and content validators remain mandatory
fail-closed gates; model output cannot override exclusions caused by missing
primary evidence, contaminated content, contact provenance, or generic-package
rules. Production artifact ingestion rejects Qwen bundles that omit any
applicable semantic model stage.

Batch sizes, maximum active jobs, retry attempts, and retry backoff are
configured with the `JUNGLEGRID_*` variables documented in `.env.example`.
