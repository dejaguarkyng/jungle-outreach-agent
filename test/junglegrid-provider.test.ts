import { describe, expect, it, vi } from "vitest";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";
import { loadCampaignConfiguration } from "@/src/services/campaign-config";
import type { AppEnv } from "@/src/config/env";

const env = {
  JUNGLEGRID_API_KEY: "test-key",
  JUNGLEGRID_API_BASE: "https://api.junglegrid.dev",
  JUNGLEGRID_MODE: "junglegrid-qwen",
  JUNGLEGRID_DEFAULT_WORKLOAD_TYPE: "batch",
  JUNGLEGRID_DEFAULT_IMAGE: "worker:test",
  JUNGLEGRID_OPTIMIZE_FOR: "cost",
  JUNGLEGRID_REGISTRY_CREDENTIAL_ID: "regcred-test",
  JUNGLEGRID_POLL_INTERVAL_MS: 1,
  JUNGLEGRID_JOB_TIMEOUT_MS: 100,
  JUNGLEGRID_RESEARCH_BATCH_SIZE: 20,
  JUNGLEGRID_SCORING_BATCH_SIZE: 25,
  JUNGLEGRID_DRAFTING_BATCH_SIZE: 10,
  JUNGLEGRID_VALIDATION_BATCH_SIZE: 20,
  JUNGLEGRID_MAXIMUM_ACTIVE_JOBS: 4,
  JUNGLEGRID_MAXIMUM_ATTEMPTS: 3,
  JUNGLEGRID_RETRY_BACKOFF_SECONDS: 10,
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
  DATA_RETENTION_DAYS: 0,
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
    expect(payload.environment.LLM_FALLBACK_MODE).toBe("disabled");
    expect(payload.requires_gpu).toBe(true);
    expect(payload.gpu_count).toBe(1);
    expect(payload.optimize_for).toBe("cost");
    expect(payload.registry_credential_id).toBe("regcred-test");
    const contract = JSON.parse(payload.environment.OUTREACH_JOB_CONTRACT);
    expect(contract.schema_version).toBe("1.0");
    expect(contract.pipeline_stages).toContain("semantic_validation");
    expect(contract.execution.batching.research_batch_size).toBe(20);
    expect(contract.execution.concurrency.maximum_active_jobs).toBe(4);
    expect(contract.execution.retries.maximum_attempts).toBe(3);
  });

  it("treats the legacy local mode as a Jungle Grid-backed Qwen run", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job_id: "job-legacy", status: "queued" }), { status: 202 }),
    );
    const provider = new JungleGridWorkloadProvider(env, fetchMock);
    await provider.submit("local-template", 1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(payload.command).toContain("full-run-qwen");
    expect(payload.metadata.execution_backend).toBe("jungle_grid");
  });

  it("submits conversation turns as managed Qwen workloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job_id: "job-turn", status: "queued" }), {
        status: 202,
      }),
    );
    const provider = new JungleGridWorkloadProvider(env, fetchMock);
    await provider.submitConversationTurn(
      {
        conversation_id: "conversation-1",
        channel: "email",
        inbound_body: "Can you send details?",
        prospect: { id: "prospect-1" },
        contact_point: { type: "email" },
        evidence: [],
        proof_artifacts: [],
        history: [],
      },
      loadCampaignConfiguration("jungle-grid"),
    );
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(payload.command).toContain("conversation-turn-qwen");
    expect(payload.expected_artifacts).toEqual([
      "/workspace/artifacts/conversation_result.json",
    ]);
    expect(payload.environment.LLM_FALLBACK_MODE).toBe("disabled");
    expect(payload.metadata.pipeline_stages).toContain("reply_classification");
    expect(payload.metadata.pipeline_stages).toContain("semantic_validation");
  });

  it("retrieves events and cancels through the job lifecycle API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ events: [{ phase: "queued" }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider = new JungleGridWorkloadProvider(env, fetchMock);
    await expect(provider.getEvents("job-1")).resolves.toEqual([{ phase: "queued" }]);
    await expect(provider.cancelJob("job-1")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.junglegrid.dev/v1/jobs/job-1/cancel",
    );
  });
});
