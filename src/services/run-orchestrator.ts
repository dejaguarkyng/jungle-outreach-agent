import type {
  ArtifactBundle,
  CampaignConfiguration,
  OutreachMode,
  ProspectCategory,
} from "@/src/domain/schemas";
import { getEnv } from "@/src/config/env";
import type {
  JungleGridArtifact,
  JungleGridJob,
  JungleGridJobEvent,
  JungleGridLogEntry,
} from "@/src/providers/junglegrid-workload-provider";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";
import { artifactNames, ingestArtifactBundle } from "@/src/services/artifact-ingestion";
import { loadCampaignConfiguration } from "@/src/services/campaign-config";
import { OutreachService } from "@/src/services/outreach-service";

export type RunOptions = {
  targetCount: number;
  discoveryLimit?: number;
  category?: ProspectCategory;
  scoreThreshold?: number;
  dryRun?: boolean;
  mode?: OutreachMode;
  workspaceId?: string;
  campaignId?: string;
};

type WorkerExclusions = {
  emails: string[];
  domains: string[];
  projectKeys: string[];
};

export type JungleGridExecutionProvider = {
  available(): boolean;
  estimate(
    mode: OutreachMode,
    target: number,
    exclusions?: WorkerExclusions,
    campaign?: CampaignConfiguration,
  ): Promise<unknown>;
  submit(
    mode: OutreachMode,
    target: number,
    category?: string,
    exclusions?: WorkerExclusions,
    campaign?: CampaignConfiguration,
  ): Promise<JungleGridJob>;
  waitForCompletion(
    jobId: string,
    onStatus?: (job: JungleGridJob) => void,
  ): Promise<JungleGridJob>;
  getEvents(jobId: string): Promise<JungleGridJobEvent[]>;
  getLogs(jobId: string, cursor?: string): Promise<JungleGridLogEntry[]>;
  listArtifacts(jobId: string): Promise<JungleGridArtifact[]>;
  downloadArtifactBundle(jobId: string): Promise<ArtifactBundle>;
  cancelJob(jobId: string): Promise<void>;
};

export type RunDependencies = {
  provider?: JungleGridExecutionProvider;
  maximumAttempts?: number;
  retryBackoffSeconds?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  ingest?: typeof ingestArtifactBundle;
};

let activeRecovery: Promise<{ resumed: number; failed: number; skipped: number }> | null = null;

const PIPELINE_STAGES = new Set([
  "source_discovery",
  "prospect_research",
  "semantic_qualification",
  "entity_resolution",
  "prospect_scoring",
  "outreach_drafting",
  "semantic_validation",
]);

class AttemptFailure extends Error {
  constructor(
    message: string,
    readonly phase: "failed" | "cancelled" | "timed_out",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AttemptFailure";
  }
}

export async function runOutreach(
  options: RunOptions,
  service = new OutreachService(),
  existingRunId?: string,
  dependencies: RunDependencies = {},
): Promise<{ runId: string; summary: Record<string, unknown> }> {
  const repository = service.repository;
  const mode = options.mode ?? repository.getSettings().mode;
  const run = existingRunId
    ? repository.getRun(existingRunId)
    : repository.createRun("full", options.targetCount, JSON.stringify(options), mode);
  if (!run) throw new Error("Run not found.");
  return runJungleGridOutreach(run.id, { ...options, mode }, service, dependencies);
}

