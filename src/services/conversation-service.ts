import type {
  AutonomyMode,
  ContactPointType,
  DraftValidationStatus,
  Message,
} from "@/src/domain/schemas";
import { OutreachRepository } from "@/src/db/repository";
import { ZeptoMailService } from "@/apps/api/src/services/zeptomail";
import { loadCampaignConfiguration } from "@/src/services/campaign-config";
import {
  JungleGridWorkloadProvider,
  type ConversationTurnInput,
  type JungleGridJob,
} from "@/src/providers/junglegrid-workload-provider";
import type { ConversationTurnResult } from "@/src/domain/schemas";
import { DeliveryService } from "@/src/delivery/service";

const OPT_OUT = /\b(unsubscribe|opt\s*out|stop contacting|do not contact|remove me)\b/i;
const defaultEmailSender = async (input: {
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
}) => new ZeptoMailService().send(input);

export type ConversationExecutionProvider = {
  available(): boolean;
  submitConversationTurn(
    input: ConversationTurnInput,
    campaign: ReturnType<typeof loadCampaignConfiguration>,
  ): Promise<JungleGridJob>;
  waitForCompletion(jobId: string): Promise<JungleGridJob>;
  downloadConversationTurnResult(jobId: string): Promise<ConversationTurnResult>;
};

export type AutonomyContext = {
  mode: AutonomyMode;
  campaignActive: boolean;
  qualificationPassed: boolean;
  fitScore: number;
  minimumScore: number;
  contactProvenancePassed: boolean;
  validationStatus: DraftValidationStatus;
  channelAllowed: boolean;
  limitsAvailable: boolean;
  optedOut: boolean;
  escalationRequired: boolean;
  junglegridJobId: string | null;
  firstTouch?: boolean;
};

export function evaluateAutonomy(context: AutonomyContext): {
  decision: "draft" | "request_approval" | "send" | "block";
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!context.campaignActive) reasons.push("campaign_inactive");
  if (!context.qualificationPassed || context.fitScore < context.minimumScore) {
    reasons.push("qualification_failed");
  }
  if (!context.contactProvenancePassed) reasons.push("contact_provenance_failed");
  if (context.validationStatus !== "send_ready") reasons.push("semantic_validation_failed");
  if (!context.channelAllowed) reasons.push("channel_not_allowed");
  if (!context.limitsAvailable) reasons.push("limits_exceeded");
  if (context.optedOut) reasons.push("recipient_opted_out");
  if (context.escalationRequired) reasons.push("escalation_required");
  if (!context.junglegridJobId) reasons.push("junglegrid_execution_missing");
  if (reasons.length) return { decision: "block", reasons };
  if (context.firstTouch) return { decision: "request_approval", reasons: [] };
  if (context.mode === "draft_only") return { decision: "draft", reasons: [] };
  if (context.mode === "confirmation_required") {
    return { decision: "request_approval", reasons: [] };
  }
  return { decision: "send", reasons: [] };
}

export class ConversationService {
  private readonly deliveryService: DeliveryService | null;

  constructor(
    readonly repository = new OutreachRepository(),
    private readonly sendEmail: (input: {
      toEmail: string;
      toName: string;
      subject: string;
      body: string;
    }) => Promise<{ providerMessageId: string | null }> = defaultEmailSender,
    private readonly executionProvider: ConversationExecutionProvider =
      new JungleGridWorkloadProvider(),
    deliveryService?: DeliveryService,
  ) {
    this.deliveryService =
      deliveryService ??
      (this.sendEmail === defaultEmailSender
        ? new DeliveryService(this.repository)
        : null);
  }

