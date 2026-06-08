export const JUNGLEGRID_SITE = "https://junglegrid.dev" as const;
export const ALLOWED_OUTREACH_LINKS = [JUNGLEGRID_SITE] as const;
export const MIN_DRAFT_WORDS = 70;
export const MAX_DRAFT_WORDS = 140;
export const MAX_SUBJECT_LENGTH = 79;

export const outreachModes = [
  "local-template",
  "junglegrid-template",
  "junglegrid-qwen",
] as const;

export const workerJobs = [
  "discover",
  "research",
  "score",
  "write-emails-template",
  "write-emails-qwen",
  "full-run-template",
  "full-run-qwen",
] as const;

export const requiredArtifactNames = [
  "prospects.json",
  "research_notes.json",
  "scored_prospects.json",
  "email_drafts.json",
  "run_summary.json",
  "validation_report.json",
] as const;