async function runJungleGridOutreach(
  runId: string,
  options: RunOptions & { mode: OutreachMode },
  service: OutreachService,
  dependencies: RunDependencies,
): Promise<{ runId: string; summary: Record<string, unknown> }> {
  const repository = service.repository;
  const env = getEnv();
  const provider = dependencies.provider ?? new JungleGridWorkloadProvider();
  const maximumAttempts = dependencies.maximumAttempts ?? env.JUNGLEGRID_MAXIMUM_ATTEMPTS;
  const retryBackoffSeconds =
    dependencies.retryBackoffSeconds ?? env.JUNGLEGRID_RETRY_BACKOFF_SECONDS;
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const ingest = dependencies.ingest ?? ingestArtifactBundle;
  const exclusions = repository.getWorkerExclusions();
  const campaign = loadCampaignConfiguration(options.campaignId ?? "jungle-grid");
  const workspaceId = options.workspaceId ?? campaign.workspaceId;
  const campaignId = campaign.campaignId;
  let execution = repository.getLatestJungleGridExecution(runId);
  let attempt = execution?.retryCount ?? 0;
  let jobsSubmitted = execution?.junglegridJobId ? 1 : 0;
  let jobsFailed = 0;

  if (!provider.available()) {
    return failRun(runId, service, "JUNGLEGRID_API_KEY is not configured.", "blocked");
  }

  while (attempt < maximumAttempts) {
    try {
      if (!execution || terminalExecutionPhase(execution.executionPhase)) {
        execution = repository.createJungleGridExecution({
          runId,
          workspaceId,
          campaignId,
          pipelineStage: "full_pipeline",
          workloadMetadata: {
            mode: options.mode,
            targetCount: options.targetCount,
            category: options.category ?? null,
            campaignName: campaign.name,
            offerName: campaign.offer.name,
            models: campaign.execution,
            attempt: attempt + 1,
            maximumAttempts,
          },
        });
        execution = repository.updateJungleGridExecution(execution.id, { retryCount: attempt });
      }

      let jobId = execution.junglegridJobId;
      if (!jobId) {
        repository.updateRun(runId, { phase: "estimating", retryCount: attempt });
        execution = repository.updateJungleGridExecution(execution.id, {
          executionPhase: "estimating",
          failureReason: null,
        });
        const estimate = await provider.estimate(
          options.mode,
          options.targetCount,
          exclusions,
          campaign,
        );
        execution = repository.updateJungleGridExecution(execution.id, {
          estimate,
          executionPhase: "submitting",
        });
        repository.updateRun(runId, { phase: "submitting" });
        repository.addRunEvent(
          runId,
          "submitting",
          `Submitting Jungle Grid attempt ${attempt + 1} of ${maximumAttempts}.`,
          "info",
          { estimate, executionBackend: "jungle_grid", campaignId },
        );
        const submitted = await provider.submit(
          options.mode,
          options.targetCount,
          options.category,
          exclusions,
          campaign,
        );
        jobsSubmitted += 1;
        jobId = submitted.job_id;
        execution = repository.updateJungleGridExecution(execution.id, {
          junglegridJobId: jobId,
          executionPhase: normalizeExecutionPhase(submitted),
          statusMessage: submitted.status_reason ?? submitted.status,
          submittedAt: new Date().toISOString(),
        });
        repository.updateRun(runId, {
          junglegridJobId: jobId,
          phase: normalizeRunPhase(submitted),
        });
        repository.addRunEvent(runId, "queued", "Jungle Grid job submitted.", "info", {
          jobId,
          attempt: attempt + 1,
          status: submitted.status,
          mode: options.mode,
        });
      } else {
        repository.addRunEvent(runId, "starting", "Resuming persisted Jungle Grid job.", "info", {
          jobId,
          attempt: attempt + 1,
          executionId: execution.id,
        });
      }

      const completed = await waitForAttempt(provider, jobId, runId, execution.id, service);
      execution = repository.getJungleGridExecution(execution.id)!;
      if (completed.status !== "completed") {
        const phase = normalizeExecutionPhase(completed);
        const cancelled = phase === "cancelled";
        throw new AttemptFailure(
          `Jungle Grid job ended with status ${completed.status}: ${
            completed.status_reason ?? "No status reason provided."
          }`,
          cancelled ? "cancelled" : "failed",
          !cancelled,
        );
      }

      repository.updateRun(runId, { phase: "downloading_artifacts" });
      const artifacts = await provider.listArtifacts(jobId);
      execution = repository.updateJungleGridExecution(execution.id, {
        executionPhase: "downloading_artifacts",
        artifacts,
      });
      const bundle = await provider.downloadArtifactBundle(jobId);
      if (bundle && typeof bundle === "object") {
        if (bundle.run_summary && typeof bundle.run_summary === "object") {
          bundle.run_summary.junglegrid_job_id = jobId;
        }
        for (const note of Array.isArray(bundle.research_notes) ? bundle.research_notes : []) {
          note.junglegrid_job_id = jobId;
        }
        for (const score of Array.isArray(bundle.scored_prospects) ? bundle.scored_prospects : []) {
          score.junglegrid_job_id = jobId;
          for (const proof of score.proof_artifacts ?? []) {
            proof.junglegrid_job_id = jobId;
          }
        }
      }
      repository.updateRun(runId, { phase: "validating" });
      execution = repository.updateJungleGridExecution(execution.id, {
        executionPhase: "semantic_validation",
        pipelineStage: "semantic_validation",
      });
      const ingestion = ingest(bundle, repository);
      await persistRemoteTelemetry(provider, jobId, runId, execution.id, service);
      repository.updateJungleGridExecution(execution.id, {
        executionPhase: "completed",
        pipelineStage: "semantic_validation",
        completedAt: completed.completed_at ?? new Date().toISOString(),
        statusMessage: "Artifacts downloaded, validated, and ingested.",
        artifacts,
      });
      repository.updateRun(runId, {
        phase: "completed",
        draftedCount: ingestion.drafted,
        failedCount: jobsFailed + ingestion.failed,
        modelMode: ingestion.modelMode,
        retryCount: attempt,
        artifacts: artifactNames(),
        error: null,
        notes:
          ingestion.drafted === 0
            ? "The worker completed, but no prospects passed all evidence and validation gates."
            : null,
      });
      repository.addRunEvent(
        runId,
        "completed",
        "Artifacts validated and local drafts persisted.",
        "info",
        { ...ingestion, artifacts: artifactNames(), attempts: attempt + 1 },
      );
      return {
        runId,
        summary: {
          executionBackend: "jungle_grid",
          productionEligible: true,
          junglegridJobId: jobId,
          jungleGridJobsSubmitted: jobsSubmitted,
          jungleGridJobsCompleted: 1,
          jungleGridJobsFailed: jobsFailed,
          jungleGridJobsCancelled: 0,
          jungleGridRetries: attempt,
          jungleGridArtifactsReceived: artifacts.length,
          localAiFallbacks: 0,
          externalAiFallbacks: 0,
          mode: options.mode,
          ...ingestion,
          runSummary: bundle.run_summary,
        },
      };
    } catch (error) {
      const failure = normalizeAttemptFailure(error);
      if (execution?.junglegridJobId) {
        try {
          await persistRemoteTelemetry(
            provider,
            execution.junglegridJobId,
            runId,
            execution.id,
            service,
          );
        } catch {
          // Telemetry is best-effort after a terminal workload failure.
        }
      }
      if (execution) {
        repository.updateJungleGridExecution(execution.id, {
          executionPhase: failure.phase,
          statusMessage: failure.message,
          completedAt: new Date().toISOString(),
          failureReason: failure.message,
        });
      }
      jobsFailed += failure.phase === "cancelled" ? 0 : 1;
      const canRetry = failure.retryable && attempt + 1 < maximumAttempts;
      if (!canRetry) {
        return failRun(runId, service, failure.message, failure.phase, jobsFailed, attempt);
      }

      attempt += 1;
      repository.updateRun(runId, {
        phase: "preparing",
        retryCount: attempt,
        failedCount: jobsFailed,
        error: failure.message,
      });
      repository.addRunEvent(
        runId,
        "preparing",
        `Retrying through Jungle Grid after attempt failure.`,
        "warn",
        {
          attempt: attempt + 1,
          maximumAttempts,
          previousJobId: execution?.junglegridJobId,
          reason: failure.message,
          backoffSeconds: retryBackoffSeconds,
        },
      );
      await sleep(retryBackoffSeconds * 1000);
      execution = null;
    }
  }

  return failRun(
    runId,
    service,
    `Jungle Grid retry limit of ${maximumAttempts} attempts was exhausted.`,
    "failed",
    jobsFailed,
    attempt,
  );
}

