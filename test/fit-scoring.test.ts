import { describe, expect, it } from "vitest";
import { scoreProspect } from "@/src/services/fit-scoring";
import type { Prospect, ResearchNote } from "@/src/domain/schemas";

const prospect: Prospect = {
  id: "p1",
  name: "Jane",
  roleTitle: "Maintainer",
  email: "jane@acme.dev",
  emailSourceUrl: "https://github.com/jane",
  emailSourceType: "github_profile",
  githubUsername: "jane",
  githubUrl: "https://github.com/jane",
  websiteUrl: "https://acme.dev",
  company: "Acme",
  project: "acme/agent-runtime",
  projectKey: "acme/agent-runtime",
  projectDescription: "Agent runtime for queued GPU inference and batch compute.",
  category: "agent_compute",
  fitScore: null,
  scoreBreakdown: null,
  confidenceScore: 0.95,
  status: "researched",
  domain: "acme.dev",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const research: ResearchNote = {
  id: "r1",
  prospectId: "p1",
  summary: "The project dispatches agent jobs to workers.",
  personalizationDetail: "It exposes retries, queues, and artifacts for agent-triggered jobs.",
  junglegridRelevance: "Agents need durable inference and training execution with logs.",
  evidenceUrls: ["https://github.com/acme/agent-runtime#readme"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("fit scoring", () => {
  it("scores a strong agent compute prospect above the default threshold", () => {
    const result = scoreProspect(prospect, research, {
      stars: 1200,
      pushedAt: new Date().toISOString(),
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
