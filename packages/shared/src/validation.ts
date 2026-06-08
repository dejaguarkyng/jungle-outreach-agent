import {
  ALLOWED_OUTREACH_LINKS,
  JUNGLEGRID_SITE,
  MAX_DRAFT_WORDS,
  MAX_SUBJECT_LENGTH,
  MIN_DRAFT_WORDS,
} from "./constants";
import {
  artifactEmailDraftSchema,
  emailDraftsArtifactSchema,
  type ArtifactEmailDraft,
} from "./schemas";

const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;
const trackingPattern =
  /(?:<img\b|tracking\s*pixel|utm_(?:source|medium|campaign)|pixel\.gif|open-tracking)/i;

export function countWords(body: string): number {
  return body
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function extractLinks(value: string): string[] {
  return (value.match(urlPattern) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ""));
}

export type DraftValidation = {
  valid: boolean;
  wordCount: number;
  linkCount: number;
  errors: string[];
};

export function validateDraftContent(subject: string, body: string): DraftValidation {
  const errors: string[] = [];
  const wordCount = countWords(body);
  const links = extractLinks(`${subject}\n${body}`);

  if (wordCount < MIN_DRAFT_WORDS || wordCount > MAX_DRAFT_WORDS) {
    errors.push(`Body must contain ${MIN_DRAFT_WORDS}-${MAX_DRAFT_WORDS} words; found ${wordCount}.`);
  }
  if (subject.trim().length > MAX_SUBJECT_LENGTH) {
    errors.push(`Subject must be under 80 characters; found ${subject.trim().length}.`);
  }
  if (links.length !== 1) {
    errors.push(`Draft must contain exactly 1 link; found ${links.length}.`);
  } else if (links.some((link) => !ALLOWED_OUTREACH_LINKS.includes(link as (typeof ALLOWED_OUTREACH_LINKS)[number]))) {
    errors.push(`Allowed links are: ${ALLOWED_OUTREACH_LINKS.join(", ")}.`);
  }
  if (!links.includes(JUNGLEGRID_SITE)) {
    errors.push(`Draft must include ${JUNGLEGRID_SITE}.`);
  }
  if (/<(?:a|script|style|html|body)\b/i.test(body) || trackingPattern.test(body)) {
    errors.push("HTML, tracking content, and tracking parameters are not allowed.");
  }
  if (/\b(?:cc|bcc):/i.test(body) || /\battachments?\b/i.test(body)) {
    errors.push("CC, BCC, and attachments are not allowed.");
  }
  if (/[\r\n](?:to|from|subject):/i.test(subject)) {
    errors.push("Subject contains invalid header content.");
  }

  return { valid: errors.length === 0, wordCount, linkCount: links.length, errors };
}

function significantProjectTerms(project: string): string[] {
  return project
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !["github", "com", "the"].includes(term));
}

export function validateArtifactDraft(draft: ArtifactEmailDraft): string[] {
  const errors = [...validateDraftContent(draft.subject, draft.body).errors];
  const calculatedWords = countWords(draft.body);
  if (draft.word_count !== calculatedWords) {
    errors.push(`word_count is ${draft.word_count}, but the body contains ${calculatedWords} words.`);
  }
  if (draft.validation_status !== "passed" || draft.validation_errors.length > 0) {
    errors.push("Worker marked the draft as failed.");
  }
  if (draft.evidence_urls.length === 0 || draft.personalization_claims.length === 0) {
    errors.push("Public evidence and personalization claims are required.");
  }
  if (!draft.email_source_url || !draft.evidence_urls.includes(draft.email_source_url)) {
    errors.push("The public email source URL must also be included in evidence_urls.");
  }
  const body = draft.body.toLowerCase();
  if (!significantProjectTerms(draft.project).some((term) => body.includes(term))) {
    errors.push("The body must mention the evidenced project or a project-specific detail.");
  }
  if (draft.fit_score < 0 || draft.fit_score > 100) {
    errors.push("fit_score must be between 0 and 100.");
  }
  return [...new Set(errors)];
}

export function validateEmailDraftArtifact(
  input: unknown,
  options: { fitScoreThreshold: number; maxPerDomain: number },
): { valid: boolean; drafts: ArtifactEmailDraft[]; errors: string[] } {
  const parsed = emailDraftsArtifactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      drafts: [],
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  const seenEmails = new Set<string>();
  const domainCounts = new Map<string, number>();
  const errors: string[] = [];
  for (const [index, rawDraft] of parsed.data.entries()) {
    const draft = artifactEmailDraftSchema.parse(rawDraft);
    const email = draft.email.toLowerCase();
    const domain = email.split("@")[1] ?? "";
    if (seenEmails.has(email)) errors.push(`[${index}] Duplicate email: ${email}.`);
    seenEmails.add(email);
    const domainCount = (domainCounts.get(domain) ?? 0) + 1;
    domainCounts.set(domain, domainCount);
    if (domainCount > options.maxPerDomain) {
      errors.push(`[${index}] Domain ${domain} exceeds the cap of ${options.maxPerDomain}.`);
    }
    if (draft.fit_score < options.fitScoreThreshold) {
      errors.push(`[${index}] Fit score ${draft.fit_score} is below ${options.fitScoreThreshold}.`);
    }
    for (const error of validateArtifactDraft(draft)) errors.push(`[${index}] ${error}`);
  }
  return { valid: errors.length === 0, drafts: parsed.data, errors };
}
