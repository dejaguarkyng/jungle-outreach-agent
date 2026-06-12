import { beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";

describe("run audit persistence", () => {
  beforeEach(() => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
  });

  it("stores mode, Jungle Grid job, model, retry, and artifacts", () => {
    const repository = new OutreachRepository();
    const run = repository.createRun("manual", 17, undefined, "junglegrid-qwen");
    const updated = repository.updateRun(run.id, {
      phase: "completed",
      junglegridJobId: "job-123",
      modelMode: "qwen",
      retryCount: 1,
      artifacts: ["email_drafts.json"],
    });
    expect(updated.mode).toBe("junglegrid-qwen");
    expect(updated.junglegridJobId).toBe("job-123");
    expect(updated.modelMode).toBe("qwen");
    expect(updated.artifacts).toEqual(["email_drafts.json"]);
  });

  it("persists active Jungle Grid lifecycle state for restart recovery", () => {
    const repository = new OutreachRepository();
    const run = repository.createRun("full", 10, undefined, "junglegrid-qwen");
    const execution = repository.createJungleGridExecution({
      runId: run.id,
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      pipelineStage: "prospect_research",
      estimate: { expected_cost: 0.12 },
      workloadMetadata: { model: "qwen2.5:3b" },
    });
    const running = repository.updateJungleGridExecution(execution.id, {
      junglegridJobId: "job-running",
      executionPhase: "running",
      submittedAt: "2026-06-12T09:00:00.000Z",
      startedAt: "2026-06-12T09:01:00.000Z",
      logsCursor: "cursor-1",
    });

    expect(running.estimate).toEqual({ expected_cost: 0.12 });
    expect(running.workloadMetadata).toEqual({ model: "qwen2.5:3b" });
    expect(repository.getLatestJungleGridExecution(run.id)?.junglegridJobId).toBe(
      "job-running",
    );
    expect(repository.listActiveJungleGridExecutions()).toHaveLength(1);

    repository.updateJungleGridExecution(execution.id, {
      executionPhase: "completed",
      completedAt: "2026-06-12T09:05:00.000Z",
      artifacts: [{ filename: "research-results.json" }],
    });
    expect(repository.listActiveJungleGridExecutions()).toHaveLength(0);
  });

  it("supports explicit local data retention pruning", () => {
    const repository = new OutreachRepository();
    expect(repository.pruneExpiredData(0)).toEqual({
      runsDeleted: 0,
      prospectsDeleted: 0,
      auditLogsDeleted: 0,
    });
    const run = repository.createRun("full", 1, undefined, "junglegrid-qwen");
    getDatabase()
      .prepare(
        "UPDATE outreach_runs SET phase = 'completed', completed_at = '2020-01-01T00:00:00.000Z'",
      )
      .run();
    const result = repository.pruneExpiredData(30);
    expect(result.runsDeleted).toBe(1);
    expect(repository.getRun(run.id)).toBeNull();
  });
});
