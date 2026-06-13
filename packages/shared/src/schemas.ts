import { z } from "zod";
import {
  DEFAULT_ALLOWED_OUTREACH_URL,
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
  "developer_tool",
  "data_platform",
  "security",
  "saas",
  "other",
] as const;

export const prospectCategorySchema = z.enum(prospectCategories);
export type ProspectCategory = z.infer<typeof prospectCategorySchema>;

export const campaignConfigurationSchema = z.object({
  schemaVersion: z.literal("1.0"),
  workspaceId: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  active: z.boolean().default(true),
  offer: z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    url: z.string().url(),
    senderName: z.string().trim().min(1),
    signature: z.string().trim().min(1),
  }),
  businessInformation: z
    .object({
      description: z.string().trim().min(1),
      website: z.string().url(),
    })
    .optional(),
  customerProblems: z.array(z.string().trim().min(1)).default([]),
  idealCustomerProfile: z.object({
    description: z.string().trim().min(1),
    categories: z.array(prospectCategorySchema).min(1),
    targetTerms: z.array(z.string().trim().min(1)).min(1),
    workloadTerms: z.array(z.string().trim().min(1)).min(1),
    executionTerms: z.array(z.string().trim().min(1)).default([]),
    painTerms: z.array(z.string().trim().min(1)).default([]),
    exclusionTerms: z.array(z.string().trim().min(1)).default([]),
  }),
  qualification: z.object({
    requireTargetSignal: z.boolean().default(true),
    requireWorkloadSignal: z.boolean().default(true),
    requireExecutionSignal: z.boolean().default(false),
    requirePainSignal: z.boolean().default(false),
    maximumActivityAgeDays: z.number().int().min(1).max(3650).default(180),
  }),
  discovery: z
    .object({
      maximumConcurrentSources: z.number().int().min(1).max(32).default(8),
      maximumConcurrentEnrichments: z.number().int().min(1).max(64).default(12),
      queryBudgetPerSource: z.number().int().min(1).max(20).default(3),
      candidateBudgetPerQuery: z.number().int().min(1).max(50).default(8),
      candidateBudgetPerSource: z.number().int().min(1).max(200).default(24),
      deadlineSeconds: z.number().int().min(30).max(1800).default(180),
      preliminaryTargetMultiplier: z.number().min(1).max(10).default(3),
      minimumDistinctSources: z.number().int().min(1).max(10).default(1),
      cacheTtlSeconds: z.number().int().min(0).max(86400).default(900),
    })
    .default({
      maximumConcurrentSources: 8,
      maximumConcurrentEnrichments: 12,
      queryBudgetPerSource: 3,
      candidateBudgetPerQuery: 8,
      candidateBudgetPerSource: 24,
      deadlineSeconds: 180,
      preliminaryTargetMultiplier: 3,
      minimumDistinctSources: 1,
      cacheTtlSeconds: 900,
    }),
  scoring: z
    .object({
      dimensions: z
        .array(
          z.object({
            key: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
            label: z.string().trim().min(1),
            maximumScore: z.number().int().min(1).max(100),
            acceptedClaimTypes: z.array(z.string().trim().min(1)).min(1),
            minimumIndependentEvidence: z.number().int().min(1).max(10).default(1),
            minimumSourceAuthority: z.number().min(0).max(1).default(0.5),
            minimumFreshness: z.number().min(0).max(1).default(0),
            acceptedDirectness: z
              .array(z.enum(["direct", "strong_inference", "weak_inference"]))
              .min(1)
              .default(["direct", "strong_inference"]),
            requiredSignals: z.array(z.string().trim().min(1)).default([]),
            required: z.boolean().default(false),
          }),
        )
        .min(1),
    })
    .optional(),
  sourceDiversity: z
    .object({
      minimumDistinctSources: z.number().int().min(1).max(10).default(1),
      maximumEvidencePerSource: z.number().int().min(1).max(100).optional(),
      maximumProspectsPerEntity: z.number().int().min(1).max(100).default(1),
    })
    .default({
      minimumDistinctSources: 1,
      maximumProspectsPerEntity: 1,
    }),
  messaging: z.object({
    positioning: z.string().trim().min(1),
    callToAction: z.string().trim().min(1),
    subjectPrefix: z.string().trim().min(1),
  }),
  proofOfValue: z
    .object({
      strategy: z.string().trim().min(1),
      artifactTypes: z.array(z.string().trim().min(1)).min(1),
      maximumArtifactsPerProspect: z.number().int().min(1).max(5).default(1),
      minimumScore: z.number().int().min(0).max(100).default(70),
    })
    .default({
      strategy: "implementation_plan",
      artifactTypes: ["implementation_plan"],
      maximumArtifactsPerProspect: 1,
      minimumScore: 70,
    }),
  channels: z.array(z.string().trim().min(1)).default(["email"]),
  delivery: z
    .object({
      firstTouchRequiresApproval: z.boolean().default(true),
      browserAutomationEnabled: z.boolean().default(false),
      allowedBrowserDomains: z.array(z.string().trim().min(1)).default([]),
      screenshotRetentionDays: z.number().int().min(1).max(90).default(7),
      providers: z
        .record(
          z.object({
            enabled: z.boolean().default(false),
            allowedChannels: z.array(z.string().trim().min(1)).default([]),
          }),
        )
        .default({}),
    })
    .default({
      firstTouchRequiresApproval: true,
      browserAutomationEnabled: false,
      allowedBrowserDomains: [],
      screenshotRetentionDays: 7,
      providers: {},
    }),
  conversionGoal: z.string().trim().min(1).default("qualified_conversation"),
  autonomy: z
    .object({
      mode: z.enum(["draft_only", "confirmation_required", "policy_autonomous"]),
      maximumFollowUps: z.number().int().min(0).max(20),
      minimumScore: z.number().int().min(0).max(100),
      escalationTerms: z.array(z.string().trim().min(1)),
    })
    .default({
      mode: "draft_only",
      maximumFollowUps: 0,
      minimumScore: 70,
      escalationTerms: ["legal", "security", "contract", "pricing"],
    }),
  execution: z.object({
    researchModel: z.string().trim().min(1),
    scoringModel: z.string().trim().min(1),
    draftingModel: z.string().trim().min(1),
    validationModel: z.string().trim().min(1),
  }),
});

