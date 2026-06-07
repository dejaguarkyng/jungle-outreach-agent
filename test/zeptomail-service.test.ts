import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";
import { resetEnvForTests } from "@/src/config/env";
import { OutreachService } from "@/src/services/outreach-service";
import {
  ZeptoMailConfigError,
  ZeptoMailService,
  getZeptoMailStatus,
} from "@/apps/api/src/services/zeptomail";
import { POST as bulkSendApproved } from "@/app/api/drafts/bulk-send-approved/route";
import { countWords } from "@/src/safety/email-validation";

const validSubject = "Jungle Grid and Acme agent runtime";
const validBody = [
  "Hi Jane, I read the public notes for Acme agent runtime and noticed its durable job queue keeps logs, retries, and artifacts together.",
  "Jungle Grid helps agent teams run real compute jobs when tool calls outgrow lightweight APIs.",
  "The overlap with your runtime work seemed clear, so I wanted to share the project for operators evaluating batch inference workflows: https://junglegrid.dev",
  "Benedict",
].join(" ");

const scoreBreakdown = {
  agentMcpRelevance: 20,
  aiWorkloadRelevance: 20,
  infrastructurePain: 20,
  openSourceActivity: 15,
  jungleGridComprehension: 10,
  contactQuality: 7,
};

function configureZeptoEnv(overrides: Record<string, string | undefined> = {}) {
  process.env.DATABASE_URL = ":memory:";
  process.env.DRY_RUN = "false";
  process.env.EMAIL_SEND_MODE = "manual_approval_only";
  process.env.ZEPTOMAIL_API_KEY = "secret-token";
  process.env.ZEPTOMAIL_API_BASE = "https://api.zeptomail.com";
  process.env.ZEPTOMAIL_FROM_EMAIL = "bbg@junglegrid.dev";
  process.env.ZEPTOMAIL_FROM_NAME = "Benedict from Jungle Grid";
  process.env.ZEPTOMAIL_REPLY_TO = "bbg@junglegrid.dev";
  process.env.ZEPTOMAIL_TEST_RECIPIENT = "operator@example.com";
  process.env.JUNGLEGRID_SITE = "https://junglegrid.dev";
  process.env.MAX_DRAFTS_PER_DOMAIN = "2";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetEnvForTests();
}

function fetchOk() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return new Response(JSON.stringify({ data: [{ message_id: "msg-123" }], request_id: "req-123" }), {
      status: 200,
    });
  });
}

function createValidatedDraft(repository = new OutreachRepository()) {
  const prospect = repository.upsertProspect({
    name: "Jane Maintainer",
    email: "jane@acme.dev",
    emailSourceUrl: "https://acme.dev/contact",
    emailSourceType: "official_website",
    project: "acme/agent-runtime",
    projectKey: "acme/agent-runtime",
    category: "agent_compute",
  }).prospect;
  repository.saveResearch(prospect.id, {
    summary: "Acme documents an agent runtime with durable jobs.",
    personalizationDetail: "durable job queue keeps logs, retries, and artifacts together",
    junglegridRelevance: "Agent runtimes need reliable compute execution.",
    evidenceUrls: ["https://acme.dev/contact", "https://acme.dev/agent-runtime"],
  });
  repository.setScore(prospect.id, 92, scoreBreakdown);
  repository.setProspectStatus(prospect.id, "approved");
  const draft = repository.saveDraft(prospect.id, {
    subject: validSubject,
    body: validBody,
    wordCount: countWords(validBody),
    links: ["https://junglegrid.dev"],
    evidenceUrls: ["https://acme.dev/contact", "https://acme.dev/agent-runtime"],
    personalizationClaims: ["durable job queue keeps logs, retries, and artifacts together"],
    validationStatus: "passed",
    validationErrors: [],
  });
  return { prospect, draft };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeDatabase();
  configureZeptoEnv();
  getDatabase();
});

