import { beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";

const base = {
  name: "Jane Maintainer",
  email: "jane@acme.dev",
  emailSourceUrl: "https://github.com/jane",
  emailSourceType: "github_profile" as const,
  githubUsername: "jane",
  githubUrl: "https://github.com/jane",
  project: "acme/agent",
  projectKey: "acme/agent",
  category: "agent_framework" as const,
};

describe("OutreachRepository deduplication", () => {
  beforeEach(() => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
  });

  it("prevents duplicate people and projects", () => {
    const repository = new OutreachRepository();
    const first = repository.upsertProspect(base);
    const second = repository.upsertProspect({ ...base, name: "Jane Updated" });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(repository.listProspects()).toHaveLength(1);
  });

  it("tracks workflow status without implying email was sent", () => {
    const repository = new OutreachRepository();
    const prospect = repository.upsertProspect(base).prospect;
    repository.setProspectStatus(prospect.id, "reviewed");
    expect(repository.getProspect(prospect.id)?.status).toBe("reviewed");
  });
});