export type CampaignConfiguration = z.infer<typeof campaignConfigurationSchema>;

export const legacyScoreBreakdownSchema = z.object({
  agentMcpRelevance: z.number().int().min(0).max(20),
  aiWorkloadRelevance: z.number().int().min(0).max(20),
  infrastructurePain: z.number().int().min(0).max(20),
  openSourceActivity: z.number().int().min(0).max(15),
  jungleGridComprehension: z.number().int().min(0).max(15),
  contactQuality: z.number().int().min(0).max(10),
});

export const scoreBreakdownSchema = z.record(
  z.string().min(1),
  z.number().int().min(0).max(100),
);

export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;

export const contactPointTypes = [
  "email",
  "official_contact_form",
  "github_profile",
  "github_discussions",
  "github_issue",
  "linkedin_profile",
  "linkedin_company",
  "discord",
  "slack",
  "x",
  "facebook_page",
  "instagram_business",
  "whatsapp_business",
  "business_phone",
  "booking_link",
  "integration_form",
  "partnership_form",
  "marketplace_form",
  "community_forum",
  "feature_request_portal",
] as const;
export const contactPointTypeSchema = z.enum(contactPointTypes);
export type ContactPointType = z.infer<typeof contactPointTypeSchema>;

export const contactPointSchema = z.object({
  id: z.string(),
  prospectId: z.string(),
  type: contactPointTypeSchema,
  value: z.string().min(1),
  sourceUrl: z.string().url(),
  publiclyListed: z.boolean(),
  authorized: z.boolean(),
  confidence: z.number().min(0).max(1),
  status: z.enum(["active", "invalid", "opted_out", "blocked"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ContactPoint = z.infer<typeof contactPointSchema>;

export const prospectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  roleTitle: z.string().nullable(),
  email: z.union([z.string().email(), z.literal("")]),
  emailSourceUrl: z.union([z.string().url(), z.literal("")]),
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
  domain: z.string(),
  contactPoints: z.array(contactPointSchema).optional(),
  qualificationJunglegridJobId: z.string().nullable().optional(),
  scoringJunglegridJobId: z.string().nullable().optional(),
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
  junglegridJobId: z.string().nullable().optional(),
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
export const semanticValidationStatuses = [
  "send_ready",
  "manual_review_required",
  "regeneration_required",
  "excluded",
] as const;
export const legacyValidationStatuses = ["passed", "failed"] as const;
export const draftValidationStatuses = [
  ...semanticValidationStatuses,
  ...legacyValidationStatuses,
] as const;
export const draftValidationStatusSchema = z.enum(draftValidationStatuses);
export type DraftValidationStatus = z.infer<typeof draftValidationStatusSchema>;

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
  validationStatus: draftValidationStatusSchema,
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

export const proofArtifactSchema = z.object({
  id: z.string(),
  prospectId: z.string(),
  runId: z.string().nullable(),
  type: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  uri: z.string().nullable(),
  evidenceIds: z.array(z.string()),
  junglegridJobId: z.string().min(1),
  createdAt: z.string(),
});
export type ProofArtifact = z.infer<typeof proofArtifactSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  prospectId: z.string(),
  campaignId: z.string(),
  contactPointId: z.string(),
  channel: contactPointTypeSchema,
  status: z.enum(["draft", "active", "waiting", "won", "lost", "opted_out", "closed"]),
  opportunityState: z.enum(["unqualified", "qualified", "engaged", "evaluating", "committed", "won", "lost"]),
  summary: z.string(),
  openQuestions: z.array(z.string()),
  commitments: z.array(z.string()),
  objections: z.array(z.string()),
  followUpAt: z.string().nullable(),
  optedOutAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  channel: contactPointTypeSchema,
  body: z.string().min(1),
  subject: z.string().nullable(),
  status: z.enum(["draft", "approval_required", "approved", "sent", "received", "blocked", "failed"]),
  classification: z.string().nullable(),
  validationStatus: draftValidationStatusSchema,
  evidenceIds: z.array(z.string()).default([]),
  junglegridJobId: z.string().nullable(),
  policyDecisionId: z.string().nullable(),
  externalMessageId: z.string().nullable(),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
});
export type Message = z.infer<typeof messageSchema>;

export const deliveryCapabilitySchema = z.enum([
  "available",
  "approval_required",
  "blocked_configuration",
  "manual_delivery",
]);
export type DeliveryCapability = z.infer<typeof deliveryCapabilitySchema>;

export const deliveryAdapterStatusSchema = z.object({
  adapterId: z.string().min(1),
  configured: z.boolean(),
  available: z.boolean(),
  channels: z.array(contactPointTypeSchema),
  missingCredentials: z.array(z.string()),
  message: z.string(),
});
export type DeliveryAdapterStatus = z.infer<typeof deliveryAdapterStatusSchema>;

export const providerAuthorizationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  provider: z.string(),
  destinationPattern: z.string(),
  permissions: z.array(z.string()),
  status: z.enum(["active", "revoked", "expired"]),
  authorizedBy: z.string(),
  authorizedAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type ProviderAuthorization = z.infer<typeof providerAuthorizationSchema>;

export const deliveryAttemptSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  messageId: z.string(),
  adapterId: z.string(),
  attemptNumber: z.number().int().positive(),
  status: z.enum(["queued", "sending", "sent", "blocked", "retryable", "failed"]),
  retryClass: z.enum(["none", "transient", "rate_limited", "authentication", "permanent"]),
  providerResponse: z.record(z.unknown()),
  externalMessageId: z.string().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type DeliveryAttempt = z.infer<typeof deliveryAttemptSchema>;

export const autonomyModeSchema = z.enum([
  "draft_only",
  "confirmation_required",
  "policy_autonomous",
]);
export type AutonomyMode = z.infer<typeof autonomyModeSchema>;

export const conversationTurnResultSchema = z.object({
  schema_version: z.literal("1.0"),
  classification: z.enum([
    "interested",
    "question",
    "objection",
    "not_now",
    "opt_out",
    "wrong_person",
    "other",
  ]),
  summary: z.string().min(1),
  open_questions: z.array(z.string()),
  commitments: z.array(z.string()),
  objections: z.array(z.string()),
  follow_up_at: z.string().nullable(),
  opportunity_state: z.enum([
    "qualified",
    "engaged",
    "evaluating",
    "committed",
    "won",
    "lost",
  ]),
  next_action: z.enum(["respond", "follow_up_later", "escalate", "close"]),
  response_subject: z.string().nullable(),
  response_body: z.string().nullable(),
  validation_status: z.enum([
    "send_ready",
    "manual_review_required",
    "regeneration_required",
    "excluded",
  ]),
  validation_reasons: z.array(z.string()),
  escalation_required: z.boolean(),
});
export type ConversationTurnResult = z.infer<typeof conversationTurnResultSchema>;

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
  links: z.array(z.string().url()).length(1),
  evidence_urls: z.array(z.string().url()).min(1),
  personalization_claims: z.array(z.string().trim().min(1)).min(1),
  model_mode: modelModeSchema,
  validation_status: draftValidationStatusSchema,
  validation_errors: z.array(z.string()),
});

