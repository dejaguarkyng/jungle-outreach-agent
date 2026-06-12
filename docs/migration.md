# Schema Migration

Artifact schema version `2.0` adds canonical entities, structured evidence,
contact provenance, semantic validation statuses, campaign metadata, quality
metrics, and execution reporting.

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

New consumers should use campaign metadata, `score_dimension_labels`,
structured evidence IDs, and semantic validation statuses rather than deriving
meaning from historical field names.
