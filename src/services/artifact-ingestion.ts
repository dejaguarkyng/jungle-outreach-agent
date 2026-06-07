import {
  artifactBundleSchema,
  requiredArtifactNames,
  validateEmailDraftArtifact,
  type ArtifactBundle,
} from "@/packages/shared/src";
import { OutreachRepository } from "@/src/db/repository";

function assertPublicUrl(value: string, label: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) {
    throw new Error(`${label} must be a public URL.`);
  }
}

export function validateArtifactBundle(
  input: unknown,
  options: { fitScoreThreshold: number; maxPerDomain: number },
): ArtifactBundle {
  const bundle = artifactBundleSchema.parse(input);
  if (!bundle.validation_report.valid) {
    throw new Error("The worker validation report marked the artifact bundle as invalid.");
  }
  const draftValidation = validateEmailDraftArtifact(bundle.email_drafts, options);
  if (!draftValidation.valid) {
    throw new Error(`Email artifact validation failed: ${draftValidation.errors.join(" ")}`);
  }

  const prospects = new Map(bundle.prospects.map((row) => [row.prospect_id, row]));
  const research = new Map(bundle.research_notes.map((row) => [row.prospect_id, row]));
  const scored = new Map(bundle.scored_prospects.map((row) => [row.prospect_id, row]));
  for (const draft of bundle.email_drafts) {
    const prospect = prospects.get(draft.prospect_id);
    const note = research.get(draft.prospect_id);
    const score = scored.get(draft.prospect_id);
    if (!prospect || !note || !score) {
      throw new Error(`Draft ${draft.prospect_id} is missing prospect, research, or score evidence.`);
    }
    if (
      prospect.email.toLowerCase() !== draft.email.toLowerCase() ||
      prospect.email_source_url !== draft.email_source_url ||
      score.fit_score !== draft.fit_score
    ) {
      throw new Error(`Draft ${draft.prospect_id} does not match its source records.`);
    }
    assertPublicUrl(draft.email_source_url, "Email source URL");
    for (const url of draft.evidence_urls) assertPublicUrl(url, "Evidence URL");
  }
  return bundle;
}

export function ingestArtifactBundle(
  input: unknown,
  repository = new OutreachRepository(),
): { drafted: number; failed: number; modelMode: "qwen" | "template" | "fallback" | null } {
  const settings = repository.getSettings();
  const bundle = validateArtifactBundle(input, {
    fitScoreThreshold: settings.fitScoreThreshold,
    maxPerDomain: settings.perDomainCap,
  });
  const notes = new Map(bundle.research_notes.map((row) => [row.prospect_id, row]));
  const scores = new Map(bundle.scored_prospects.map((row) => [row.prospect_id, row]));
  const prospects = new Map(bundle.prospects.map((row) => [row.prospect_id, row]));
  let drafted = 0;

  for (const artifactDraft of bundle.email_drafts) {
    const source = prospects.get(artifactDraft.prospect_id)!;
    const note = notes.get(artifactDraft.prospect_id)!;
    const score = scores.get(artifactDraft.prospect_id)!;
    const domain = artifactDraft.email.split("@")[1];
    if (
      repository.isBlocked(artifactDraft.email, domain) ||
      repository.isSuppressed(artifactDraft.email, domain)
    ) {
      continue;
    }
    const { prospect } = repository.upsertProspect({
      name: artifactDraft.name,
      email: artifactDraft.email,
      emailSourceUrl: artifactDraft.email_source_url,
      emailSourceType: source.email_source_type,
      githubUrl: source.project_url.includes("github.com") ? source.project_url : null,
      websiteUrl: source.project_url.includes("github.com") ? null : source.project_url,
      project: artifactDraft.project,
      projectKey: artifactDraft.project.toLowerCase(),
      projectDescription: source.project_description,
      category: artifactDraft.category,
      confidenceScore: note.evidence_strength,
    });
    repository.saveResearch(prospect.id, {
      summary: note.summary,
      personalizationDetail: note.personalization_detail,
      junglegridRelevance: note.junglegrid_relevance,
      evidenceUrls: note.evidence_urls,
    });
    repository.setScore(prospect.id, score.fit_score, score.score_breakdown);
    repository.setProspectStatus(prospect.id, "approved");
    repository.saveDraft(prospect.id, {
      subject: artifactDraft.subject,
      body: artifactDraft.body,
      wordCount: artifactDraft.word_count,
      links: artifactDraft.links,
      evidenceUrls: artifactDraft.evidence_urls,
      personalizationClaims: artifactDraft.personalization_claims,
      validationStatus: artifactDraft.validation_status,
      validationErrors: artifactDraft.validation_errors,
    });
    drafted += 1;
  }

  const modes = new Set(bundle.email_drafts.map((draft) => draft.model_mode));
  const modelMode = modes.size === 1 ? [...modes][0] : modes.has("fallback") ? "fallback" : null;
  return {
    drafted,
    failed: bundle.validation_report.failed,
    modelMode,
  };
}

export function artifactNames(): string[] {
  return [...requiredArtifactNames];
}
