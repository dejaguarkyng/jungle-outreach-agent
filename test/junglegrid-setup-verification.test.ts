import { describe, expect, it, vi } from "vitest";
import { requiredArtifactNames } from "@/packages/shared/src";
import { verifyJungleGridSetup } from "@/src/services/junglegrid-setup-verification";

function provider(overrides: Record<string, unknown> = {}) {
  return {
    status: vi.fn().mockResolvedValue({
      configured: true,
      reachable: true,
      message: "ok",
    }),
    estimate: vi.fn().mockResolvedValue({ expected_cost: 0.01 }),
    submit: vi.fn().mockResolvedValue({ job_id: "job-setup", status: "queued" }),
    waitForCompletion: vi.fn().mockResolvedValue({
      job_id: "job-setup",
      status: "completed",
    }),
    getEvents: vi.fn().mockResolvedValue([{ phase: "queued" }, { phase: "running" }]),
    getLogs: vi.fn().mockResolvedValue([{ message: "done" }]),
    listArtifacts: vi.fn().mockResolvedValue(
      requiredArtifactNames.map((filename, index) => ({
        artifact_id: `artifact-${index}`,
        filename,
      })),
    ),
    ...overrides,
  };
}

describe("Jungle Grid setup verification", () => {
  it("verifies credentials, a real job lifecycle, logs, events, and artifacts", async () => {
    const client = provider();
    const result = await verifyJungleGridSetup(client);
    expect(client.submit).toHaveBeenCalledWith("junglegrid-template", 1);
    expect(result).toMatchObject({
      jobId: "job-setup",
      status: "completed",
      events: 2,
      logs: 1,
    });
    expect(result.artifacts).toEqual(expect.arrayContaining([...requiredArtifactNames]));
  });

  it("fails closed when credentials are not reachable", async () => {
    const client = provider({
      status: vi.fn().mockResolvedValue({
        configured: true,
        reachable: false,
        message: "unauthorized",
      }),
    });
    await expect(verifyJungleGridSetup(client)).rejects.toThrow("unauthorized");
    expect(client.submit).not.toHaveBeenCalled();
  });

  it("rejects a completed setup job with missing artifacts", async () => {
    const client = provider({ listArtifacts: vi.fn().mockResolvedValue([]) });
    await expect(verifyJungleGridSetup(client)).rejects.toThrow(/missing artifacts/);
  });
});