  async processInbound(input: {
    conversationId: string;
    channel: ContactPointType;
    body: string;
    externalMessageId?: string | null;
  }): Promise<{ inbound: Message; outbound: Message | null; junglegridJobId: string }> {
    const conversation = this.repository.getConversation(input.conversationId);
    if (!conversation) throw new Error("Conversation not found.");
    const prospect = this.repository.getProspect(conversation.prospectId);
    const contact = this.repository.getContactPoint(conversation.contactPointId);
    if (!prospect || !contact) throw new Error("Conversation context is incomplete.");
    if (!this.executionProvider.available()) {
      throw new Error("JUNGLEGRID_API_KEY is not configured.");
    }
    const campaign = loadCampaignConfiguration(conversation.campaignId);
    const jobRecordId = this.repository.createConversationJob(conversation.id);
    const workloadInput: ConversationTurnInput = {
      conversation_id: conversation.id,
      channel: input.channel,
      inbound_body: input.body,
      prospect,
      contact_point: contact,
      evidence: this.repository.getResearch(prospect.id)
        ? [this.repository.getResearch(prospect.id)!]
        : [],
      proof_artifacts: this.repository.listProofArtifacts(prospect.id),
      history: this.repository.listConversationMessages(conversation.id),
    };
    try {
      this.repository.updateConversationJob(jobRecordId, { status: "submitting" });
      const submitted = await this.executionProvider.submitConversationTurn(
        workloadInput,
        campaign,
      );
      this.repository.updateConversationJob(jobRecordId, {
        junglegridJobId: submitted.job_id,
        status: submitted.status,
      });
      const completed = await this.executionProvider.waitForCompletion(submitted.job_id);
      if (completed.status !== "completed") {
        throw new Error(
          `Jungle Grid conversation job ended with ${completed.status}: ${
            completed.status_reason ?? "No reason provided."
          }`,
        );
      }
      const result = await this.executionProvider.downloadConversationTurnResult(
        submitted.job_id,
      );
      const inbound = this.ingestInbound({
        conversationId: conversation.id,
        channel: input.channel,
        body: input.body,
        classification: result.classification,
        junglegridJobId: submitted.job_id,
        externalMessageId: input.externalMessageId ?? null,
        summary: result.summary,
        openQuestions: result.open_questions,
        commitments: result.commitments,
        objections: result.objections,
        followUpAt: result.follow_up_at,
        opportunityState: result.opportunity_state,
      });
      let outbound: Message | null = null;
      if (result.response_body) {
        outbound = await this.createCampaignResponse({
          conversationId: conversation.id,
          subject: result.response_subject,
          body: result.response_body,
          validationStatus: result.validation_status,
          junglegridJobId: submitted.job_id,
          modelEscalationRequired: result.escalation_required,
        });
      }
      this.repository.updateConversationJob(jobRecordId, {
        junglegridJobId: submitted.job_id,
        status: "completed",
      });
      return { inbound, outbound, junglegridJobId: submitted.job_id };
    } catch (error) {
      this.repository.updateConversationJob(jobRecordId, {
        status: "failed",
        failureReason: error instanceof Error ? error.message : "Conversation job failed.",
      });
      throw error;
    }
  }

  async processScheduledFollowUp(
    conversationId: string,
  ): Promise<{ outbound: Message | null; junglegridJobId: string }> {
    const conversation = this.repository.getConversation(conversationId);
    if (!conversation) throw new Error("Conversation not found.");
    if (conversation.status === "opted_out") {
      throw new Error("Opted-out conversations cannot be evaluated.");
    }
    const prospect = this.repository.getProspect(conversation.prospectId);
    const contact = this.repository.getContactPoint(conversation.contactPointId);
    if (!prospect || !contact) throw new Error("Conversation context is incomplete.");
    if (!this.executionProvider.available()) {
      throw new Error("JUNGLEGRID_API_KEY is not configured.");
    }
    const campaign = loadCampaignConfiguration(conversation.campaignId);
    const jobRecordId = this.repository.createConversationJob(
      conversation.id,
      "scheduled_follow_up",
    );
    const workloadInput: ConversationTurnInput = {
      conversation_id: conversation.id,
      channel: conversation.channel,
      inbound_body: "",
      trigger: "scheduled_follow_up",
      prospect,
      contact_point: contact,
      evidence: this.repository.getResearch(prospect.id)
        ? [this.repository.getResearch(prospect.id)!]
        : [],
      proof_artifacts: this.repository.listProofArtifacts(prospect.id),
      history: this.repository.listConversationMessages(conversation.id),
    };
    try {
      this.repository.updateConversationJob(jobRecordId, { status: "submitting" });
      const submitted = await this.executionProvider.submitConversationTurn(
        workloadInput,
        campaign,
      );
      this.repository.updateConversationJob(jobRecordId, {
        junglegridJobId: submitted.job_id,
        status: submitted.status,
      });
      const completed = await this.executionProvider.waitForCompletion(submitted.job_id);
      if (completed.status !== "completed") {
        throw new Error(
          `Jungle Grid scheduled evaluation ended with ${completed.status}: ${
            completed.status_reason ?? "No reason provided."
          }`,
        );
      }
      const result = await this.executionProvider.downloadConversationTurnResult(
        submitted.job_id,
      );
      this.repository.updateConversationIntelligence(conversation.id, {
        summary: result.summary,
        openQuestions: result.open_questions,
        commitments: result.commitments,
        objections: result.objections,
        followUpAt: result.follow_up_at,
        opportunityState: result.opportunity_state,
      });
      const outbound = result.response_body
        ? await this.createCampaignResponse({
            conversationId: conversation.id,
            subject: result.response_subject,
            body: result.response_body,
            validationStatus: result.validation_status,
            junglegridJobId: submitted.job_id,
            modelEscalationRequired: result.escalation_required,
          })
        : null;
      this.repository.updateConversationJob(jobRecordId, {
        junglegridJobId: submitted.job_id,
        status: "completed",
      });
      return { outbound, junglegridJobId: submitted.job_id };
    } catch (error) {
      this.repository.updateConversationJob(jobRecordId, {
        status: "failed",
        failureReason:
          error instanceof Error ? error.message : "Scheduled evaluation failed.",
      });
      throw error;
    }
  }

