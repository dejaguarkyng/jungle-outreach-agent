import { z } from "zod";
import {
  ALLOWED_OUTREACH_LINKS,
  JUNGLEGRID_SITE,
  MAX_DRAFT_WORDS,
  MAX_SUBJECT_LENGTH,
  MIN_DRAFT_WORDS,
  outreachModes,
  workerJobs,
} from "./constants";

export const outreachModeSchema = z.enum(outreachModes);
export type OutreachMode = z.infer<typeof outreachModeSchema>;

export const workerJobSchema = z.enum(workerJobs);
export type WorkerJob = z.infer<typeof workerJobSchema>;

export const prospectStatuses = [
  "found",
  "researched",
  "scored",
  "approved",
  "drafted",
  "reviewed",
  "sent_manually",
  "replied",
  "ignored",
  "bounced",
  "blocked",
  "rejected",
] as const;

export const prospectStatusSchema = z.enum(prospectStatuses);
export type ProspectStatus = z.infer<typeof prospectStatusSchema>;

export const prospectCategories = [
  "agent_framework",
  "mcp",
  "workflow_automation",
  "ai_infrastructure",
  "llm_application",
  "inference_training",
  "open_source_ai",
  "agent_compute",
] as const;

export const prospectCategorySchema = z.enum(prospectCategories);
export type ProspectCategory = z.infer<typeof prospectCategorySchema>;

export const scoreBreakdownSchema = z.object({
  agentMcpRelevance: z.number().int().min(0).max(20),
  aiWorkloadRelevance: z.number().int().min(0).max(20),
  infrastructurePain: z.number().int().min(0).max(20),
  openSourceActivity: z.number().int().min(0).max(15),
  jungleGridComprehension: z.number().int().min(0).max(15),
  contactQuality: z.number().int().min(0).max(10),
});

export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;

export const prospectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  roleTitle: z.string().nullable(),
  email: z.string().email(),
  emailSourceUrl: z.string().url(),
  emailSourceType: z.enum([
    "github_profile",
    "repository_readme",
    "official_website",
    "project_docs",
    "package_page",
  ]),
  githubUsername: z.string().nullable(),
  githubUrl: z.string().url().nullable(),
  websiteUrl: z.string().url().nullable(),
  company: z.string().nullable(),
  project: z.string().min(1),
  projectKey: z.string().min(1),
  projectDescription: z.string().nullable(),
  category: prospectCategorySchema,
  fitScore: z.number().int().min(0).max(100).nullable(),
  scoreBreakdown: scoreBreakdownSchema.nullable(),
  confidenceScore: z.number().min(0).max(1).nullable(),
  status: prospectStatusSchema,
  domain: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Prospect = z.infer<typeof prospectSchema>;

