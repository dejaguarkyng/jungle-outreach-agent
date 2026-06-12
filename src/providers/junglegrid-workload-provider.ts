import { getEnv, type AppEnv } from "@/src/config/env";
import {
  requiredArtifactNames,
  type ArtifactBundle,
  type CampaignConfiguration,
  type OutreachMode,
} from "@/packages/shared/src";

export type JungleGridJobStatus =
  | "pending"
  | "queued"
  | "assigned"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "rejected"
  | "cancelled";

export type JungleGridJob = {
  job_id: string;
  status: JungleGridJobStatus | string;
  status_reason?: string;
  execution_phase?: string;
  delayed_start?: boolean;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
};

export type JungleGridArtifact = {
  artifact_id: string;
  filename: string;
  content_type?: string;
  size_bytes?: number | null;
  status?: string;
  ready?: boolean;
};

export type JungleGridLogEntry = {
  created_at?: string;
  category?: string;
  stream?: string;
  message?: string;
};

export type JungleGridJobEvent = {
  created_at?: string;
  type?: string;
  phase?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

type WorkerExclusions = {
  emails: string[];
  domains: string[];
  projectKeys: string[];
};

type FetchLike = typeof fetch;

function isTerminal(status: string): boolean {
  return ["completed", "failed", "rejected", "cancelled"].includes(status.toLowerCase());
}

function workerJobForMode(mode: OutreachMode): "full-run-template" | "full-run-qwen" {
  return mode === "junglegrid-template" ? "full-run-template" : "full-run-qwen";
}

export class JungleGridApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "JungleGridApiError";
  }
}

export class JungleGridWorkloadProvider {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(
    private readonly env: AppEnv = getEnv(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.baseUrl = env.JUNGLEGRID_API_BASE.replace(/\/$/, "");
    this.apiKey = env.JUNGLEGRID_API_KEY;
  }

  available(): boolean {
    return Boolean(this.apiKey);
  }

  async status(): Promise<{ configured: boolean; reachable: boolean; message: string }> {
    if (!this.apiKey) {
      return {
        configured: false,
        reachable: false,
        message: "JUNGLEGRID_API_KEY is not configured.",
      };
    }
    try {
      await this.request("GET", "/v1/jobs?limit=1");
      return { configured: true, reachable: true, message: "Jungle Grid API is reachable." };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        message: error instanceof Error ? error.message : "Jungle Grid API check failed.",
      };
    }
  }

  async estimate(
    mode: OutreachMode,
    target: number,
    exclusions?: WorkerExclusions,
    campaign?: CampaignConfiguration,
  ): Promise<unknown> {
    return this.request(
      "POST",
      "/v1/jobs/estimate",
      this.buildJobPayload(mode, target, undefined, exclusions, campaign),
    );
  }

  async submit(
    mode: OutreachMode,
    target: number,
    category?: string,
    exclusions?: WorkerExclusions,
    campaign?: CampaignConfiguration,
  ): Promise<JungleGridJob> {
    const payload = this.buildJobPayload(mode, target, category, exclusions, campaign);
    return this.request<JungleGridJob>("POST", "/v1/jobs", payload);
  }

  async getJob(jobId: string): Promise<JungleGridJob> {
    return this.request("GET", `/v1/jobs/${encodeURIComponent(jobId)}`);
  }

  async getEvents(jobId: string): Promise<JungleGridJobEvent[]> {
    const payload = await this.request<{
      items?: JungleGridJobEvent[];
      events?: JungleGridJobEvent[];
    }>("GET", `/v1/jobs/${encodeURIComponent(jobId)}/events?limit=1000`);
    return payload.items ?? payload.events ?? [];
  }

  async getLogs(jobId: string, cursor?: string): Promise<JungleGridLogEntry[]> {
    const query = new URLSearchParams({ limit: "1000" });
    if (cursor) query.set("cursor", cursor);
    const payload = await this.request<{
      items?: JungleGridLogEntry[];
      logs?: JungleGridLogEntry[];
    }>(`GET`, `/v1/jobs/${encodeURIComponent(jobId)}/logs?${query.toString()}`);
    return payload.items ?? payload.logs ?? [];
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.request("POST", `/v1/jobs/${encodeURIComponent(jobId)}/cancel`);
  }