describe("ZeptoMail service", () => {
  it("fails closed when sending is disabled or config is missing", () => {
    configureZeptoEnv({ EMAIL_SEND_MODE: "disabled" });
    expect(() => new ZeptoMailService()).toThrow(ZeptoMailConfigError);

    configureZeptoEnv({ ZEPTOMAIL_API_BASE: undefined });
    const status = getZeptoMailStatus();
    expect(status.sendEnabled).toBe(false);
    expect(status.missing).toContain("ZEPTOMAIL_API_BASE");
    expect(() => new ZeptoMailService()).toThrow("ZEPTOMAIL_API_BASE");
  });

  it("sends the documented plain-text payload and exposes provider IDs", async () => {
    const fetchMock = fetchOk();
    const result = await new ZeptoMailService(fetchMock as unknown as typeof fetch).send({
      toEmail: "jane@acme.dev",
      toName: "Jane Maintainer",
      subject: validSubject,
      body: validBody,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    if (!init) throw new Error("Expected ZeptoMail fetch init.");
    const headers = init?.headers as Record<string, string>;
    const payload = JSON.parse(String(init.body));
    expect(String(url)).toBe("https://api.zeptomail.com/v1.1/email");
    expect(headers.Authorization).toBe("Zoho-enczapikey secret-token");
    expect(payload.from).toEqual({
      address: "bbg@junglegrid.dev",
      name: "Benedict from Jungle Grid",
    });
    expect(payload.to[0].email_address.address).toBe("jane@acme.dev");
    expect(payload.reply_to[0].address).toBe("bbg@junglegrid.dev");
    expect(payload.textbody).toBe(validBody);
    expect(payload).not.toHaveProperty("htmlbody");
    expect(payload).not.toHaveProperty("attachments");
    expect(result.providerMessageId).toBe("msg-123");
    expect(result.requestId).toBe("req-123");
  });

  it("supports test-send with a mocked provider and does not log secrets", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = fetchOk();

    await expect(new ZeptoMailService(fetchMock as unknown as typeof fetch).sendTest()).resolves.toMatchObject({
      success: true,
      requestId: "req-123",
    });
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("normalizes provider errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "SM_111",
            message: "Sender domain not verified.",
            request_id: "req-failed",
          },
        }),
        { status: 400, statusText: "Bad Request" },
      ),
    );

    await expect(
      new ZeptoMailService(fetchMock as unknown as typeof fetch).send({
        toEmail: "jane@acme.dev",
        subject: validSubject,
        body: validBody,
      }),
    ).rejects.toMatchObject({
      normalized: {
        statusCode: 400,
        code: "SM_111",
        message: "Sender domain not verified.",
      },
    });
  });
});

describe("manual approval send gates", () => {
  it("sends only after approval and records ZeptoMail metadata", async () => {
    const repository = new OutreachRepository();
    const { draft } = createValidatedDraft(repository);
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);

    const service = new OutreachService(repository);
    await expect(service.sendApprovedDraft(draft.id)).rejects.toThrow(/approved/i);
    expect(fetchMock).not.toHaveBeenCalled();

    service.approveDraft(draft.id, "operator@example.com");
    const sent = await service.sendApprovedDraft(draft.id);
    expect(sent.deliveryStatus).toBe("sent");
    expect(sent.zeptomailRequestId).toBe("req-123");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("blocks invalid drafts before approval or send", async () => {
    const repository = new OutreachRepository();
    const { draft } = createValidatedDraft(repository);
    repository.saveDraft(draft.prospectId, {
      subject: validSubject,
      body: "Too short https://junglegrid.dev",
      wordCount: 3,
      links: ["https://junglegrid.dev"],
      evidenceUrls: ["https://acme.dev/contact"],
      personalizationClaims: ["durable jobs"],
      validationStatus: "failed",
      validationErrors: ["Body must contain 60-80 words."],
    });
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);

    const service = new OutreachService(repository);
    await expect(() => service.approveDraft(draft.id)).toThrow(/validation/i);
    await expect(service.sendApprovedDraft(draft.id)).rejects.toThrow(/validation/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks suppressed contacts before ZeptoMail is contacted", async () => {
    const repository = new OutreachRepository();
    const { draft } = createValidatedDraft(repository);
    repository.addSuppression({
      email: "jane@acme.dev",
      reason: "Operator suppression.",
      source: "test",
    });
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);

    const service = new OutreachService(repository);
    await expect(() => service.approveDraft(draft.id)).toThrow(/suppressed/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the bulk-send confirmation phrase", async () => {
    const response = await bulkSendApproved(
      new NextRequest("http://localhost/api/drafts/bulk-send-approved", {
        method: "POST",
        body: JSON.stringify({ confirmationPhrase: "send" }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