export type ArtifactEmailDraft = z.infer<typeof artifactEmailDraftSchema>;
export const emailDraftsArtifactSchema = z.array(artifactEmailDraftSchema);

export const artifactMessageDraftSchema = z.object({
  prospect_id: z.string().min(1),
  contact_point: z.object({
    type: contactPointTypeSchema,
    value: z.string().min(1),
    source_url: z.string().url(),
    publicly_listed: z.boolean(),
    authorized: z.boolean(),
    confidence: z.number().min(0).max(1),
  }),
  channel: contactPointTypeSchema,
  content_type: z.enum([
    "email",
    "direct_message",
    "discussion",
    "issue",
    "form",
    "phone_script",
  ]),
  subject: z.string().max(MAX_SUBJECT_LENGTH).nullable(),
  body: z.string().trim().min(1),
  word_count: z.number().int().positive(),
  links: z.array(z.string().url()),
  evidence_urls: z.array(z.string().url()).min(1),
  personalization_claims: z.array(z.string().trim().min(1)).min(1),
  evidence_ids: z.array(z.string().min(1)).min(1),
  fit_score: z.number().int().min(0).max(100),
  model_mode: modelModeSchema,
  delivery_capability: z.enum([
    "available",
    "approval_required",
    "blocked_configuration",
    "manual_delivery",
  ]),
  approval_status: z.enum(["approval_required", "approved", "rejected"]),
  validation_status: draftValidationStatusSchema,
  validation_errors: z.array(z.string()),
  junglegrid_job_id: z.string().min(1),
});
export type ArtifactMessageDraft = z.infer<typeof artifactMessageDraftSchema>;
export const messageDraftsArtifactSchema = z.array(artifactMessageDraftSchema);