export function resumeActiveJungleGridRuns(
  service = new OutreachService(),
  dependencies: RunDependencies = {},
): Promise<{ resumed: number; failed: number; skipped: number }> {
  if (activeRecovery) return activeRecovery;
  activeRecovery = resumeActiveJungleGridRunsInternal(service, dependencies).finally(() => {
    activeRecovery = null;
  });
  return activeRecovery;
}

async function resumeActiveJungleGridRunsInternal(
  service: OutreachService,
  dependencies: RunDependencies,
): Promise<{ resumed: number; failed: number; skipped: number }> {
  const provider = dependencies.provider ?? new JungleGridWorkloadProvider();
  if (!provider.available()) return { resumed: 0, failed: 0, skipped: 1 };
  const runIds = [
    ...new Set(service.repository.listActiveJungleGridExecutions().map((item) => item.runId)),
  ];
  let resumed = 0;
  let failed = 0;
  for (const runId of runIds) {
    const run = service.repository.getRun(runId);
    if (!run) continue;
    let stored: Partial<RunOptions> = {};
    if (run.notes) {
      try {
        stored = JSON.parse(run.notes) as Partial<RunOptions>;
      } catch {
        stored = {};
      }
    }
    try {
      await runOutreach(
        {
          targetCount: run.targetCount,
          mode: run.mode,
          ...stored,
        },
        service,
        runId,
        { ...dependencies, provider },
      );
      resumed += 1;
    } catch {
      failed += 1;
    }
  }
  return { resumed, failed, skipped: 0 };
}

