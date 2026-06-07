# Architecture

## Components

The root Next.js application owns the dashboard, route handlers, SQLite
persistence, ZeptoMail service, suppression controls, and the Jungle Grid
client. `packages/shared` owns schemas and validators. `workers/outreach` is
the isolated Python workload.

## Run flow

1. An operator starts a run and chooses a mode.
2. Local mode executes deterministic research and templates in the backend.
3. Jungle Grid modes submit `Dockerfile.worker` through `/v1/jobs`.
4. The worker discovers public contacts, researches evidence, scores fit, and
   writes six files under `/workspace/artifacts`.
5. The backend polls status, retrieves artifact metadata and signed downloads,
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

## Persistence

SQLite is the contributor default. `DATABASE_URL` points to the local file.
Tables retain prospects, evidence, scores, internal drafts, approval/delivery
state, ZeptoMail response metadata, run phases, Jungle Grid job IDs, events,
artifacts, blocklist entries, suppressions, settings, and audit records.