export const artifactProofSchema = z.object({
  prospect_id: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  uri: z.string().nullable(),
  evidence_ids: z.array(z.string().min(1)).min(1),
  junglegrid_job_id: z.string().min(1),
});
export type ArtifactProof = z.infer<typeof artifactProofSchema>;
export const proofArtifactsArtifactSchema = z.array(artifactProofSchema);

export const artifactEnvelope = <T extends z.ZodTypeAny>(items: T) =>
  z.object({
    schema_version: z.literal("3.0"),
    items,
  });

export const canonicalEntitySchema = z.object({
  entity_id: z.string().min(1),
  entity_type: z.enum([
    "person",
    "project",
    "repository",
    "company",
    "domain",
    "package",
    "model",
    "social_profile",
    "source_document",
    "contact_point",
  ]),
  canonical_name: z.string(),
  aliases: z.array(z.string()),
  source_specific_ids: z.record(z.string()),
  confidence: z.number().min(0).max(1),
});

export const canonicalRelationshipSchema = z.object({
  relationship_type: z.string().min(1),
  from_entity_id: z.string().min(1),
  to_entity_id: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence_ids: z.array(z.string()),
});

export const conflictingClaimSchema = z.object({
  claim: z.string().min(1),
  values: z.array(z.string()).min(1),
  resolution: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const structuredEvidenceSchema = z.object({
  evidence_id: z.string().min(1),
  entity_id: z.string().min(1),
  claim_type: z.enum([
    "ai_workload",
    "target_workload",
    "infrastructure_pain",
    "activity",
    "role",
    "contact",
    "why_now",
    "integration_surface",
    "product_fit",
  ]),
  claim: z.string().min(1),
  source_url: z.string().url(),
  source_type: z.string().min(1),
  source_authority: z.number().min(0).max(1),
  published_at: z.string().nullable(),
  retrieved_at: z.string(),
  directness: z.enum(["direct", "strong_inference", "weak_inference"]),
  freshness: z.number().min(0).max(1),
  independence_group: z.string().min(1),
  content_hash: z.string().min(1),
  clean: z.boolean(),
});

export const artifactProspectSchema = z.object({
  prospect_id: z.string().min(1),
  schema_version: z.literal("3.0"),
  entity_id: z.string().optional(),
  canonical_entity_id: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  email_source_url: z.string().url().optional(),
  email_source_type: z.enum([
    "github_profile",
    "repository_readme",
    "official_website",
    "project_docs",
    "package_page",
  ]).optional(),
  contact_points: z
    .array(
      z.object({
        type: contactPointTypeSchema,
        value: z.string().min(1),
        source_url: z.string().url(),
        publicly_listed: z.boolean().default(true),
        authorized: z.boolean().default(false),
        confidence: z.number().min(0).max(1),
      }),
    )
    .optional(),
  project: z.string().min(1),
  project_key: z.string().optional(),
  project_url: z.string().url(),
  project_description: z.string().default(""),
  category: prospectCategorySchema,
  canonical_entities: z.array(canonicalEntitySchema).optional(),
  verified_relationships: z.array(canonicalRelationshipSchema).optional(),
  conflicting_claims: z.array(conflictingClaimSchema).optional(),
  contact_provenance: z
    .object({
      value: z.string(),
      source_url: z.string().url(),
      source_type: z.string(),
      publicly_listed: z.boolean(),
      person_project_match: z.string(),
      verification_method: z.string(),
      confidence: z.number().min(0).max(1),
      collected_at: z.string(),
      appropriate_use_category: z.string(),
    })
    .optional(),
});

export const researchArtifactSchema = z.object({
  prospect_id: z.string().min(1),
  entity_id: z.string().optional(),
  summary: z.string().min(1),
  personalization_detail: z.string().min(1),
  junglegrid_relevance: z.string().min(1),
  evidence_urls: z.array(z.string().url()).min(1),
  evidence_strength: z.number().min(0).max(1),
  evidence_points: z.array(z.string().min(1)).optional(),
  pain_signals: z.array(z.string().min(1)).optional(),
  evidence: z.array(structuredEvidenceSchema).optional(),
  semantic_research_analysis: z.string().min(1).optional(),
  semantic_qualification_reason: z.string().min(1).optional(),
  semantic_score_explanation: z.string().min(1).optional(),
  semantic_suggested_angle: z.string().min(1).optional(),
  junglegrid_job_id: z.string().min(1).optional(),
});

export const scoredProspectArtifactSchema = artifactProspectSchema.extend({
  fit_score: z.number().int().min(0).max(100),
  score_breakdown: scoreBreakdownSchema,
  legacy_score_breakdown: legacyScoreBreakdownSchema.optional(),
  evidence_strength: z.number().min(0).max(1).optional(),
  evidence: z.array(structuredEvidenceSchema).optional(),
  score_evidence_ids: z.record(z.array(z.string())).optional(),
  contact_quality: z.number().int().min(0).max(10).optional(),
  evidence_points: z.array(z.string().min(1)).optional(),
  why_this_person: z.string().min(1).optional(),
  why_now: z.string().min(1).optional(),
  concrete_pain_signal: z.string().min(1).optional(),
  suggested_angle: z.string().min(1).optional(),
  score_explanation: z.string().min(1).optional(),
  outreach_priority: z.enum(["high", "medium", "low"]).optional(),
  excluded: z.boolean().optional(),
  exclusion_reasons: z.array(z.string().min(1)).optional(),
  junglegrid_job_id: z.string().min(1).optional(),
});

export const prospectsFileSchema = artifactEnvelope(z.array(artifactProspectSchema));
export const researchNotesFileSchema = artifactEnvelope(z.array(researchArtifactSchema));
export const scoredProspectsFileSchema = artifactEnvelope(
  z.array(scoredProspectArtifactSchema),
);
export const proofArtifactsFileSchema = artifactEnvelope(proofArtifactsArtifactSchema);
export const messageDraftsFileSchema = artifactEnvelope(messageDraftsArtifactSchema);

export const runSummaryArtifactSchema = z.object({
  schema_version: z.literal("3.0"),
  status: z.enum(["successful", "degraded", "failed"]).optional(),
  job: workerJobSchema,
  mode: outreachModeSchema,
  target: z.number().int().positive(),
  workspace_id: z.string().optional(),
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  offer_name: z.string().optional(),
  execution_backend: z.enum(["jungle_grid", "jungle_grid_mock"]).optional(),
  junglegrid_job_id: z.string().optional(),
  production_eligible: z.boolean().optional(),
  score_dimension_labels: z.record(z.string()).optional(),
  job_contract_schema_version: z.string().optional(),
  pipeline_stages: z.array(z.string()).optional(),
  sources_enabled: z.array(z.string()).optional(),
  sources_succeeded: z.array(z.string()).optional(),
  sources_degraded: z.array(z.string()).optional(),
  sources_failed: z.array(z.string()).optional(),
  exclusion_reasons: z.record(z.number().int().nonnegative()).optional(),
  quality_metrics: z
    .object({
      qualification_gate_pass_rate: z.number().min(0).max(1),
      contamination_rejection_rate: z.number().min(0).max(1).nullable(),
      duplicate_collapse_count: z.number().int().nonnegative(),
      scored_criteria_with_evidence_ids_percentage: z.number().min(0).max(100),
      fallback_rate: z.number().min(0).max(1),
      semantic_rejection_reasons: z.record(z.number().int().nonnegative()),
    })
    .optional(),
  source_signals: z
    .array(
      z.object({
        source_type: z.string(),
        source_id: z.string().optional(),
        url: z.string().url().optional(),
        title: z.string().optional(),
        evidence_count: z.number().int().nonnegative().optional(),
        repository_url: z.string().optional(),
        official_url: z.string().optional(),
        independence_groups: z.array(z.string()).optional(),
        status: z.string().optional(),
        health_status: z
          .enum(["healthy", "empty", "degraded", "failed", "productive", "timeout"])
          .optional(),
        timeout_reason: z.string().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
  source_metrics: z
    .record(
      z.string(),
      z.object({
        queries: z.number().int().nonnegative(),
        candidates: z.number().int().nonnegative(),
        evidence_items: z.number().int().nonnegative(),
        prospects: z.number().int().nonnegative(),
        qualified: z.number().int().nonnegative(),
        cache_hits: z.number().int().nonnegative(),
        requests: z.number().int().nonnegative(),
        duration_ms: z.number().int().nonnegative(),
        status: z.enum(["healthy", "empty", "degraded", "failed", "productive", "timeout"]),
        timeout_reason: z.string().optional(),
      }),
    )
    .optional(),
  stage_durations_ms: z
    .record(z.string(), z.number().int().nonnegative())
    .optional(),
  discovered_raw: z.number().int().nonnegative().optional(),
  deduplicated_entities: z.number().int().nonnegative().optional(),
  canonical_relationships: z.number().int().nonnegative().optional(),
  qualified: z.number().int().nonnegative().optional(),
  excluded: z.number().int().nonnegative().optional(),
  discovered: z.number().int().nonnegative(),
  researched: z.number().int().nonnegative(),
  scored: z.number().int().nonnegative(),
  drafted: z.number().int().nonnegative().optional(),
  drafts_passed: z.number().int().nonnegative(),
  drafts_failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  fallback_used: z.boolean(),
  requested_model: z.string().optional(),
  model_invocation_attempted: z.boolean().optional(),
  model_invocation_succeeded: z.boolean().optional(),
  primary_model_generated: z.number().int().nonnegative().optional(),
  fallback_generated: z.number().int().nonnegative().optional(),
  fallback_reason: z.string().optional(),
  semantic_stage_metrics: z
    .object({
      research_attempted: z.boolean(),
      research_succeeded: z.boolean(),
      qualification_attempted: z.boolean(),
      qualification_succeeded: z.boolean(),
      scoring_explanation_attempted: z.boolean(),
      scoring_explanation_succeeded: z.boolean(),
      angle_selection_attempted: z.boolean(),
      angle_selection_succeeded: z.boolean(),
      validation_attempted: z.boolean(),
      validation_succeeded: z.boolean(),
      failure_reason: z.string(),
    })
    .optional(),
  model_retries: z.number().int().nonnegative().optional(),
  model_latency_ms: z.number().int().nonnegative().optional(),
  model: z.string(),
  started_at: z.string(),
  completed_at: z.string(),
});

export const validationReportArtifactSchema = z.object({
  schema_version: z.literal("3.0"),
  valid: z.boolean(),
  checked: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  send_ready: z.number().int().nonnegative().optional(),
  manual_review_required: z.number().int().nonnegative().optional(),
  regeneration_required: z.number().int().nonnegative().optional(),
  excluded: z.number().int().nonnegative().optional(),
  errors: z.array(
    z.object({
      prospect_id: z.string(),
      errors: z.array(z.string()),
    }),
  ),
});

export const artifactBundleSchema = z.object({
  schema_version: z.literal("3.0"),
  prospects: z.array(artifactProspectSchema),
  research_notes: z.array(researchArtifactSchema),
  scored_prospects: z.array(scoredProspectArtifactSchema),
  proof_artifacts: proofArtifactsArtifactSchema,
  message_drafts: messageDraftsArtifactSchema,
  run_summary: runSummaryArtifactSchema,
  validation_report: validationReportArtifactSchema,
});

export type ArtifactBundle = z.infer<typeof artifactBundleSchema>;

export const runPhases = [
  "queued",
  "preparing",
  "estimating",
  "submitting",
  "starting",
  "running",
  "discovering",
  "researching",
  "scoring",
  "writing",
  "validating",
  "downloading_artifacts",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "blocked",
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
  runSummary: runSummaryArtifactSchema.nullable().default(null),
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
  maximumConcurrentSources: z.number().int().min(1).max(32).default(8),
  maximumConcurrentEnrichments: z.number().int().min(1).max(64).default(12),
  discoveryDeadlineSeconds: z.number().int().min(30).max(1800).default(180),
  sourceQueryBudget: z.number().int().min(1).max(20).default(3),
  sourceCandidateBudget: z.number().int().min(1).max(200).default(24),
  preliminaryTargetMultiplier: z.number().min(1).max(10).default(3),
  minimumDistinctSources: z.number().int().min(1).max(10).default(1),
  sourceCacheTtlSeconds: z.number().int().min(0).max(86400).default(900),
  maximumEvidencePerSource: z.number().int().min(1).max(100).default(25),
  maximumProspectsPerEntity: z.number().int().min(1).max(100).default(1),
  proofMinimumScore: z.number().int().min(0).max(100).default(70),
  browserAutomationEnabled: z.boolean().default(false),
  browserAllowedDomains: z.array(z.string().trim().min(1)).default([]),
  screenshotRetentionDays: z.number().int().min(1).max(90).default(7),
  dataRetentionDays: z.number().int().min(0).max(3650).default(0),
  defaultAllowedOutreachUrl: z.literal(DEFAULT_ALLOWED_OUTREACH_URL),
});

export type OutreachSettings = z.infer<typeof settingsSchema>;

export const businessArchetypeSchema = z.enum([
  "software",
  "local_services",
  "agency_services",
]);
export type BusinessArchetype = z.infer<typeof businessArchetypeSchema>;

export const businessProfileSchema = z.object({
  id: z.string(),
  companyName: z.string().trim().min(1),
  website: z.string().url(),
  description: z.string().trim().min(1),
  archetype: businessArchetypeSchema,
  offerName: z.string().trim().min(1),
  offerDescription: z.string().trim().min(1),
  offerUrl: z.string().url(),
  senderName: z.string().trim().min(1),
  senderEmail: z.string().email().nullable(),
  signature: z.string().trim().min(1),
  targetMarketSummary: z.string().trim().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const businessProfileInputSchema = businessProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type BusinessProfileInput = z.infer<typeof businessProfileInputSchema>;

export const campaignRecordSchema = z.object({
  id: z.string(),
  campaignId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  active: z.boolean(),
  archetype: businessArchetypeSchema,
  source: z.enum(["template", "saved"]),
  campaign: campaignConfigurationSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CampaignRecord = z.infer<typeof campaignRecordSchema>;
