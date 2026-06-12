# Schema Migration

Artifact schema version `2.0` adds canonical entities, structured evidence,
contact provenance, semantic validation statuses, campaign metadata, quality
metrics, and execution reporting.

The application migration keeps legacy rows and evolves them in place:

- legacy prospect email fields remain as compatibility fields;
- legacy emails are backfilled into `contact_points`;
- legacy email drafts become outbound messages in durable conversations;
- proof-of-value artifacts attach to existing prospect and run records;
- inbound opt-outs close the conversation, disable the contact point, and add
  an immediate suppression.

Compatibility behavior:

- historical `local-template` mode values remain readable but execute through
  Jungle Grid for new runs;
- legacy `passed` and `failed` validation values remain parseable for stored
  records, but new worker artifacts must use semantic statuses;
- `junglegrid_relevance`, `agentMcpRelevance`,
  `aiWorkloadRelevance`, and `jungleGridComprehension` remain JSON compatibility
  aliases; campaign-relative labels are provided in `run_summary.json`;
- missing optional campaign, entity, evidence, and quality fields are accepted
  when reading historical runs;
- SQLite migrations add columns and the `junglegrid_jobs` table in place.
- SQLite migrations add `contact_points`, `proof_artifacts`, `conversations`,
  `messages`, `conversation_jobs`, and `policy_decisions`, then backfill legacy
  rows.
- the `jungle-grid-leads` command remains, but legacy stage names now submit the
  unified managed pipeline instead of maintaining a second local data model.

New consumers should use campaign metadata, `score_dimension_labels`,
structured evidence IDs, and semantic validation statuses rather than deriving
meaning from historical field names.