export const researchNoteSchema = z.object({
  id: z.string(),
  prospectId: z.string(),
  summary: z.string().min(1),
  personalizationDetail: z.string().min(1),
  junglegridRelevance: z.string().min(1),
  evidenceUrls: z.array(z.string().url()).min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ResearchNote = z.infer<typeof researchNoteSchema>;

export const draftApprovalStatuses = ["pending_review", "approved", "rejected"] as const;
export const draftDeliveryStatuses = [
  "not_sent",
  "sending",
  "sent",
  "failed",
  "bounced",
  "replied",
] as const;

export const draftApprovalStatusSchema = z.enum(draftApprovalStatuses);
export const draftDeliveryStatusSchema = z.enum(draftDeliveryStatuses);
export type DraftApprovalStatus = z.infer<typeof draftApprovalStatusSchema>;
export type DraftDeliveryStatus = z.infer<typeof draftDeliveryStatusSchema>;

export const emailDraftSchema = z.object({
  id: z.string(),
  prospectId: z.string(),
  toEmail: z.string().email(),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  replyTo: z.string().email(),
  subject: z.string().min(1).max(MAX_SUBJECT_LENGTH),
  body: z.string().min(1),
  wordCount: z.number().int(),
  links: z.array(z.string().url()),
  evidenceUrls: z.array(z.string().url()),
  personalizationClaims: z.array(z.string().min(1)),
  validationStatus: z.enum(["passed", "failed"]),
  validationErrors: z.array(z.string()),
  approvalStatus: draftApprovalStatusSchema,
  deliveryStatus: draftDeliveryStatusSchema,
  approvedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  sentAt: z.string().nullable(),
  zeptomailMessageId: z.string().nullable(),
  zeptomailRequestId: z.string().nullable(),
  zeptomailError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EmailDraft = z.infer<typeof emailDraftSchema>;

export const suppressionSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  domain: z.string().nullable(),
  reason: z.string().min(1),
  source: z.string().min(1),
  createdAt: z.string(),
});

export type Suppression = z.infer<typeof suppressionSchema>;

export const modelModeSchema = z.enum(["qwen", "template", "fallback"]);

export const artifactEmailDraftSchema = z.object({
  prospect_id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  email_source_url: z.string().url(),
  project: z.string().min(1),
  category: prospectCategorySchema,
  fit_score: z.number().int().min(0).max(100),
  subject: z.string().trim().min(1).max(MAX_SUBJECT_LENGTH),
  body: z.string().trim().min(1),
  word_count: z.number().int().min(MIN_DRAFT_WORDS).max(MAX_DRAFT_WORDS),
  links: z
    .array(z.enum(ALLOWED_OUTREACH_LINKS))
    .min(1)
    .max(ALLOWED_OUTREACH_LINKS.length)
    .refine((links) => links.includes(JUNGLEGRID_SITE), {
      message: `links must include ${JUNGLEGRID_SITE}`,
    }),
  evidence_urls: z.array(z.string().url()).min(1),
  personalization_claims: z.array(z.string().trim().min(1)).min(1),
  model_mode: modelModeSchema,
  validation_status: z.enum(["passed", "failed"]),
  validation_errors: z.array(z.string()),
});

export type ArtifactEmailDraft = z.infer<typeof artifactEmailDraftSchema>;
export const emailDraftsArtifactSchema = z.array(artifactEmailDraftSchema);

export const artifactProspectSchema = z.object({
  prospect_id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  email_source_url: z.string().url(),
  email_source_type: z.enum([
    "github_profile",
    "repository_readme",
    "official_website",
    "project_docs",
    "package_page",
  ]),
  project: z.string().min(1),
  project_url: z.string().url(),
  project_description: z.string().default(""),
  category: prospectCategorySchema,
});

export const researchArtifactSchema = z.object({
  prospect_id: z.string().min(1),
  summary: z.string().min(1),
  personalization_detail: z.string().min(1),
  junglegrid_relevance: z.string().min(1),
  evidence_urls: z.array(z.string().url()).min(1),
  evidence_strength: z.number().min(0).max(1),
  evidence_points: z.array(z.string().min(1)).optional(),
  pain_signals: z.array(z.string().min(1)).optional(),
});

export const scoredProspectArtifactSchema = artifactProspectSchema.extend({
  fit_score: z.number().int().min(0).max(100),
  score_breakdown: scoreBreakdownSchema,
  evidence_strength: z.number().min(0).max(1).optional(),
  contact_quality: z.number().int().min(0).max(10).optional(),
  evidence_points: z.array(z.string().min(1)).optional(),
  why_this_person: z.string().min(1).optional(),
  why_now: z.string().min(1).optional(),
  concrete_pain_signal: z.string().min(1).optional(),
  suggested_angle: z.string().min(1).optional(),
  outreach_priority: z.enum(["high", "medium", "low"]).optional(),
  excluded: z.boolean().optional(),
});

export const runSummaryArtifactSchema = z.object({
  job: workerJobSchema,
  mode: outreachModeSchema,
  target: z.number().int().positive(),
  discovered: z.number().int().nonnegative(),
  researched: z.number().int().nonnegative(),
  scored: z.number().int().nonnegative(),
  drafts_passed: z.number().int().nonnegative(),
  drafts_failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  fallback_used: z.boolean(),
  model: z.string(),
  started_at: z.string(),
  completed_at: z.string(),
});

export const validationReportArtifactSchema = z.object({
  valid: z.boolean(),
  checked: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z.array(
    z.object({
      prospect_id: z.string(),
      errors: z.array(z.string()),
    }),
  ),
});

export const artifactBundleSchema = z.object({
  prospects: z.array(artifactProspectSchema),
  research_notes: z.array(researchArtifactSchema),
  scored_prospects: z.array(scoredProspectArtifactSchema),
  email_drafts: emailDraftsArtifactSchema,
  run_summary: runSummaryArtifactSchema,
  validation_report: validationReportArtifactSchema,
});

export type ArtifactBundle = z.infer<typeof artifactBundleSchema>;

export const runPhases = [
  "queued",
  "discovering",
  "researching",
  "scoring",
  "writing",
  "validating",
  "downloading_artifacts",
  "completed",
  "failed",
] as const;

export const runSchema = z.object({
  id: z.string(),
  runType: z.string(),
  mode: outreachModeSchema,
  junglegridJobId: z.string().nullable(),
  targetCount: z.number().int(),
  draftedCount: z.number().int(),
  failedCount: z.number().int(),
  retryCount: z.number().int(),
  modelMode: modelModeSchema.nullable(),
  artifacts: z.array(z.string()),
  phase: z.enum(runPhases),
  notes: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export type OutreachRun = z.infer<typeof runSchema>;

export const settingsSchema = z.object({
  dailyTarget: z.number().int().min(1).max(100),
  fitScoreThreshold: z.number().int().min(0).max(100),
  perDomainCap: z.number().int().min(1).max(20),
  mode: outreachModeSchema,
  modelName: z.string().trim().min(1),
  workerImage: z.string().trim().min(1),
  dryRun: z.boolean(),
  junglegridSite: z.literal(JUNGLEGRID_SITE),
});

export type OutreachSettings = z.infer<typeof settingsSchema>;