  async processDueFollowUps(limit = 25): Promise<
    Array<{
      conversationId: string;
      status: "completed" | "failed";
      junglegridJobId?: string;
      error?: string;
    }>
  > {
    const results: Array<{
      conversationId: string;
      status: "completed" | "failed";
      junglegridJobId?: string;
      error?: string;
    }> = [];
    for (const conversation of this.repository.listDueConversations(
      new Date().toISOString(),
      limit,
    )) {
      try {
        const result = await this.processScheduledFollowUp(conversation.id);
        results.push({
          conversationId: conversation.id,
          status: "completed",
          junglegridJobId: result.junglegridJobId,
        });
      } catch (error) {
        results.push({
          conversationId: conversation.id,
          status: "failed",
          error: error instanceof Error ? error.message : "Scheduled evaluation failed.",
        });
      }
    }
    return results;
  }

  ingestInbound(input: {
    conversationId: string;
    channel: ContactPointType;
    body: string;
    classification: string;
    junglegridJobId: string;
    externalMessageId?: string | null;
    summary?: string;
    openQuestions?: string[];
    commitments?: string[];
    objections?: string[];
    followUpAt?: string | null;
    opportunityState?: "qualified" | "engaged" | "evaluating" | "committed" | "won" | "lost";
  }): Message {
    const conversation = this.repository.getConversation(input.conversationId);
    if (!conversation) throw new Error("Conversation not found.");
    if (!input.junglegridJobId) {
      throw new Error("Inbound AI classification requires a Jungle Grid job ID.");
    }
    const message = this.repository.addMessage({
      conversationId: input.conversationId,
      direction: "inbound",
      channel: input.channel,
      body: input.body,
      status: "received",
      classification: input.classification,
      validationStatus: "send_ready",
      junglegridJobId: input.junglegridJobId,
      externalMessageId: input.externalMessageId ?? null,
    });
    if (input.classification === "opt_out" || OPT_OUT.test(input.body)) {
      this.repository.optOutConversation(input.conversationId);
    } else if (input.summary) {
      this.repository.updateConversationIntelligence(input.conversationId, {
        summary: input.summary,
        openQuestions: input.openQuestions,
        commitments: input.commitments,
        objections: input.objections,
        followUpAt: input.followUpAt,
        opportunityState: input.opportunityState,
      });
    }
    return message;
  }

  decideNextMessage(
    conversationId: string,
    context: AutonomyContext,
  ): ReturnType<typeof evaluateAutonomy> & { policyDecisionId: string } {
    const decision = evaluateAutonomy(context);
    const policyDecisionId = this.repository.recordPolicyDecision({
      conversationId,
      mode: context.mode,
      decision: decision.decision,
      reasons: decision.reasons,
      junglegridJobId: context.junglegridJobId,
    });
    return { ...decision, policyDecisionId };
  }

  async createResponse(input: {
    conversationId: string;
    subject?: string | null;
    body: string;
    context: AutonomyContext;
  }): Promise<Message> {
    if (!input.context.junglegridJobId) {
      throw new Error("Response generation requires a Jungle Grid job ID.");
    }
    const conversation = this.repository.getConversation(input.conversationId);
    if (!conversation) throw new Error("Conversation not found.");
    const contact = this.repository.getContactPoint(conversation.contactPointId);
    if (!contact) throw new Error("Conversation contact point not found.");
    const policy = this.decideNextMessage(input.conversationId, {
      ...input.context,
      firstTouch:
        input.context.firstTouch ??
        this.repository.listConversationMessages(input.conversationId).length === 0,
    });
    const status =
      policy.decision === "draft"
        ? "draft"
        : policy.decision === "request_approval"
          ? "approval_required"
          : policy.decision === "send"
            ? "approved"
            : "blocked";
    let message = this.repository.addMessage({
      conversationId: input.conversationId,
      direction: "outbound",
      channel: conversation.channel,
      subject: input.subject ?? null,
      body: input.body,
      status,
      validationStatus: input.context.validationStatus,
      junglegridJobId: input.context.junglegridJobId,
      policyDecisionId: policy.policyDecisionId,
    });
    if (policy.decision !== "send") return message;
    if (this.deliveryService) {
      return (await this.deliveryService.sendMessage(message.id)).message;
    }
    if (conversation.channel !== "email" || contact.type !== "email") {
      return this.repository.updateMessageStatus(message.id, "failed");
    }
    const prospect = this.repository.getProspect(conversation.prospectId);
    if (!prospect) throw new Error("Prospect not found.");
    try {
      const result = await this.sendEmail({
        toEmail: contact.value,
        toName: prospect.name,
        subject: input.subject ?? `Re: ${prospect.project}`,
        body: input.body,
      });
      message = this.repository.updateMessageStatus(
        message.id,
        "sent",
        result.providerMessageId,
      );
    } catch (error) {
      this.repository.updateMessageStatus(message.id, "failed");
      throw error;
    }
    return message;
  }

