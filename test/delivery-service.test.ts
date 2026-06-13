import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";
import { DeliveryService } from "@/src/delivery/service";
import type { DeliveryAdapter } from "@/src/delivery/adapters";
import { evaluateAutonomy } from "@/src/services/conversation-service";

describe("unified delivery", () => {
  beforeEach(() => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
  });

  it("records normalized attempts and does not duplicate a sent message", async () => {
    const repository = new OutreachRepository();
    const { prospect } = repository.upsertProspect({
      name: "Avery",
      email: "avery@example.com",
      emailSourceUrl: "https://example.com/contact",
      emailSourceType: "official_website",
      project: "example/runtime",
      projectKey: "example/runtime",
      category: "agent_compute",
    });
    const contact = repository.addContactPoint(prospect.id, {
      type: "email",
      value: "avery@example.com",
      sourceUrl: "https://example.com/contact",
      publiclyListed: true,
      confidence: 0.9,
    });
    const conversation = repository.ensureConversation({
      prospectId: prospect.id,
      campaignId: "jungle-grid",
      contactPointId: contact.id,
      channel: "email",
    });
    const message = repository.addMessage({
      conversationId: conversation.id,
      direction: "outbound",
      channel: "email",
      subject: "Test",
      body: "Evidence-bound message.",
      status: "approved",
      validationStatus: "send_ready",
      junglegridJobId: "jg-1",
    });
    const send = vi.fn().mockResolvedValue({
      externalMessageId: "provider-1",
      providerResponse: { accepted: true },
    });
    const adapter: DeliveryAdapter = {
      id: "mock-email",
      channels: ["email"],
      status: () => ({
        adapterId: "mock-email",
        configured: true,
        available: true,
        channels: ["email"],
        missingCredentials: [],
        message: "Configured.",
      }),
      validateDestination: () => undefined,
      send,
    };
    const service = new DeliveryService(repository, [adapter]);
    const first = await service.sendMessage(message.id);
    const second = await service.sendMessage(message.id);
    expect(first.attempt.status).toBe("sent");
    expect(second.attempt.id).toBe(first.attempt.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(repository.listDeliveryAttempts(message.id)).toHaveLength(1);
  });

  it("always requires approval for first touch", () => {
    expect(
      evaluateAutonomy({
        mode: "policy_autonomous",
        campaignActive: true,
        qualificationPassed: true,
        fitScore: 90,
        minimumScore: 70,
        contactProvenancePassed: true,
        validationStatus: "send_ready",
        channelAllowed: true,
        limitsAvailable: true,
        optedOut: false,
        escalationRequired: false,
        junglegridJobId: "jg-1",
        firstTouch: true,
      }).decision,
    ).toBe("request_approval");
  });
});
