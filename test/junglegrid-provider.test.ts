import { describe, expect, it, vi } from "vitest";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";
import type { AppEnv } from "@/src/config/env";

const env = {
  JUNGLEGRID_API_KEY: "test-key",
  JUNGLEGRID_API_BASE: "https://api.junglegrid.dev",
  JUNGLEGRID_MODE: "junglegrid-qwen",
  JUNGLEGRID_DEFAULT_WORKLOAD_TYPE: "batch",
  JUNGLEGRID_DEFAULT_IMAGE: "worker:test",
  JUNGLEGRID_POLL_INTERVAL_MS: 1,
  JUNGLEGRID_JOB_TIMEOUT_MS: 100,
  OLLAMA_MODEL: "qwen2.5:3b",
  OLLAMA_HOST: "http://127.0.0.1:11434",
  USE_LOCAL_LLM: true,
  LLM_FALLBACK_MODE: "template",
  ZEPTOMAIL_API_KEY: undefined,
  ZEPTOMAIL_API_BASE: undefined,
  ZEPTOMAIL_FROM_EMAIL: "bbg@junglegrid.dev",
  ZEPTOMAIL_FROM_NAME: "Benedict from Jungle Grid",
  ZEPTOMAIL_REPLY_TO: "bbg@junglegrid.dev",
  ZEPTOMAIL_TEST_RECIPIENT: undefined,
  EMAIL_SEND_MODE: "disabled",
  DATABASE_URL: ":memory:",
  DAILY_TARGET: 17,
  JUNGLEGRID_SITE: "https://junglegrid.dev",
  FIT_SCORE_THRESHOLD: 70,
  MAX_DRAFTS_PER_RUN: 17,
  MAX_DRAFTS_PER_DOMAIN: 2,
  DRY_RUN: true,
  LOG_LEVEL: "info",
} satisfies AppEnv;

describe("Jungle Grid provider", () => {
  it("submits the Qwen worker and declares every artifact", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job_id: "job-1", status: "queued" }), { status: 202 }),
    );
    const provider = new JungleGridWorkloadProvider(env, fetchMock);
    await provider.submit("junglegrid-qwen", 17, "mcp");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.junglegrid.dev/v1/jobs");
    const payload = JSON.parse(String(init.body));
    expect(payload.command).toContain("full-run-qwen");
    expect(payload.expected_artifacts).toHaveLength(6);
    expect(payload.environment.OLLAMA_MODEL).toBe("qwen2.5:3b");
  });

  it("never accepts local mode for remote submission", async () => {
    const provider = new JungleGridWorkloadProvider(env, vi.fn());
    await expect(provider.submit("local-template", 1)).rejects.toThrow(/does not submit/);
  });
});