  async listArtifacts(jobId: string): Promise<JungleGridArtifact[]> {
    const payload = await this.request<{ artifacts?: JungleGridArtifact[] }>(
      "GET",
      `/v1/jobs/${encodeURIComponent(jobId)}/artifacts`,
    );
    return payload.artifacts ?? [];
  }

  async downloadArtifact(jobId: string, artifact: JungleGridArtifact): Promise<unknown> {
    const payload = await this.request<{ url: string }>(
      "POST",
      `/v1/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(
        artifact.artifact_id,
      )}/download`,
    );
    const response = await this.fetchImpl(payload.url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new JungleGridApiError(
        response.status,
        `Artifact download failed with HTTP ${response.status}.`,
      );
    }
    return response.json();
  }

  async waitForCompletion(
    jobId: string,
    onStatus?: (job: JungleGridJob) => void,
  ): Promise<JungleGridJob> {
    const started = Date.now();
    while (Date.now() - started < this.env.JUNGLEGRID_JOB_TIMEOUT_MS) {
      const job = await this.getJob(jobId);
      onStatus?.(job);
      if (isTerminal(job.status)) return job;
      await new Promise((resolve) => setTimeout(resolve, this.env.JUNGLEGRID_POLL_INTERVAL_MS));
    }
    throw new Error(`Jungle Grid job ${jobId} exceeded the configured polling timeout.`);
  }

