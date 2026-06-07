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
});
