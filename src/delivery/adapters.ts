import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { getEnv, type AppEnv } from "@/src/config/env";
import { ZeptoMailService } from "@/apps/api/src/services/zeptomail";
import { OutreachRepository } from "@/src/db/repository";
import { decryptBrowserSession } from "@/src/security/browser-session";
import type {
  ContactPoint,
  ContactPointType,
  DeliveryAdapterStatus,
} from "@/src/domain/schemas";
import type { BrowserContextOptions } from "playwright";

export type DeliveryRetryClass =
  | "none"
  | "transient"
  | "rate_limited"
  | "authentication"
  | "permanent";

export type DeliveryRequest = {
  messageId: string;
  contact: ContactPoint;
  subject: string | null;
  body: string;
  recipientName: string;
  idempotencyKey: string;
  attemptId?: string;
};

export type DeliveryResult = {
  externalMessageId: string | null;
  providerResponse: Record<string, unknown>;
};

export class DeliveryAdapterError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryClass: DeliveryRetryClass,
    readonly providerResponse: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "DeliveryAdapterError";
  }
}

export interface DeliveryAdapter {
  readonly id: string;
  readonly channels: readonly ContactPointType[];
  status(): DeliveryAdapterStatus;
  validateDestination(contact: ContactPoint): void;
  send(input: DeliveryRequest): Promise<DeliveryResult>;
}

function retryClassForStatus(status: number): DeliveryRetryClass {
  if (status === 401 || status === 403) return "authentication";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "transient";
  return "permanent";
}

function destinationId(value: string): string {
  const parsed = value.match(/(?:channels?|users?|recipient|phone_number_id)[/:]([A-Za-z0-9._-]+)/i);
  return parsed?.[1] ?? value.trim();
}

async function providerRequest(
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = { body: text.slice(0, 1000) };
    }
  }
  if (!response.ok) {
    throw new DeliveryAdapterError(
      `Provider request failed with HTTP ${response.status}.`,
      `http_${response.status}`,
      retryClassForStatus(response.status),
      payload,
    );
  }
  return payload;
}

abstract class BaseAdapter implements DeliveryAdapter {
  abstract readonly id: string;
  abstract readonly channels: readonly ContactPointType[];
  protected abstract missingCredentials(): string[];
  abstract send(input: DeliveryRequest): Promise<DeliveryResult>;

  status(): DeliveryAdapterStatus {
    const missingCredentials = this.missingCredentials();
    return {
      adapterId: this.id,
      configured: missingCredentials.length === 0,
      available: missingCredentials.length === 0,
      channels: [...this.channels],
      missingCredentials,
      message:
        missingCredentials.length === 0
          ? "Configured."
          : `Missing ${missingCredentials.join(", ")}.`,
    };
  }

  validateDestination(contact: ContactPoint): void {
    if (!this.channels.includes(contact.type)) {
      throw new DeliveryAdapterError(
        `Adapter ${this.id} does not support ${contact.type}.`,
        "unsupported_channel",
        "permanent",
      );
    }
    if (!contact.value.trim()) {
      throw new DeliveryAdapterError(
        "Delivery destination is empty.",
        "invalid_destination",
        "permanent",
      );
    }
  }
}

export class ZeptoMailDeliveryAdapter extends BaseAdapter {
  readonly id = "zeptomail";
  readonly channels = ["email"] as const;

  constructor(
    private readonly env: AppEnv = getEnv(),
    private readonly service?: ZeptoMailService,
  ) {
    super();
  }

  protected missingCredentials(): string[] {
    return [
      ...(!this.env.ZEPTOMAIL_API_KEY ? ["ZEPTOMAIL_API_KEY"] : []),
      ...(!this.env.ZEPTOMAIL_API_BASE ? ["ZEPTOMAIL_API_BASE"] : []),
    ];
  }

  async send(input: DeliveryRequest): Promise<DeliveryResult> {
    this.validateDestination(input.contact);
    const result = await (this.service ?? new ZeptoMailService()).send({
      toEmail: input.contact.value,
      toName: input.recipientName,
      subject: input.subject ?? "Openline message",
      body: input.body,
    });
    return {
      externalMessageId: result.providerMessageId,
      providerResponse: {
        requestId: result.requestId,
        providerMessageId: result.providerMessageId,
      },
    };
  }
}

export class GitHubDeliveryAdapter extends BaseAdapter {
  readonly id = "github";
  readonly channels = ["github_issue", "github_discussions"] as const;

  constructor(private readonly env: AppEnv = getEnv()) {
    super();
  }