  async downloadArtifactBundle(jobId: string): Promise<ArtifactBundle> {
    const artifacts = await this.listArtifacts(jobId);
    const byName = new Map(artifacts.map((artifact) => [artifact.filename.split("/").pop(), artifact]));
    const missing = requiredArtifactNames.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      throw new Error(`Jungle Grid job is missing required artifacts: ${missing.join(", ")}.`);
    }
    const values = await Promise.all(
      requiredArtifactNames.map(async (name) => [
        name,
        await this.downloadArtifact(jobId, byName.get(name)!),
      ]),
    );
    const downloaded = Object.fromEntries(values);
    return {
      prospects: downloaded["prospects.json"],
      research_notes: downloaded["research_notes.json"],
      scored_prospects: downloaded["scored_prospects.json"],
      email_drafts: downloaded["email_drafts.json"],
      run_summary: downloaded["run_summary.json"],
      validation_report: downloaded["validation_report.json"],
    } as ArtifactBundle;
  }

  private buildJobPayload(
    mode: OutreachMode,
    target: number,
    category?: string,
    exclusions?: WorkerExclusions,
    campaign?: CampaignConfiguration,
  ) {
    const workerJob = workerJobForMode(mode);
    const command = [
      "python",
      "/app/workers/outreach/outreach_worker.py",
      "--job",
      workerJob,
      "--target",
      String(target),
      "--output",
      "/workspace/artifacts",
    ];
    if (category) command.push("--category", category);
    const jobContract = {
      schema_version: "1.0",
      workspace_id: campaign?.workspaceId ?? "default",
      campaign_id: campaign?.campaignId ?? "jungle-grid",
      pipeline_stage: "full_pipeline",
      pipeline_stages: [
        "source_discovery",
        "prospect_research",
        "semantic_qualification",
        "entity_resolution",
        "prospect_scoring",
        "outreach_drafting",
        "semantic_validation",
      ],
      campaign_configuration: campaign ?? null,
      evidence_policy: {
        clean_content_required: true,
        public_contact_provenance_required: true,
        evidence_ids_required_for_scoring: true,
      },
      execution: {
        backend: "jungle_grid",
        batching: {
          research_batch_size: this.env.JUNGLEGRID_RESEARCH_BATCH_SIZE,
          scoring_batch_size: this.env.JUNGLEGRID_SCORING_BATCH_SIZE,
          drafting_batch_size: this.env.JUNGLEGRID_DRAFTING_BATCH_SIZE,
          validation_batch_size: this.env.JUNGLEGRID_VALIDATION_BATCH_SIZE,
        },
        concurrency: {
          maximum_active_jobs: this.env.JUNGLEGRID_MAXIMUM_ACTIVE_JOBS,
        },
        retries: {
          maximum_attempts: this.env.JUNGLEGRID_MAXIMUM_ATTEMPTS,
          backoff_seconds: this.env.JUNGLEGRID_RETRY_BACKOFF_SECONDS,
        },
      },
      output_contract: {
        format: "json",
        artifacts: requiredArtifactNames,
      },
    };
    return {
      name: `jungle-outreach-${workerJob}-${Date.now()}`,
      workload_type: this.env.JUNGLEGRID_DEFAULT_WORKLOAD_TYPE,
      image: this.env.JUNGLEGRID_DEFAULT_IMAGE,
      ...(this.env.JUNGLEGRID_REGISTRY_CREDENTIAL_ID
        ? { registry_credential_id: this.env.JUNGLEGRID_REGISTRY_CREDENTIAL_ID }
        : {}),
      command,
      requires_gpu: true,
      gpu_count: 1,
      model_size_gb: mode === "junglegrid-qwen" ? 3 : 1,
      optimize_for: this.env.JUNGLEGRID_OPTIMIZE_FOR,
      environment: {
        OLLAMA_MODEL: campaign?.execution.draftingModel ?? this.env.OLLAMA_MODEL,
        OLLAMA_HOST: this.env.OLLAMA_HOST,
        USE_LOCAL_LLM: "true",
        LLM_FALLBACK_MODE: "disabled",
        FIT_SCORE_THRESHOLD: String(this.env.FIT_SCORE_THRESHOLD),
        MAX_DRAFTS_PER_DOMAIN: String(this.env.MAX_DRAFTS_PER_DOMAIN),
        GITHUB_TOKEN: this.env.GITHUB_TOKEN ?? "",
        OUTREACH_EXCLUDED_EMAILS: JSON.stringify(exclusions?.emails ?? []),
        OUTREACH_EXCLUDED_DOMAINS: JSON.stringify(exclusions?.domains ?? []),
        OUTREACH_EXCLUDED_PROJECT_KEYS: JSON.stringify(exclusions?.projectKeys ?? []),
        OUTREACH_CAMPAIGN_CONFIG: campaign ? JSON.stringify(campaign) : "",
        OUTREACH_EXECUTION_BACKEND: "jungle_grid",
        OUTREACH_JOB_CONTRACT: JSON.stringify(jobContract),
      },
      expected_artifacts: requiredArtifactNames.map((name) => `/workspace/artifacts/${name}`),
      metadata: {
        application: "openline",
        mode,
        execution_backend: "jungle_grid",
        schema_version: "1.0",
        workspace_id: campaign?.workspaceId ?? "default",
        campaign_id: campaign?.campaignId ?? "jungle-grid",
        campaign_name: campaign?.name ?? "Jungle Grid AI execution",
        workload_models: campaign?.execution,
        job_contract_schema_version: jobContract.schema_version,
        pipeline_stages: jobContract.pipeline_stages,
        safety: "draft-only",
      },
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) throw new Error("JUNGLEGRID_API_KEY is not configured.");
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let payload: unknown = undefined;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new JungleGridApiError(response.status, "Jungle Grid returned invalid JSON.");
      }
    }
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "message" in payload
          ? String(payload.message)
          : `Jungle Grid request failed with HTTP ${response.status}.`;
      throw new JungleGridApiError(response.status, message);
    }
    if (
      payload &&
      typeof payload === "object" &&
      "ok" in payload &&
      (payload as { ok?: boolean }).ok === true &&
      "data" in payload
    ) {
      return (payload as { data: T }).data;
    }
    return payload as T;
  }
}
