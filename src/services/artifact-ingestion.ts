import {
  artifactBundleSchema,
  requiredArtifactNames,
  validateEmailDraftArtifact,
  type ArtifactBundle,
} from "@/packages/shared/src";
import { OutreachRepository } from "@/src/db/repository";
import { loadCampaignConfiguration } from "@/src/services/campaign-config";

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
  const campaign = loadCampaignConfiguration(bundle.run_summary.campaign_id ?? "jungle-grid");
  if (!bundle.validation_report.valid) {
    throw new Error("The worker validation report marked the artifact bundle as invalid.");
  }
  if (
    bundle.run_summary.mode === "junglegrid-qwen" &&
    bundle.run_summary.execution_backend === "jungle_grid"
  ) {
    const semantic = bundle.run_summary.semantic_stage_metrics;
    if (
      !semantic ||
      (bundle.prospects.length > 0 &&
        (!semantic.research_attempted ||
          !semantic.research_succeeded ||
          !semantic.qualification_attempted ||
          !semantic.qualification_succeeded ||
          !semantic.scoring_explanation_attempted ||
          !semantic.scoring_explanation_succeeded ||
          !semantic.angle_selection_attempted ||
          !semantic.angle_selection_succeeded)) ||
      (bundle.email_drafts.some((draft) => draft.model_mode === "qwen") &&
        (!semantic.validation_attempted || !semantic.validation_succeeded))
    ) {
      throw new Error(
        "Production Qwen runs must complete research, qualification, score explanation, angle selection, and semantic validation through the model workload.",
      );
    }
  }
  const fallbackDrafts = bundle.email_drafts.filter((draft) => draft.model_mode === "fallback").length;
  const primaryDrafts = bundle.email_drafts.filter((draft) => draft.model_mode === "qwen").length;
  if (fallbackDrafts > 0 && !bundle.run_summary.fallback_used) {
    throw new Error("Fallback drafts are present but run_summary.fallback_used is false.");
  }
  if (
    bundle.run_summary.mode === "junglegrid-qwen" &&
    fallbackDrafts > 0 &&
    primaryDrafts === 0 &&
    bundle.run_summary.status !== "degraded"
  ) {
    throw new Error("Fallback-only Qwen runs must be reported as degraded.");
  }
  if (
    bundle.run_summary.primary_model_generated !== undefined &&
    bundle.run_summary.primary_model_generated !== primaryDrafts
  ) {
    throw new Error("run_summary primary_model_generated does not match qwen drafts.");
  }
  if (
    bundle.run_summary.fallback_generated !== undefined &&
    bundle.run_summary.fallback_generated !== fallbackDrafts
  ) {
    throw new Error("run_summary fallback_generated does not match fallback drafts.");
  }
  const draftValidation = validateEmailDraftArtifact(bundle.email_drafts, {
    ...options,
    allowedLink: campaign.offer.url,
  });
  if (!draftValidation.valid) {
    throw new Error(`Email artifact validation failed: ${draftValidation.errors.join(" ")}`);
  }

  const prospects = new Map(bundle.prospects.map((row) => [row.prospect_id, row]));
  const research = new Map(bundle.research_notes.map((row) => [row.prospect_id, row]));
  const scored = new Map(bundle.scored_prospects.map((row) => [row.prospect_id, row]));
  for (const prospect of bundle.prospects) {
    const entityIds = new Set((prospect.canonical_entities ?? []).map((entity) => entity.entity_id));
    if (prospect.canonical_entity_id && !entityIds.has(prospect.canonical_entity_id)) {
      throw new Error(`Prospect ${prospect.prospect_id} canonical_entity_id is missing from canonical_entities.`);
    }
    for (const relationship of prospect.verified_relationships ?? []) {
      if (!entityIds.has(relationship.from_entity_id) || !entityIds.has(relationship.to_entity_id)) {
        throw new Error(`Prospect ${prospect.prospect_id} has a relationship with unknown entities.`);
      }
    }
  }
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
    const evidenceIds = new Set((note.evidence ?? []).map((item) => item.evidence_id));
    for (const item of score.evidence ?? []) evidenceIds.add(item.evidence_id);
    for (const ids of Object.values(score.score_evidence_ids ?? {})) {
      for (const id of ids) {
        if (!evidenceIds.has(id)) {
          throw new Error(`Draft ${draft.prospect_id} score references unknown evidence ${id}.`);
        }
      }
    }
    for (const relationship of prospect.verified_relationships ?? []) {
      for (const id of relationship.evidence_ids) {
        if (id && !evidenceIds.has(id)) {
          throw new Error(`Draft ${draft.prospect_id} relationship references unknown evidence ${id}.`);
        }
      }
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