  protected missingCredentials(): string[] {
    return this.env.GITHUB_TOKEN ? [] : ["GITHUB_TOKEN"];
  }

  async send(input: DeliveryRequest): Promise<DeliveryResult> {
    this.validateDestination(input.contact);
    const match = input.contact.value.match(
      /github\.com\/([^/]+)\/([^/]+)\/(issues|discussions)(?:\/(\d+))?/i,
    );
    if (!match) {
      throw new DeliveryAdapterError(
        "GitHub destination must be an issue or discussion URL.",
        "invalid_destination",
        "permanent",
      );
    }
    const [, owner, repository, kind, number] = match;
    const base = `https://api.github.com/repos/${owner}/${repository}`;
    const url =
      kind === "issues" && !number
        ? `${base}/issues`
        : `${base}/${kind}/${number}/${kind === "issues" ? "comments" : "comments"}`;
    const payload = await providerRequest(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(
        kind === "issues" && !number
          ? { title: input.subject ?? "Integration proposal", body: input.body }
          : { body: input.body },
      ),
    });
    return {
      externalMessageId: String(payload.id ?? payload.node_id ?? "") || null,
      providerResponse: payload,
    };
  }
}

export class SlackDeliveryAdapter extends BaseAdapter {
  readonly id = "slack";
  readonly channels = ["slack"] as const;

  constructor(private readonly env: AppEnv = getEnv()) {
    super();
  }

  protected missingCredentials(): string[] {
    return this.env.SLACK_BOT_TOKEN ? [] : ["SLACK_BOT_TOKEN"];
  }

  async send(input: DeliveryRequest): Promise<DeliveryResult> {
    this.validateDestination(input.contact);
    const payload = await providerRequest("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: destinationId(input.contact.value), text: input.body }),
    });
    if (payload.ok !== true) {
      throw new DeliveryAdapterError(
        String(payload.error ?? "Slack rejected the message."),
        String(payload.error ?? "provider_rejected"),
        payload.error === "ratelimited" ? "rate_limited" : "permanent",
        payload,
      );
    }
    return {
      externalMessageId: String(payload.ts ?? "") || null,
      providerResponse: payload,
    };
  }
}

export class DiscordDeliveryAdapter extends BaseAdapter {
  readonly id = "discord";
  readonly channels = ["discord"] as const;

  constructor(private readonly env: AppEnv = getEnv()) {
    super();
  }

  protected missingCredentials(): string[] {
    return this.env.DISCORD_BOT_TOKEN ? [] : ["DISCORD_BOT_TOKEN"];
  }

  async send(input: DeliveryRequest): Promise<DeliveryResult> {
    this.validateDestination(input.contact);
    const payload = await providerRequest(
      `https://discord.com/api/v10/channels/${destinationId(input.contact.value)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: input.body }),
      },
    );
    return {
      externalMessageId: String(payload.id ?? "") || null,
      providerResponse: payload,
    };
  }
}

export class XDeliveryAdapter extends BaseAdapter {
  readonly id = "x";
  readonly channels = ["x"] as const;

  constructor(private readonly env: AppEnv = getEnv()) {
    super();
  }

  protected missingCredentials(): string[] {
    return this.env.X_BEARER_TOKEN ? [] : ["X_BEARER_TOKEN"];
  }

  async send(input: DeliveryRequest): Promise<DeliveryResult> {
    this.validateDestination(input.contact);
    const recipientId = destinationId(input.contact.value);
    const payload = await providerRequest(
      `https://api.x.com/2/dm_conversations/with/${recipientId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.X_BEARER_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: input.body }),
      },
    );
    const data = (payload.data ?? {}) as Record<string, unknown>;
    return {
      externalMessageId: String(data.dm_event_id ?? "") || null,
      providerResponse: payload,
    };
  }
}

export class MetaDeliveryAdapter extends BaseAdapter {
  readonly id = "meta";
  readonly channels = ["facebook_page", "instagram_business"] as const;

  constructor(private readonly env: AppEnv = getEnv()) {
    super();
  }

  protected missingCredentials(): string[] {
    return this.env.META_ACCESS_TOKEN ? [] : ["META_ACCESS_TOKEN"];
  }

