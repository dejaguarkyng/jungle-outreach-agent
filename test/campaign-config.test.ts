import { describe, expect, it, vi } from "vitest";
import { loadCampaignConfiguration, listCampaignConfigurations } from "@/src/services/campaign-config";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";
import type { AppEnv } from "@/src/config/env";

const env = {
  JUNGLEGRID_API_KEY: "test-key",
  JUNGLEGRID_API_BASE: "https://api.junglegrid.dev",
  JUNGLEGRID_MODE: "junglegrid-qwen",
  JUNGLEGRID_DEFAULT_WORKLOAD_TYPE: "batch",
  JUNGLEGRID_DEFAULT_IMAGE: "worker:test",
  JUNGLEGRID_OPTIMIZE_FOR: "cost",
  JUNGLEGRID_REGISTRY_CREDENTIAL_ID: undefined,
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
  LLM_FALLBACK_MODE: "disabled",
  ZEPTOMAIL_API_KEY: undefined,
  ZEPTOMAIL_API_BASE: undefined,
  ZEPTOMAIL_FROM_EMAIL: "bbg@junglegrid.dev",
  ZEPTOMAIL_FROM_NAME: "Benedict from Jungle Grid",
  ZEPTOMAIL_REPLY_TO: "bbg@junglegrid.dev",
  ZEPTOMAIL_TEST_RECIPIENT: undefined,
  EMAIL_SEND_MODE: "disabled",
  GITHUB_TOKEN: undefined,
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

describe("campaign configuration", () => {
  it("loads distinct reusable campaigns from configuration files", () => {
    const campaigns = listCampaignConfigurations();
    expect(campaigns.map((campaign) => campaign.campaignId)).toEqual(
      expect.arrayContaining(["jungle-grid", "generic-saas-observability"]),
    );
    expect(loadCampaignConfiguration("generic-saas-observability").offer.name).toBe("Trace Harbor");
  });

  it("submits either campaign through the same Jungle Grid backend contract", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ job_id: "job-1", status: "queued" }), { status: 202 }));
    const provider = new JungleGridWorkloadProvider(env, fetchMock);
    const campaign = loadCampaignConfiguration("generic-saas-observability");
    await provider.submit("junglegrid-qwen", 5, "saas", undefined, campaign);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(payload.metadata.execution_backend).toBe("jungle_grid");
    expect(payload.environment.OUTREACH_EXECUTION_BACKEND).toBe("jungle_grid");
    expect(payload.metadata.campaign_id).toBe("generic-saas-observability");
    expect(JSON.parse(payload.environment.OUTREACH_CAMPAIGN_CONFIG).offer.name).toBe("Trace Harbor");
    const contract = JSON.parse(payload.environment.OUTREACH_JOB_CONTRACT);
    expect(contract.campaign_id).toBe("generic-saas-observability");
    expect(contract.execution.backend).toBe("jungle_grid");
    expect(contract.output_contract.artifacts).toHaveLength(6);
    expect(payload.command).toContain("full-run-qwen");
  });
});
