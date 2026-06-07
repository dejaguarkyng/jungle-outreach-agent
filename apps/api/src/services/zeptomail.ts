import { getEnv } from "@/src/config/env";
import { assertDraftContent } from "@/src/safety/email-validation";

type JsonRecord = Record<string, unknown>;

export type ZeptoMailConfigStatus = {
  configured: boolean;
  sendEnabled: boolean;
  sendMode: "disabled" | "manual_approval_only";
  apiKeyPresent: boolean;
  apiBase: string | null;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  testRecipient: string | null;
  missing: string[];
  message: string;
  complianceWarning: string;
};

export type ZeptoMailSendInput = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  body: string;
};

export type ZeptoMailSendResult = {
  success: boolean;
  providerMessageId: string | null;
  requestId: string | null;
  rawResponse: unknown;
};

export type ZeptoMailNormalizedError = {
  statusCode: number | null;
  code: string | null;
  message: string;
  rawError: unknown;
};

type ZeptoMailConfig = {
  apiKey: string;
  apiBase: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  testRecipient?: string;
};

export class ZeptoMailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZeptoMailConfigError";
  }
}

export class ZeptoMailProviderError extends Error {
  constructor(readonly normalized: ZeptoMailNormalizedError) {
    super(normalized.message);
    this.name = "ZeptoMailProviderError";
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeApiBase(value: string): string {
  const parsed = new URL(value.trim());
  const pathname = parsed.pathname
    .replace(/\/+$/, "")
    .replace(/\/v1\.1\/email$/, "")
    .replace(/\/v1\.1$/, "");
  return `${parsed.origin}${pathname}`;
}

function endpointFor(apiBase: string): string {
  return `${apiBase}/v1.1/email`;
}

function extractRequestId(raw: unknown, headers?: Headers): string | null {
  const root = asRecord(raw);
  const error = asRecord(root?.error);
  return (
    asString(root?.request_id) ??
    asString(error?.request_id) ??
    headers?.get("x-request-id") ??
    null
  );
}

function extractProviderMessageId(raw: unknown): string | null {
  const root = asRecord(raw);
  const data = Array.isArray(root?.data) ? asRecord(root.data[0]) : null;
  const details = asRecord(data?.details);
  const additionalInfo = asRecord(data?.additional_info);
  return (
    asString(data?.message_id) ??
    asString(details?.message_id) ??
    asString(details?.output_message_id) ??
    asString(additionalInfo?.message_id) ??
    null
  );
}

function buildPayload(config: ZeptoMailConfig, input: ZeptoMailSendInput): JsonRecord {
  return {
    from: {
      address: config.fromEmail,
      name: config.fromName,
    },
    to: [
      {
        email_address: {
          address: input.toEmail,
          name: input.toName ?? input.toEmail,
        },
      },
    ],
    reply_to: [
      {
        address: config.replyTo,
        name: config.fromName,
      },
    ],
    subject: input.subject,
    textbody: input.body,
    track_clicks: false,
    track_opens: false,
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export function getZeptoMailStatus(): ZeptoMailConfigStatus {
  const env = getEnv();
  const missing = [
    env.ZEPTOMAIL_API_KEY ? null : "ZEPTOMAIL_API_KEY",
    env.ZEPTOMAIL_API_BASE ? null : "ZEPTOMAIL_API_BASE",
    env.ZEPTOMAIL_FROM_EMAIL ? null : "ZEPTOMAIL_FROM_EMAIL",
    env.ZEPTOMAIL_FROM_NAME ? null : "ZEPTOMAIL_FROM_NAME",
    env.ZEPTOMAIL_REPLY_TO ? null : "ZEPTOMAIL_REPLY_TO",
  ].filter(Boolean) as string[];
  const configured = missing.length === 0;
  const sendEnabled = configured && env.EMAIL_SEND_MODE === "manual_approval_only";
  const complianceWarning =
    "ZeptoMail is documented for transactional email. Enable sending only for a compliant use case; otherwise keep review-only mode.";

  return {
    configured,
    sendEnabled,
    sendMode: env.EMAIL_SEND_MODE,
    apiKeyPresent: Boolean(env.ZEPTOMAIL_API_KEY),
    apiBase: env.ZEPTOMAIL_API_BASE ?? null,
    fromEmail: env.ZEPTOMAIL_FROM_EMAIL,
    fromName: env.ZEPTOMAIL_FROM_NAME,
    replyTo: env.ZEPTOMAIL_REPLY_TO,
    testRecipient: env.ZEPTOMAIL_TEST_RECIPIENT ?? null,
    missing,
    message: !configured
      ? `ZeptoMail is missing: ${missing.join(", ")}.`
      : sendEnabled
        ? "ZeptoMail manual-approved sending is enabled."
        : "ZeptoMail is configured but sending is disabled.",
    complianceWarning,
  };
}

export class ZeptoMailService {
  private readonly config: ZeptoMailConfig;

  constructor(private readonly fetcher: typeof fetch = fetch) {
    const env = getEnv();
    if (env.EMAIL_SEND_MODE !== "manual_approval_only") {
      throw new ZeptoMailConfigError(
        "ZeptoMail sending is disabled. Set EMAIL_SEND_MODE=manual_approval_only only after confirming the use case complies with ZeptoMail rules.",
      );
    }
    if (!env.ZEPTOMAIL_API_KEY) throw new ZeptoMailConfigError("ZEPTOMAIL_API_KEY is required.");
    if (!env.ZEPTOMAIL_API_BASE) throw new ZeptoMailConfigError("ZEPTOMAIL_API_BASE is required.");
    this.config = {
      apiKey: env.ZEPTOMAIL_API_KEY,
      apiBase: normalizeApiBase(env.ZEPTOMAIL_API_BASE),
      fromEmail: env.ZEPTOMAIL_FROM_EMAIL,
      fromName: env.ZEPTOMAIL_FROM_NAME,
      replyTo: env.ZEPTOMAIL_REPLY_TO,
      testRecipient: env.ZEPTOMAIL_TEST_RECIPIENT,
    };
  }

  async send(input: ZeptoMailSendInput): Promise<ZeptoMailSendResult> {
    assertDraftContent(input.subject, input.body);
    const response = await this.fetcher(endpointFor(this.config.apiBase), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Zoho-enczapikey ${this.config.apiKey}`,
      },
      body: JSON.stringify(buildPayload(this.config, input)),
    });
    const rawResponse = await parseResponse(response);
    if (!response.ok) {
      throw new ZeptoMailProviderError(normalizeProviderError(response, rawResponse));
    }
    return {
      success: true,
      providerMessageId: extractProviderMessageId(rawResponse),
      requestId: extractRequestId(rawResponse, response.headers),
      rawResponse,
    };
  }

  async sendTest(toEmail = this.config.testRecipient): Promise<ZeptoMailSendResult> {
    if (!toEmail) throw new ZeptoMailConfigError("ZEPTOMAIL_TEST_RECIPIENT is required.");
    return this.send({
      toEmail,
      toName: "Jungle Grid operator",
      subject: "Jungle Grid ZeptoMail manual-send test",
      body: [
        "Hi, this is a ZeptoMail configuration test for the Jungle Outreach Agent dashboard.",
        "It verifies the send-mail token, verified sender, reply-to address, and plain-text payload.",
        "The application keeps research drafts internal until a human approves them, then sends only after an explicit click.",
        "It uses no extra resources or scheduled automation in this test before operators enable the manual approval mode for compliant transactional workflows.",
        "Site: https://junglegrid.dev",
        "Benedict",
      ].join(" "),
    });
  }
}

export function normalizeProviderError(
  response: Pick<Response, "status" | "statusText"> | null,
  rawError: unknown,
): ZeptoMailNormalizedError {
  const root = asRecord(rawError);
  const error = asRecord(root?.error);
  const code = asString(error?.code) ?? asString(root?.code);
  const message =
    asString(error?.message) ??
    asString(root?.message) ??
    response?.statusText ??
    "ZeptoMail request failed.";
  return {
    statusCode: response?.status ?? null,
    code,
    message,
    rawError,
  };
}
