import "dotenv/config";
import { z } from "zod";
import { outreachModeSchema } from "@/packages/shared/src";

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
  JUNGLEGRID_DEFAULT_WORKLOAD_TYPE: z.enum(["batch", "inference"]).default("batch"),
  JUNGLEGRID_DEFAULT_IMAGE: z
    .string()
    .default("ghcr.io/jungle-grid/outreach-qwen-worker:latest"),
  JUNGLEGRID_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(3000),
  JUNGLEGRID_JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).default(1_800_000),
  OLLAMA_MODEL: z.string().default("qwen2.5:3b"),
  OLLAMA_HOST: z.string().url().default("http://127.0.0.1:11434"),
  USE_LOCAL_LLM: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  LLM_FALLBACK_MODE: z.enum(["template", "disabled"]).default("template"),
  ZEPTOMAIL_API_KEY: optionalSecret,
  ZEPTOMAIL_API_BASE: optionalUrl,
  ZEPTOMAIL_FROM_EMAIL: z.string().email().default("bbg@junglegrid.dev"),
  ZEPTOMAIL_FROM_NAME: z.string().trim().min(1).default("Benedict from Jungle Grid"),
  ZEPTOMAIL_REPLY_TO: z.string().email().default("bbg@junglegrid.dev"),
  ZEPTOMAIL_TEST_RECIPIENT: optionalEmail,
  EMAIL_SEND_MODE: z.enum(["disabled", "manual_approval_only"]).default("disabled"),
  GITHUB_TOKEN: optionalSecret,
  DATABASE_URL: z.string().default("./data/outreach-agent.sqlite"),
  DAILY_TARGET: z.coerce.number().int().min(1).max(100).default(17),
  JUNGLEGRID_SITE: z.literal("https://junglegrid.dev").default("https://junglegrid.dev"),
  FIT_SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(70),
  MAX_DRAFTS_PER_RUN: z.coerce.number().int().min(1).max(100).default(17),
  MAX_DRAFTS_PER_DOMAIN: z.coerce.number().int().min(1).max(20).default(2),
  DRY_RUN: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
