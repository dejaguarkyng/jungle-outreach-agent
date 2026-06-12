import { beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";
import {
  ConversationService,
  evaluateAutonomy,
} from "@/src/services/conversation-service";

const prospectInput = {
  name: "Jane Maintainer",
  email: "jane@acme.dev",
  emailSourceUrl: "https://acme.dev/contact",
  emailSourceType: "official_website" as const,
  project: "acme/agent",
  projectKey: "acme/agent",
  category: "agent_framework" as const,
};

describe("Openline conversations and autonomy", () => {
  beforeEach(() => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
  });

  it("uses contact points and attaches proof artifacts to the existing prospect", () => {
    const repository = new OutreachRepository();
    const prospect = repository.upsertProspect(prospectInput).prospect;
    repository.addContactPoint(prospect.id, {
      type: "official_contact_form",
      value: "https://acme.dev/contact",
      sourceUrl: "https://acme.dev/contact",
      publiclyListed: true,
      confidence: 0.9,
    });
    repository.saveProofArtifact({
      prospectId: prospect.id,
      type: "implementation_plan",
      title: "Pilot plan",
      content: "Run a bounded pilot against the evidenced workflow.",
      evidenceIds: ["evidence-1"],
      junglegridJobId: "jg-proof-1",
    });

    expect(repository.getProspect(prospect.id)?.contactPoints).toHaveLength(2);
    expect(repository.listProofArtifacts(prospect.id)[0].junglegridJobId).toBe("jg-proof-1");
  });

  it("ingests replies into the correct conversation and immediately enforces opt-outs", () => {
    const repository = new OutreachRepository();
    const prospect = repository.upsertProspect(prospectInput).prospect;
    const contact = repository.listContactPoints(prospect.id)[0];
    const conversation = repository.ensureConversation({
      prospectId: prospect.id,
      campaignId: "jungle-grid",
      contactPointId: contact.id,
      channel: "email",
    });
    const service = new ConversationService(repository);
    service.ingestInbound({
      conversationId: conversation.id,
      channel: "email",
      body: "Please remove me and do not contact me again.",
      classification: "opt_out",
      junglegridJobId: "jg-classify-1",
    });

    expect(repository.listConversationMessages(conversation.id)).toHaveLength(1);
    expect(repository.getConversation(conversation.id)?.status).toBe("opted_out");
    expect(repository.listContactPoints(prospect.id)[0].status).toBe("opted_out");
    expect(repository.isSuppressed("jane@acme.dev", "acme.dev")).toBe(true);
  });

  it("distinguishes confirmation and policy-autonomous decisions", () => {
    const allowed = {
      campaignActive: true,
      qualificationPassed: true,
      fitScore: 90,
      minimumScore: 75,
      contactProvenancePassed: true,
      validationStatus: "send_ready" as const,
      channelAllowed: true,
      limitsAvailable: true,
      optedOut: false,
      escalationRequired: false,
      junglegridJobId: "jg-response-1",
    };
    expect(evaluateAutonomy({ ...allowed, mode: "confirmation_required" }).decision).toBe(
      "request_approval",
    );
    expect(evaluateAutonomy({ ...allowed, mode: "policy_autonomous" }).decision).toBe(
      "send",
    );
    expect(
      evaluateAutonomy({ ...allowed, mode: "policy_autonomous", optedOut: true }),
    ).toEqual({
      decision: "block",
      reasons: ["recipient_opted_out"],
    });
  });

  it("requests confirmation or sends autonomously through the existing email provider", async () => {
    const repository = new OutreachRepository();
    const prospect = repository.upsertProspect(prospectInput).prospect;
    const contact = repository.listContactPoints(prospect.id)[0];
    const conversation = repository.ensureConversation({
      prospectId: prospect.id,
      campaignId: "jungle-grid",
      contactPointId: contact.id,
      channel: "email",
    });
    const sent: string[] = [];
    const service = new ConversationService(repository, async ({ toEmail }) => {
      sent.push(toEmail);
      return { providerMessageId: "provider-1" };
    });
    const baseContext = {
      campaignActive: true,
      qualificationPassed: true,
      fitScore: 90,
      minimumScore: 75,
      contactProvenancePassed: true,
      validationStatus: "send_ready" as const,
      channelAllowed: true,
      limitsAvailable: true,
      optedOut: false,
      escalationRequired: false,
      junglegridJobId: "jg-response-1",
    };
    const confirmation = await service.createResponse({
      conversationId: conversation.id,
      subject: "Re: pilot",
      body: "Here is the requested pilot outline.",
      context: { ...baseContext, mode: "confirmation_required" },
    });
    expect(confirmation.status).toBe("approval_required");
    expect(sent).toHaveLength(0);

    const autonomous = await service.createResponse({
      conversationId: conversation.id,
      subject: "Re: pilot",
      body: "Here is the requested pilot outline.",
      context: { ...baseContext, mode: "policy_autonomous" },
    });
    expect(autonomous.status).toBe("sent");
    expect(autonomous.junglegridJobId).toBe("jg-response-1");
    expect(sent).toEqual(["jane@acme.dev"]);
  });

  it("runs inbound analysis and response generation through Jungle Grid", async () => {
    const repository = new OutreachRepository();
    const prospect = repository.upsertProspect(prospectInput).prospect;
    repository.setScoreWithExecution(
      prospect.id,
      90,
      {
        agentMcpRelevance: 20,
        aiWorkloadRelevance: 20,
        infrastructurePain: 20,
        openSourceActivity: 15,
        jungleGridComprehension: 10,
        contactQuality: 5,
      },
      "jg-score-1",
    );
    const contact = repository.listContactPoints(prospect.id)[0];
    const conversation = repository.ensureConversation({
      prospectId: prospect.id,
      campaignId: "jungle-grid",
      contactPointId: contact.id,
      channel: "email",
    });
    const provider = {
      available: () => true,
      submitConversationTurn: async () => ({ job_id: "jg-turn-1", status: "queued" }),
      waitForCompletion: async () => ({ job_id: "jg-turn-1", status: "completed" }),
      downloadConversationTurnResult: async () => ({
        schema_version: "1.0" as const,
        classification: "interested" as const,
        summary: "The prospect asked for a pilot outline.",
        open_questions: ["What is the pilot scope?"],
        commitments: [],
        objections: [],
        follow_up_at: null,
        opportunity_state: "evaluating" as const,
        next_action: "respond" as const,
        response_subject: "Re: pilot",
        response_body: "Thanks. I can send a bounded pilot outline for review.",
        validation_status: "send_ready" as const,
        validation_reasons: [],
        escalation_required: false,
      }),
    };
    const service = new ConversationService(
      repository,
      async () => ({ providerMessageId: "unused" }),
      provider,
    );
    const result = await service.processInbound({
      conversationId: conversation.id,
      channel: "email",
      body: "Can you send a pilot outline?",
    });

    expect(result.junglegridJobId).toBe("jg-turn-1");
    expect(result.inbound.classification).toBe("interested");
    expect(result.outbound?.status).toBe("approval_required");
    expect(result.outbound?.junglegridJobId).toBe("jg-turn-1");
    expect(repository.listConversationJobs(conversation.id)[0].status).toBe("completed");
  });

  it("evaluates due follow-ups through Jungle Grid without inventing an inbound message", async () => {
    const repository = new OutreachRepository();
    const prospect = repository.upsertProspect(prospectInput).prospect;
    repository.setScoreWithExecution(
      prospect.id,
      90,
      {
        agentMcpRelevance: 20,
        aiWorkloadRelevance: 20,
        infrastructurePain: 20,
        openSourceActivity: 15,
        jungleGridComprehension: 10,
        contactQuality: 5,
      },
      "jg-score-1",
    );
    const contact = repository.listContactPoints(prospect.id)[0];
    const conversation = repository.ensureConversation({
      prospectId: prospect.id,
      campaignId: "jungle-grid",
      contactPointId: contact.id,
      channel: "email",
    });
    repository.addMessage({
      conversationId: conversation.id,
      direction: "outbound",
      channel: "email",
      subject: "Initial note",
      body: "Initial outreach.",
      status: "sent",
      validationStatus: "send_ready",
      junglegridJobId: "jg-initial-1",
    });
    repository.updateConversationIntelligence(conversation.id, {
      summary: "Waiting for a response.",
      followUpAt: "2020-01-01T00:00:00.000Z",
    });
    let submittedTrigger: string | undefined;
    const provider = {
      available: () => true,
      submitConversationTurn: async (input: { trigger?: string }) => {
        submittedTrigger = input.trigger;
        return { job_id: "jg-follow-up-1", status: "queued" };
      },
      waitForCompletion: async () => ({
        job_id: "jg-follow-up-1",
        status: "completed",
      }),
      downloadConversationTurnResult: async () => ({
        schema_version: "1.0" as const,
        classification: "other" as const,
        summary: "Follow up later.",
        open_questions: [],
        commitments: [],
        objections: [],
        follow_up_at: "2099-01-01T00:00:00.000Z",
        opportunity_state: "engaged" as const,
        next_action: "follow_up_later" as const,
        response_subject: null,
        response_body: null,
        validation_status: "manual_review_required" as const,
        validation_reasons: ["No response is due yet."],
        escalation_required: false,
      }),
    };
    const service = new ConversationService(repository, undefined, provider);
    const results = await service.processDueFollowUps();

    expect(results).toEqual([
      {
        conversationId: conversation.id,
        status: "completed",
        junglegridJobId: "jg-follow-up-1",
      },
    ]);
    expect(submittedTrigger).toBe("scheduled_follow_up");
    expect(repository.listConversationMessages(conversation.id)).toHaveLength(1);
    expect(repository.getConversation(conversation.id)?.opportunityState).toBe("engaged");
    expect(repository.listConversationJobs(conversation.id)[0].status).toBe("completed");
  });

  it("blocks managed responses for contacts on the suppression list", async () => {
    const repository = new OutreachRepository();
    const prospect = repository.upsertProspect(prospectInput).prospect;
    repository.setScoreWithExecution(
      prospect.id,
      90,
      {
        agentMcpRelevance: 20,
        aiWorkloadRelevance: 20,
        infrastructurePain: 20,
        openSourceActivity: 15,
        jungleGridComprehension: 10,
        contactQuality: 5,
      },
      "jg-score-1",
    );
    const contact = repository.listContactPoints(prospect.id)[0];
    const conversation = repository.ensureConversation({
      prospectId: prospect.id,
      campaignId: "jungle-grid",
      contactPointId: contact.id,
      channel: "email",
    });
    repository.addSuppression({
      email: contact.value,
      reason: "Recipient requested no contact.",
    });
    const service = new ConversationService(repository);
    const message = await service.createCampaignResponse({
      conversationId: conversation.id,
      subject: "Re: pilot",
      body: "Here is the requested pilot outline.",
      validationStatus: "send_ready",
      junglegridJobId: "jg-response-1",
    });

    expect(message.status).toBe("blocked");
  });
});
