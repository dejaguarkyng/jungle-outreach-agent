import { describe, expect, it, vi } from "vitest";
import {
  applySettingsToCampaign,
  loadCampaignConfiguration,
  listCampaignConfigurations,
  listAvailableCampaigns,
} from "@/src/services/campaign-config";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";
import type { AppEnv } from "@/src/config/env";
import type { OutreachSettings } from "@/src/domain/schemas";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";

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
  ZEPTOMAIL_FROM_EMAIL: "sender@example.com",
  ZEPTOMAIL_FROM_NAME: "OpenLine",
  ZEPTOMAIL_REPLY_TO: "sender@example.com",
  ZEPTOMAIL_TEST_RECIPIENT: undefined,
  EMAIL_SEND_MODE: "disabled",
  GITHUB_TOKEN: undefined,
  DATABASE_URL: ":memory:",
  DATA_RETENTION_DAYS: 0,
  DAILY_TARGET: 17,
  DEFAULT_ALLOWED_OUTREACH_URL: "https://junglegrid.dev",
  FIT_SCORE_THRESHOLD: 70,
  MAX_DRAFTS_PER_RUN: 17,
  MAX_DRAFTS_PER_DOMAIN: 2,
  DRY_RUN: true,
  LOG_LEVEL: "info",
} satisfies AppEnv;

describe("campaign configuration", () => {
  it("falls back to template campaigns when the database has none", () => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
    const repository = new OutreachRepository();
    expect(listAvailableCampaigns(repository).map((item) => item.campaignId)).toEqual(
      expect.arrayContaining(["jungle-grid", "generic-saas-observability"]),
    );
  });

  it("loads distinct reusable campaigns from configuration files", () => {
    const campaigns = listCampaignConfigurations();
    expect(campaigns.map((campaign) => campaign.campaignId)).toEqual(
      expect.arrayContaining([
        "jungle-grid",
        "generic-saas-observability",
        "local-services-booking",
      ]),
    );
    expect(loadCampaignConfiguration("generic-saas-observability").offer.name).toBe("Trace Harbor");
    expect(loadCampaignConfiguration("local-services-booking").idealCustomerProfile.categories).toContain(
      "other",
    );
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
    expect(contract.output_contract.artifacts).toHaveLength(7);
    expect(payload.command).toContain("full-run-qwen");
  });

  it("applies operator settings onto the campaign execution contract", () => {
    const campaign = loadCampaignConfiguration("jungle-grid");
    const settings: OutreachSettings = {
      dailyTarget: 17,
      fitScoreThreshold: 70,
      perDomainCap: 2,
      mode: "junglegrid-qwen",
      modelName: "qwen2.5:3b",
      workerImage: "worker:test",
      dryRun: true,
      maximumConcurrentSources: 6,
      maximumConcurrentEnrichments: 14,
      discoveryDeadlineSeconds: 240,
      sourceQueryBudget: 4,
      sourceCandidateBudget: 30,
      preliminaryTargetMultiplier: 4,
      minimumDistinctSources: 2,
      sourceCacheTtlSeconds: 1200,
      maximumEvidencePerSource: 8,
      maximumProspectsPerEntity: 2,
      proofMinimumScore: 82,
      browserAutomationEnabled: true,
      browserAllowedDomains: ["example.com"],
      screenshotRetentionDays: 14,
      dataRetentionDays: 30,
      defaultAllowedOutreachUrl: "https://junglegrid.dev",
    };
    const merged = applySettingsToCampaign(campaign, settings);
    expect(merged.discovery.maximumConcurrentSources).toBe(6);
    expect(merged.discovery.maximumConcurrentEnrichments).toBe(14);
    expect(merged.discovery.preliminaryTargetMultiplier).toBe(4);
    expect(merged.sourceDiversity.minimumDistinctSources).toBe(2);
    expect(merged.sourceDiversity.maximumEvidencePerSource).toBe(8);
    expect(merged.proofOfValue.minimumScore).toBe(82);
    expect(merged.delivery.browserAutomationEnabled).toBe(true);
    expect(merged.delivery.allowedBrowserDomains).toEqual(["example.com"]);
    expect(merged.delivery.screenshotRetentionDays).toBe(14);
  });

  it("loads saved campaigns before file templates", () => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
    const repository = new OutreachRepository();
    const saved = loadCampaignConfiguration("jungle-grid", repository);
    repository.saveCampaign({
      ...saved,
      name: "Saved Jungle Grid Campaign",
      offer: {
        ...saved.offer,
        name: "Saved Offer",
      },
    });
    expect(loadCampaignConfiguration("jungle-grid", repository).offer.name).toBe("Saved Offer");
  });
});
