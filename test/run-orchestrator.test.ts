import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";
import { OutreachService } from "@/src/services/outreach-service";
import {
  resumeActiveJungleGridRuns,
  normalizeRunPhase,
  runOutreach,
  type JungleGridExecutionProvider,
} from "@/src/services/run-orchestrator";
import type { ArtifactBundle } from "@/packages/shared/src";

function provider(options: {
  waits?: Array<"completed" | "failed" | "cancelled" | "timeout">;
  artifactFailures?: number;
} = {}): JungleGridExecutionProvider & {
  submit: ReturnType<typeof vi.fn>;
} {
  const waits = [...(options.waits ?? ["completed"])];
  let submissions = 0;
  let artifactFailures = options.artifactFailures ?? 0;
  return {
    available: () => true,
    estimate: vi.fn().mockResolvedValue({ expected_cost: 0.01 }),
    submit: vi.fn().mockImplementation(async () => {
      submissions += 1;
      return { job_id: `job-${submissions}`, status: "queued" };
    }),
    waitForCompletion: vi.fn().mockImplementation(async (jobId, onStatus) => {
      onStatus?.({ job_id: jobId, status: "running", execution_phase: "source_discovery" });
      onStatus?.({ job_id: jobId, status: "running", execution_phase: "prospect_research" });
      const outcome = waits.shift() ?? "completed";
      if (outcome === "timeout") {
        throw new Error(`Jungle Grid job ${jobId} exceeded the configured polling timeout.`);
      }
      onStatus?.({ job_id: jobId, status: outcome });
      return {
        job_id: jobId,
        status: outcome,
        status_reason: outcome === "failed" ? "provider failed" : undefined,
      };
    }),
    getEvents: vi.fn().mockResolvedValue([
      { phase: "prospect_research", message: "Research batch complete." },
      { phase: "semantic_validation", message: "Validation batch complete." },
    ]),
    getLogs: vi.fn().mockResolvedValue([
      { created_at: "2026-06-12T10:00:00.000Z", message: "done" },
    ]),
    listArtifacts: vi.fn().mockResolvedValue([
      { artifact_id: "a1", filename: "prospects.json" },
      { artifact_id: "a2", filename: "research_notes.json" },
      { artifact_id: "a3", filename: "scored_prospects.json" },
      { artifact_id: "a4", filename: "email_drafts.json" },
      { artifact_id: "a5", filename: "run_summary.json" },
      { artifact_id: "a6", filename: "validation_report.json" },
    ]),
    downloadArtifactBundle: vi.fn().mockImplementation(async () => {
      if (artifactFailures > 0) {
        artifactFailures -= 1;
        throw new Error("Jungle Grid job is missing required artifacts: run_summary.json.");
      }
      return {} as ArtifactBundle;
    }),
    cancelJob: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Jungle Grid run orchestration", () => {
  beforeEach(() => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
  });

  it("maps remote source discovery to the visible discovering phase", () => {
    expect(
      normalizeRunPhase({
        job_id: "job-1",
        status: "running",
        execution_phase: "source_discovery",
      }),
    ).toBe("discovering");
  });

  it("persists a failed attempt, retries through Jungle Grid, and completes", async () => {
    const repository = new OutreachRepository();
    const service = new OutreachService(repository);
    const client = provider({ waits: ["failed", "completed"] });
    const result = await runOutreach(
      { targetCount: 2, mode: "junglegrid-qwen" },
      service,
      undefined,
      {
        provider: client,
        maximumAttempts: 3,
        retryBackoffSeconds: 1,
        sleep: vi.fn().mockResolvedValue(undefined),
        ingest: () => ({ drafted: 1, failed: 0, modelMode: "qwen" }),
      },
    );

    expect(result.summary).toMatchObject({
      jungleGridJobsSubmitted: 2,
      jungleGridJobsCompleted: 1,
      jungleGridJobsFailed: 1,
      jungleGridRetries: 1,
      localAiFallbacks: 0,
      externalAiFallbacks: 0,
    });
    const attempts = repository.listJungleGridExecutions(result.runId);
    expect(attempts.map((attempt) => attempt.executionPhase)).toEqual(["failed", "completed"]);
    expect(attempts[1].pipelineStage).toBe("semantic_validation");
    expect(attempts[1].logsCursor).toBe("2026-06-12T10:00:00.000Z");
    expect(repository.getRun(result.runId)?.retryCount).toBe(1);
    expect(
      repository
        .getRunDetail(result.runId)
        ?.events.some((event) => (event as { phase: string }).phase === "source_discovery"),
    ).toBe(true);
  });

  it("resumes a persisted active job without submitting a duplicate", async () => {
    const repository = new OutreachRepository();
    const service = new OutreachService(repository);
    const run = repository.createRun("full", 1, JSON.stringify({ targetCount: 1 }), "junglegrid-qwen");
    const execution = repository.createJungleGridExecution({
      runId: run.id,
      workspaceId: "default",
      campaignId: "jungle-grid",
      pipelineStage: "prospect_research",
    });
    repository.updateJungleGridExecution(execution.id, {
      junglegridJobId: "job-existing",
      executionPhase: "running",
      retryCount: 0,
    });
    const client = provider();

    await runOutreach(
      { targetCount: 1, mode: "junglegrid-qwen" },
      service,
      run.id,
      {
        provider: client,
        maximumAttempts: 3,
        ingest: () => ({ drafted: 0, failed: 0, modelMode: null }),
      },
    );

    expect(client.submit).not.toHaveBeenCalled();
    expect(repository.listJungleGridExecutions(run.id)).toHaveLength(1);
    expect(repository.getRun(run.id)?.phase).toBe("completed");
  });

  it("discovers and resumes active jobs through startup recovery", async () => {
    const repository = new OutreachRepository();
    const service = new OutreachService(repository);
    const run = repository.createRun(
      "full",
      1,
      JSON.stringify({ targetCount: 1, campaignId: "jungle-grid" }),
      "junglegrid-qwen",
    );
    const execution = repository.createJungleGridExecution({
      runId: run.id,
      workspaceId: "default",
      campaignId: "jungle-grid",
      pipelineStage: "prospect_research",
    });
    repository.updateJungleGridExecution(execution.id, {
      junglegridJobId: "job-recovery",
      executionPhase: "running",
    });
    const client = provider();

    const result = await resumeActiveJungleGridRuns(service, {
      provider: client,
      maximumAttempts: 2,
      ingest: () => ({ drafted: 0, failed: 0, modelMode: null }),
    });

    expect(result).toEqual({ resumed: 1, failed: 0, skipped: 0 });
    expect(client.submit).not.toHaveBeenCalled();
    expect(repository.getRun(run.id)?.phase).toBe("completed");
  });

  it("does not retry a cancelled job", async () => {
    const repository = new OutreachRepository();
    const service = new OutreachService(repository);
    const client = provider({ waits: ["cancelled"] });

    await expect(
      runOutreach(
        { targetCount: 1, mode: "junglegrid-qwen" },
        service,
        undefined,
        { provider: client, maximumAttempts: 3, sleep: vi.fn() },
      ),
    ).rejects.toThrow(/cancelled/);

    const run = repository.listRuns(1)[0];
    expect(run.phase).toBe("cancelled");
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(repository.listJungleGridExecutions(run.id)).toHaveLength(1);
  });

  it("retries malformed artifacts and succeeds on a fresh job", async () => {
    const repository = new OutreachRepository();
    const service = new OutreachService(repository);
    const client = provider({ waits: ["completed", "completed"], artifactFailures: 1 });

    const result = await runOutreach(
      { targetCount: 1, mode: "junglegrid-qwen" },
      service,
      undefined,
      {
        provider: client,
        maximumAttempts: 2,
        retryBackoffSeconds: 1,
        sleep: vi.fn().mockResolvedValue(undefined),
        ingest: () => ({ drafted: 1, failed: 0, modelMode: "qwen" }),
      },
    );

    expect(client.submit).toHaveBeenCalledTimes(2);
    expect(repository.listJungleGridExecutions(result.runId)[0].failureReason).toMatch(
      /missing required artifacts/,
    );
  });

  it("marks timeout after bounded retry exhaustion", async () => {
    const repository = new OutreachRepository();
    const service = new OutreachService(repository);
    const client = provider({ waits: ["timeout", "timeout"] });

    await expect(
      runOutreach(
        { targetCount: 1, mode: "junglegrid-qwen" },
        service,
        undefined,
        {
          provider: client,
          maximumAttempts: 2,
          retryBackoffSeconds: 1,
          sleep: vi.fn().mockResolvedValue(undefined),
        },
      ),
    ).rejects.toThrow(/polling timeout/);

    const run = repository.listRuns(1)[0];
    expect(run.phase).toBe("timed_out");
    expect(run.retryCount).toBe(1);
    expect(repository.listJungleGridExecutions(run.id)).toHaveLength(2);
    expect(repository.listJungleGridExecutions(run.id).every((item) => item.executionPhase === "timed_out")).toBe(true);
  });
});