  async createCampaignResponse(input: {
    conversationId: string;
    subject?: string | null;
    body: string;
    validationStatus: DraftValidationStatus;
    junglegridJobId: string;
    modelEscalationRequired?: boolean;
  }): Promise<Message> {
    const conversation = this.repository.getConversation(input.conversationId);
    if (!conversation) throw new Error("Conversation not found.");
    const prospect = this.repository.getProspect(conversation.prospectId);
    const contact = this.repository.getContactPoint(conversation.contactPointId);
    if (!prospect || !contact) throw new Error("Conversation context is incomplete.");
    const campaign = loadCampaignConfiguration(conversation.campaignId);
    const settings = this.repository.getSettings();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limitsAvailable =
      this.repository.countSentMessagesSince(today.toISOString()) < settings.dailyTarget &&
      this.repository.countSentMessagesForContactSince(
        contact.id,
        today.toISOString(),
      ) < settings.perDomainCap;
    const escalationRequired =
      input.modelEscalationRequired === true ||
      campaign.autonomy.escalationTerms.some((term) =>
        input.body.toLowerCase().includes(term.toLowerCase()),
      );
    const emailDomain =
      contact.type === "email" ? contact.value.split("@")[1]?.toLowerCase() ?? "" : "";
    const contactSuppressed =
      contact.type === "email" &&
      (this.repository.isSuppressed(contact.value, emailDomain) ||
        this.repository.isBlocked(contact.value, emailDomain));
    return this.createResponse({
      conversationId: input.conversationId,
      subject: input.subject,
      body: input.body,
      context: {
        mode: campaign.autonomy.mode,
        campaignActive: campaign.active,
        qualificationPassed: prospect.fitScore !== null,
        fitScore: prospect.fitScore ?? 0,
        minimumScore: campaign.autonomy.minimumScore,
        contactProvenancePassed:
          contact.publiclyListed && contact.status === "active" && contact.confidence >= 0.5,
        validationStatus: input.validationStatus,
        channelAllowed: campaign.channels.includes(conversation.channel),
        limitsAvailable,
        optedOut:
          conversation.status === "opted_out" ||
          contact.status === "opted_out" ||
          contactSuppressed,
        escalationRequired,
        junglegridJobId: input.junglegridJobId,
      },
    });
  }

  async approveMessage(messageId: string): Promise<Message> {
    const message = this.repository.getMessage(messageId);
    if (!message) throw new Error("Message not found.");
    if (message.direction !== "outbound" || message.status !== "approval_required") {
      throw new Error("Only approval-required outbound messages can be approved.");
    }
    if (message.validationStatus !== "send_ready" || !message.junglegridJobId) {
      throw new Error("Managed semantic validation and a Jungle Grid job ID are required.");
    }
    if (this.repository.getSettings().dryRun) {
      throw new Error("Dry-run mode is enabled; delivery is blocked.");
    }
    const conversation = this.repository.getConversation(message.conversationId);
    if (!conversation || conversation.status === "opted_out") {
      throw new Error("Conversation is not sendable.");
    }
    const contact = this.repository.getContactPoint(conversation.contactPointId);
    const prospect = this.repository.getProspect(conversation.prospectId);
    if (!contact || !prospect || contact.status !== "active") {
      throw new Error("Conversation contact is not active.");
    }
    if (conversation.channel !== "email" || contact.type !== "email") {
      throw new Error("This channel does not have an approved delivery adapter.");
    }
    const domain = contact.value.split("@")[1]?.toLowerCase() ?? "";
    if (
      this.repository.isSuppressed(contact.value, domain) ||
      this.repository.isBlocked(contact.value, domain)
    ) {
      throw new Error("Conversation contact is suppressed or blocked.");
    }
    this.repository.updateMessageStatus(message.id, "approved");
    if (this.deliveryService) {
      return (await this.deliveryService.sendMessage(message.id)).message;
    }
    try {
      const result = await this.sendEmail({
        toEmail: contact.value,
        toName: prospect.name,
        subject: message.subject ?? `Re: ${prospect.project}`,
        body: message.body,
      });
      return this.repository.updateMessageStatus(
        message.id,
        "sent",
        result.providerMessageId,
      );
    } catch (error) {
      this.repository.updateMessageStatus(message.id, "failed");
      throw error;
    }
  }
}
