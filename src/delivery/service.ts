import { createHash } from "node:crypto";
import { OutreachRepository } from "@/src/db/repository";
import {
  adapterForChannel,
  deliveryAdapters,
  DeliveryAdapterError,
  type DeliveryAdapter,
} from "@/src/delivery/adapters";
import type { DeliveryAttempt, Message } from "@/src/domain/schemas";

export class DeliveryService {
  constructor(
    readonly repository = new OutreachRepository(),
    private readonly adapters: DeliveryAdapter[] = deliveryAdapters(),
  ) {}

  statuses() {
    return this.adapters.map((adapter) => adapter.status());
  }

  async sendMessage(messageId: string): Promise<{
    message: Message;
    attempt: DeliveryAttempt;
  }> {
    const message = this.repository.getMessage(messageId);
    if (!message) throw new Error("Message not found.");
    if (message.direction !== "outbound") throw new Error("Only outbound messages can be sent.");
    if (!["approved", "failed", "sent"].includes(message.status)) {
      throw new Error("Message must be approved before delivery.");
    }
    if (message.validationStatus !== "send_ready") {
      throw new Error("Message semantic validation must be send_ready.");
    }
    const conversation = this.repository.getConversation(message.conversationId);
    if (!conversation || conversation.status === "opted_out") {
      throw new Error("Conversation is not sendable.");
    }
    const contact = this.repository.getContactPoint(conversation.contactPointId);
    const prospect = this.repository.getProspect(conversation.prospectId);
    if (!contact || !prospect || contact.status !== "active") {
      throw new Error("Delivery contact is not active.");
    }
    const adapter = adapterForChannel(conversation.channel, this.adapters);
    if (!adapter) {
      this.repository.updateMessageStatus(message.id, "blocked");
      throw new Error("No delivery adapter supports this channel.");
    }
    const status = adapter.status();
    if (!status.available) {
      this.repository.updateMessageStatus(message.id, "blocked");
      throw new Error(`Delivery is blocked by configuration: ${status.message}`);
    }
    adapter.validateDestination(contact);
    const idempotencyKey = createHash("sha256")
      .update(`${message.id}:${adapter.id}:${contact.value.trim().toLowerCase()}`)
      .digest("hex");
    const job = this.repository.ensureDeliveryJob({
      messageId: message.id,
      adapterId: adapter.id,
      idempotencyKey,
    });
    if (job.status === "sent") {
      const attempts = this.repository.listDeliveryAttempts(message.id);
      const sent = attempts.find((attempt) => attempt.status === "sent");
      if (!sent) throw new Error("Delivery job is sent but its attempt record is missing.");
      return { message: this.repository.getMessage(message.id)!, attempt: sent };
    }
    this.repository.updateDeliveryJob(job.id, "sending");
    const attempt = this.repository.addDeliveryAttempt({
      jobId: job.id,
      messageId: message.id,
      adapterId: adapter.id,
    });
    try {
      const result = await adapter.send({
        messageId: message.id,
        contact,
        subject: message.subject,
        body: message.body,
        recipientName: prospect.name,
        idempotencyKey,
        attemptId: attempt.id,
      });
      const completed = this.repository.completeDeliveryAttempt(attempt.id, {
        status: "sent",
        providerResponse: result.providerResponse,
        externalMessageId: result.externalMessageId,
      });
      this.repository.updateDeliveryJob(job.id, "sent");
      return {
        message: this.repository.updateMessageStatus(
          message.id,
          "sent",
          result.externalMessageId,
        ),
        attempt: completed,
      };
    } catch (error) {
      const normalized =
        error instanceof DeliveryAdapterError
          ? error
          : new DeliveryAdapterError(
              error instanceof Error ? error.message : "Delivery failed.",
              "delivery_failed",
              "transient",
            );
      const retryable = ["transient", "rate_limited"].includes(normalized.retryClass);
      const completed = this.repository.completeDeliveryAttempt(attempt.id, {
        status: retryable ? "retryable" : "failed",
        retryClass: normalized.retryClass,
        providerResponse: normalized.providerResponse,
        failureCode: normalized.code,
        failureMessage: normalized.message,
      });
      this.repository.updateDeliveryJob(job.id, retryable ? "retryable" : "failed");
      this.repository.updateMessageStatus(message.id, "failed");
      throw Object.assign(normalized, { attempt: completed });
    }
  }
}
