import "dotenv/config";
import { z } from "zod";
import { outreachModeSchema } from "@/packages/shared/src";

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function boundedInt(minimum: number, maximum: number, fallback: number) {
  return z.coerce
    .number()
    .int()
    .default(fallback)
    .transform((value) => clampNumber(value, minimum, maximum));
}

const optionalSecret = z.string().trim().optional().transform((value) => value || undefined);
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .pipe(z.string().url().optional());
const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .pipe(z.string().email().optional());

const envSchema = z.object({
  JUNGLEGRID_API_KEY: optionalSecret,
  JUNGLEGRID_API_BASE: z.string().url().default("https://api.junglegrid.dev"),
  JUNGLEGRID_MODE: outreachModeSchema.default("junglegrid-qwen"),
  JUNGLEGRID_DEFAULT_WORKLOAD_TYPE: z.enum(["batch", "inference"]).default("inference"),
  JUNGLEGRID_DEFAULT_IMAGE: z
    .string()
    .default("junglegrid/outreach-qwen-worker:latest"),
  JUNGLEGRID_OPTIMIZE_FOR: z.enum(["cost", "speed", "balanced"]).default("cost"),
  JUNGLEGRID_REGISTRY_CREDENTIAL_ID: optionalSecret,
  JUNGLEGRID_POLL_INTERVAL_MS: boundedInt(250, 60_000, 3000),
  JUNGLEGRID_JOB_TIMEOUT_MS: boundedInt(1000, 7_200_000, 1_800_000),
  JUNGLEGRID_RESEARCH_BATCH_SIZE: boundedInt(1, 100, 20),
  JUNGLEGRID_SCORING_BATCH_SIZE: boundedInt(1, 100, 25),
  JUNGLEGRID_DRAFTING_BATCH_SIZE: boundedInt(1, 100, 10),
  JUNGLEGRID_VALIDATION_BATCH_SIZE: boundedInt(1, 100, 20),
  JUNGLEGRID_MAXIMUM_ACTIVE_JOBS: boundedInt(1, 20, 4),
  JUNGLEGRID_MAXIMUM_ATTEMPTS: boundedInt(1, 10, 3),
  JUNGLEGRID_RETRY_BACKOFF_SECONDS: boundedInt(1, 3600, 10),
  OLLAMA_MODEL: z.string().default("qwen2.5:3b"),
  OLLAMA_HOST: z.string().url().default("http://127.0.0.1:11434"),
  USE_LOCAL_LLM: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  LLM_FALLBACK_MODE: z.enum(["template", "disabled"]).default("disabled"),
  ZEPTOMAIL_API_KEY: optionalSecret,
  ZEPTOMAIL_API_BASE: optionalUrl,
  ZEPTOMAIL_FROM_EMAIL: z.string().email().default("sender@example.com"),
  ZEPTOMAIL_FROM_NAME: z.string().trim().min(1).default("OpenLine"),
  ZEPTOMAIL_REPLY_TO: z.string().email().default("sender@example.com"),
  ZEPTOMAIL_TEST_RECIPIENT: optionalEmail,
  EMAIL_SEND_MODE: z.enum(["disabled", "manual_approval_only"]).default("disabled"),
  GITHUB_TOKEN: optionalSecret,
  SLACK_BOT_TOKEN: optionalSecret,
  DISCORD_BOT_TOKEN: optionalSecret,
  X_BEARER_TOKEN: optionalSecret,
  META_ACCESS_TOKEN: optionalSecret,
  META_PAGE_ID: optionalSecret,
  INSTAGRAM_BUSINESS_ACCOUNT_ID: optionalSecret,
  WHATSAPP_ACCESS_TOKEN: optionalSecret,
  WHATSAPP_PHONE_NUMBER_ID: optionalSecret,
  TWILIO_ACCOUNT_SID: optionalSecret,
  TWILIO_AUTH_TOKEN: optionalSecret,
  TWILIO_FROM_NUMBER: optionalSecret,
  OPENLINE_SESSION_ENCRYPTION_KEY: optionalSecret,
  DATABASE_URL: z.string().default("./data/outreach-agent.sqlite"),
  DATA_RETENTION_DAYS: boundedInt(0, 3650, 0),
  DAILY_TARGET: boundedInt(1, 100, 17),
  DEFAULT_ALLOWED_OUTREACH_URL: z.literal("https://junglegrid.dev").default("https://junglegrid.dev"),
  FIT_SCORE_THRESHOLD: boundedInt(0, 100, 70),
  MAX_DRAFTS_PER_RUN: boundedInt(1, 100, 17),
  MAX_DRAFTS_PER_DOMAIN: boundedInt(1, 20, 2),
  DRY_RUN: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cached) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ");
      throw new Error(`Invalid environment configuration. ${details}`);
    }
    cached = result.data;
  }
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