  async send(input: DeliveryRequest): Promise<DeliveryResult> {
    this.validateDestination(input.contact);
    const senderId =
      input.contact.type === "instagram_business"
        ? this.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
        : this.env.META_PAGE_ID;
    if (!senderId) {
      throw new DeliveryAdapterError(
        "The Meta sender account ID is not configured.",
        "missing_sender_id",
        "authentication",
      );
    }
    const payload = await providerRequest(
      `https://graph.facebook.com/v23.0/${senderId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.META_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: destinationId(input.contact.value) },
          message: { text: input.body },
        }),
      },
    );
    return {
      externalMessageId: String(payload.message_id ?? "") || null,
      providerResponse: payload,
    };
  }
}

export class WhatsAppDeliveryAdapter extends BaseAdapter {
  readonly id = "whatsapp";
  readonly channels = ["whatsapp_business"] as const;

  constructor(private readonly env: AppEnv = getEnv()) {
    super();
  }

  protected missingCredentials(): string[] {
    return [
      ...(!this.env.WHATSAPP_ACCESS_TOKEN ? ["WHATSAPP_ACCESS_TOKEN"] : []),
      ...(!this.env.WHATSAPP_PHONE_NUMBER_ID ? ["WHATSAPP_PHONE_NUMBER_ID"] : []),
    ];
  }

  async send(input: DeliveryRequest): Promise<DeliveryResult> {
    this.validateDestination(input.contact);
    const payload = await providerRequest(
      `https://graph.facebook.com/v23.0/${this.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.contact.value.replace(/[^\d]/g, ""),
          type: "text",
          text: { body: input.body },
        }),
      },
    );
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const first = (messages[0] ?? {}) as Record<string, unknown>;
    return {
      externalMessageId: String(first.id ?? "") || null,
      providerResponse: payload,
    };
  }
}

export class TwilioDeliveryAdapter extends BaseAdapter {
  readonly id = "twilio";
  readonly channels = ["business_phone"] as const;

  constructor(private readonly env: AppEnv = getEnv()) {
    super();
  }

  protected missingCredentials(): string[] {
    return [
      ...(!this.env.TWILIO_ACCOUNT_SID ? ["TWILIO_ACCOUNT_SID"] : []),
      ...(!this.env.TWILIO_AUTH_TOKEN ? ["TWILIO_AUTH_TOKEN"] : []),
      ...(!this.env.TWILIO_FROM_NUMBER ? ["TWILIO_FROM_NUMBER"] : []),
    ];
  }

  async send(input: DeliveryRequest): Promise<DeliveryResult> {
    this.validateDestination(input.contact);
    const body = new URLSearchParams({
      To: input.contact.value,
      From: this.env.TWILIO_FROM_NUMBER ?? "",
      Body: input.body,
    });
    const payload = await providerRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${this.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${this.env.TWILIO_ACCOUNT_SID}:${this.env.TWILIO_AUTH_TOKEN}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );
    return {
      externalMessageId: String(payload.sid ?? "") || null,
      providerResponse: payload,
    };
  }
}

export class BrowserDeliveryAdapter extends BaseAdapter {
  readonly id = "browser";
  readonly channels = [
    "official_contact_form",
    "integration_form",
    "partnership_form",
    "marketplace_form",
    "feature_request_portal",
    "booking_link",
  ] as const;

  constructor(
    private readonly env: AppEnv = getEnv(),
    private readonly repository = new OutreachRepository(),
  ) {
    super();
  }

  protected missingCredentials(): string[] {
    const settings = this.repository.getSettings();
    return [
      ...(!settings.browserAutomationEnabled ? ["browserAutomationEnabled"] : []),
      ...(!this.env.OPENLINE_SESSION_ENCRYPTION_KEY
        ? ["OPENLINE_SESSION_ENCRYPTION_KEY"]
        : []),
    ];
  }

  override validateDestination(contact: ContactPoint): void {
    super.validateDestination(contact);
    const url = new URL(contact.value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new DeliveryAdapterError(
        "Browser destination must use HTTP or HTTPS.",
        "invalid_destination",
        "permanent",
      );
    }
    const allowed = this.repository
      .getSettings()
      .browserAllowedDomains.map((domain) => domain.toLowerCase());
    if (!allowed.includes(url.hostname.toLowerCase())) {
      throw new DeliveryAdapterError(
        "Browser destination is not allowlisted.",
        "destination_not_allowlisted",
        "permanent",
      );
    }
    if (
      !this.repository.getProviderAuthorization(
        "default",
        "browser",
        url.hostname,
      )
    ) {
      throw new DeliveryAdapterError(
        "Browser destination lacks an active operator authorization.",
        "authorization_required",
        "authentication",
      );
    }
  }