async function waitForAttempt(
  provider: JungleGridExecutionProvider,
  jobId: string,
  runId: string,
  executionId: string,
  service: OutreachService,
): Promise<JungleGridJob> {
  try {
    return await provider.waitForCompletion(jobId, (status) => {
      const repository = service.repository;
      const current = repository.getJungleGridExecution(executionId);
      if (!current) return;
      const phase = normalizeExecutionPhase(status);
      const pipelineStage = PIPELINE_STAGES.has(phase) ? phase : current.pipelineStage;
      repository.updateJungleGridExecution(executionId, {
        executionPhase: phase,
        pipelineStage,
        statusMessage: status.status_reason ?? status.status,
        startedAt:
          current.startedAt ??
          status.started_at ??
          (phase === "running" ? new Date().toISOString() : null),
        completedAt: status.completed_at ?? current.completedAt,
      });
      repository.updateRun(runId, { phase: normalizeRunPhase(status) });
      repository.addRunEvent(
        runId,
        phase,
        `Jungle Grid job status: ${status.status}.`,
        "info",
        {
          status: status.status,
          executionPhase: status.execution_phase,
          delayedStart: status.delayed_start,
          pipelineStage,
        },
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jungle Grid polling failed.";
    throw new AttemptFailure(message, message.includes("polling timeout") ? "timed_out" : "failed", true);
  }
}

async function persistRemoteTelemetry(
  provider: JungleGridExecutionProvider,
  jobId: string,
  runId: string,
  executionId: string,
  service: OutreachService,
): Promise<void> {
  const [events, logs] = await Promise.all([provider.getEvents(jobId), provider.getLogs(jobId)]);
  for (const event of events) {
    const phase = event.phase ?? event.type ?? "remote_event";
    service.repository.addRunEvent(
      runId,
      phase,
      event.message ?? `Jungle Grid event: ${phase}.`,
      "info",
      event.metadata,
    );
  }
  const latestLog = logs.at(-1);
  service.repository.updateJungleGridExecution(executionId, {
    logsCursor: latestLog?.created_at ?? null,
    workloadMetadata: {
      ...service.repository.getJungleGridExecution(executionId)?.workloadMetadata,
      remoteEventCount: events.length,
      remoteLogCount: logs.length,
    },
  });
}

function normalizeAttemptFailure(error: unknown): AttemptFailure {
  if (error instanceof AttemptFailure) return error;
  const message = error instanceof Error ? error.message : "Unknown Jungle Grid run failure.";
  return new AttemptFailure(
    message,
    message.includes("polling timeout") ? "timed_out" : "failed",
    true,
  );
}

function failRun(
  runId: string,
  service: OutreachService,
  message: string,
  phase: "failed" | "cancelled" | "timed_out" | "blocked",
  failedCount = 1,
  retryCount = 0,
): never {
  const repository = service.repository;
  repository.addRunEvent(runId, phase, message, "error");
  repository.updateRun(runId, {
    phase,
    failedCount,
    retryCount,
    error: message,
  });
  throw new Error(message);
}

function terminalExecutionPhase(phase: string): boolean {
  return ["completed", "failed", "cancelled", "timed_out", "blocked"].includes(phase);
}

function normalizeExecutionPhase(job: JungleGridJob): string {
  const phase = (job.execution_phase ?? job.status).toLowerCase();
  if (phase === "assigned" || phase === "pending") return "queued";
  if (phase === "rejected") return "failed";
  return phase;
}

export function normalizeRunPhase(
  job: JungleGridJob,
):
  | "queued"
  | "discovering"
  | "starting"
  | "running"
  | "researching"
  | "scoring"
  | "writing"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled" {
  const phase = normalizeExecutionPhase(job);
  if (phase === "completed") return "completed";
  if (phase === "failed") return "failed";
  if (phase === "cancelled") return "cancelled";
  if (phase === "starting") return "starting";
  if (phase === "running") return "running";
  if (phase === "source_discovery") return "discovering";
  if (phase === "prospect_research" || phase === "semantic_qualification" || phase === "entity_resolution") {
    return "researching";
  }
  if (phase === "prospect_scoring") return "scoring";
  if (phase === "outreach_drafting") return "writing";
  if (phase === "semantic_validation") return "validating";
  return "queued";
}