  async send(input: DeliveryRequest): Promise<DeliveryResult> {
    this.validateDestination(input.contact);
    const { chromium } = await import("playwright");
    const stored = this.repository.getBrowserSession("default", "browser");
    const storageState = stored
      ? decryptBrowserSession<BrowserContextOptions["storageState"]>({
          encryptedPayload: stored.encryptedPayload,
          iv: stored.iv,
          tag: stored.tag,
        })
      : undefined;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
      await page.goto(input.contact.value, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const pageText = (await page.locator("body").innerText()).toLowerCase();
      if (/captcha|verify you are human|cloudflare challenge/.test(pageText)) {
        throw new DeliveryAdapterError(
          "Browser delivery stopped at CAPTCHA or anti-bot verification.",
          "captcha_detected",
          "permanent",
        );
      }
      if (/two-factor|2fa|verification code|one-time code/.test(pageText)) {
        throw new DeliveryAdapterError(
          "Browser delivery stopped at two-factor authentication.",
          "two_factor_required",
          "authentication",
        );
      }
      if (/session expired|sign in to continue|log in to continue/.test(pageText)) {
        throw new DeliveryAdapterError(
          "Browser session has expired.",
          "session_expired",
          "authentication",
        );
      }
      if (/account warning|permission changed|suspicious activity/.test(pageText)) {
        throw new DeliveryAdapterError(
          "Provider warning or permission change detected.",
          "provider_warning",
          "authentication",
        );
      }
      const messageField = page
        .locator(
          'textarea, [contenteditable="true"], input[name*="message" i], input[name*="description" i]',
        )
        .first();
      const submit = page
        .locator(
          'button[type="submit"], input[type="submit"], button:has-text("Send"), button:has-text("Submit")',
        )
        .first();
      if ((await messageField.count()) === 0 || (await submit.count()) === 0) {
        throw new DeliveryAdapterError(
          "The destination form structure is unknown or changed.",
          "manual_review_required",
          "permanent",
        );
      }
      const email = page.locator('input[type="email"], input[name*="email" i]').first();
      const name = page.locator('input[name*="name" i]').first();
      const subject = page.locator('input[name*="subject" i], input[name*="title" i]').first();
      if ((await email.count()) > 0) await email.fill(this.env.ZEPTOMAIL_REPLY_TO);
      if ((await name.count()) > 0) await name.fill(this.env.ZEPTOMAIL_FROM_NAME);
      if ((await subject.count()) > 0 && input.subject) await subject.fill(input.subject);
      await messageField.fill(input.body);
      if (input.attemptId) {
        await page.locator("input, textarea, [contenteditable=true]").evaluateAll((elements) => {
          for (const element of elements) {
            (element as HTMLElement).style.filter = "blur(8px)";
          }
        });
        const directory = path.resolve(process.cwd(), "data/outreach/screenshots");
        fs.mkdirSync(directory, { recursive: true });
        const screenshotPath = path.join(directory, `${input.attemptId}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const retentionDays = this.repository.getSettings().screenshotRetentionDays;
        this.repository.saveDeliveryScreenshot({
          attemptId: input.attemptId,
          path: screenshotPath,
          expiresAt: new Date(
            Date.now() + retentionDays * 86_400_000,
          ).toISOString(),
        });
        await page.locator("input, textarea, [contenteditable=true]").evaluateAll((elements) => {
          for (const element of elements) {
            (element as HTMLElement).style.filter = "";
          }
        });
      }
      await submit.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      const resultText = (await page.locator("body").innerText()).toLowerCase();
      if (/captcha|verify you are human|two-factor|verification code/.test(resultText)) {
        throw new DeliveryAdapterError(
          "The provider introduced an access-control challenge during submission.",
          "access_control_challenge",
          "permanent",
        );
      }
      return {
        externalMessageId: null,
        providerResponse: {
          url: page.url(),
          submitted: true,
          browser: "playwright",
        },
      };
    } finally {
      await context.close();
      await browser.close();
    }
  }
}

export function deliveryAdapters(env: AppEnv = getEnv()): DeliveryAdapter[] {
  return [
    new ZeptoMailDeliveryAdapter(env),
    new GitHubDeliveryAdapter(env),
    new SlackDeliveryAdapter(env),
    new DiscordDeliveryAdapter(env),
    new XDeliveryAdapter(env),
    new MetaDeliveryAdapter(env),
    new WhatsAppDeliveryAdapter(env),
    new TwilioDeliveryAdapter(env),
    new BrowserDeliveryAdapter(env),
  ];
}

export function adapterForChannel(
  channel: ContactPointType,
  adapters: DeliveryAdapter[] = deliveryAdapters(),
): DeliveryAdapter | null {
  return (
    adapters.find((adapter) =>
      (adapter.channels as readonly ContactPointType[]).includes(channel),
    ) ?? null
  );
}
