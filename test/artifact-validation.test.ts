import { describe, expect, it } from "vitest";
import {
  validateArtifactBundle,
} from "@/src/services/artifact-ingestion";
import {
  validateEmailDraftArtifact,
  type ArtifactBundle,
  type ArtifactEmailDraft,
} from "@/packages/shared/src";

const body = `Hi Avery,

I read the public documentation for agent-runtime and noticed its durable worker queue preserves logs and output artifacts. I’m building Jungle Grid for teams that need to run inference, workers, and long-running AI jobs without stitching together queueing, retries, and artifact handling themselves.

The documented workflow seems relevant because teams need reliable compute beyond lightweight tool calls, especially once agent actions become long-running jobs that need auditable retries, visible progress, and outputs people can inspect later.

If that is a live problem for you, the shortest overview is https://junglegrid.dev.

Benedict`;

function draft(overrides: Partial<ArtifactEmailDraft> = {}): ArtifactEmailDraft {
  return {
    prospect_id: "p1",
    name: "Avery",
    email: "avery@agent-runtime.dev",
    email_source_url: "https://agent-runtime.dev/contact",
    project: "sample/agent-runtime",
    category: "agent_compute",
    fit_score: 92,
    subject: "Jungle Grid and agent-runtime",
    body,
    word_count: body.trim().split(/\s+/).length,
    links: ["https://junglegrid.dev"],
    evidence_urls: [
      "https://agent-runtime.dev/contact",
      "https://github.com/sample/agent-runtime#readme",
    ],
    personalization_claims: ["the durable worker queue preserves logs and output artifacts"],
    model_mode: "qwen",
    validation_status: "passed",
    validation_errors: [],
    ...overrides,
  };
}

function bundle(emailDrafts = [draft()]): ArtifactBundle {
  return {
    prospects: [
      {
        prospect_id: "p1",
        name: "Avery",
        email: "avery@agent-runtime.dev",
        email_source_url: "https://agent-runtime.dev/contact",
        email_source_type: "official_website",
        project: "sample/agent-runtime",
        project_url: "https://github.com/sample/agent-runtime",
        project_description: "Durable agent jobs.",
        category: "agent_compute",
      },
    ],
    research_notes: [
      {
        prospect_id: "p1",
        summary: "Agent Runtime documents durable worker jobs.",
        personalization_detail: "The durable worker queue preserves logs and output artifacts.",
        junglegrid_relevance: "The workload needs durable compute execution.",
        evidence_points: [
          "durable worker queue preserves logs",
          "output artifacts stay attached to jobs",
        ],
        pain_signals: ["durable worker queue preserves logs and output artifacts"],
        evidence_urls: [
          "https://agent-runtime.dev/contact",
          "https://github.com/sample/agent-runtime#readme",
        ],
        evidence_strength: 0.9,
      },
    ],
    scored_prospects: [
      {
        prospect_id: "p1",
        name: "Avery",
        email: "avery@agent-runtime.dev",
        email_source_url: "https://agent-runtime.dev/contact",
        email_source_type: "official_website",
        project: "sample/agent-runtime",
        project_url: "https://github.com/sample/agent-runtime",
        project_description: "Durable agent jobs.",
        category: "agent_compute",
        fit_score: 92,
        score_breakdown: {
          agentMcpRelevance: 20,
          aiWorkloadRelevance: 20,
          infrastructurePain: 20,
          openSourceActivity: 15,
          jungleGridComprehension: 10,
          contactQuality: 7,
        },
        evidence_strength: 0.9,
        contact_quality: 7,
        evidence_points: [
          "durable worker queue preserves logs",
          "output artifacts stay attached to jobs",
        ],
        why_this_person: "Reachable maintainer for the runtime.",
        why_now: "The repo documents active execution pain.",
        concrete_pain_signal: "durable worker queue preserves logs and output artifacts",
        suggested_angle: "Durable execution for worker jobs and artifacts.",
        outreach_priority: "high",
        excluded: false,
      },
    ],
    email_drafts: emailDrafts,
    run_summary: {
      job: "full-run-qwen",
      mode: "junglegrid-qwen",
      target: 1,
      discovered: 1,
      researched: 1,
      scored: 1,
      drafts_passed: 1,
      drafts_failed: 0,
      skipped: 0,
      fallback_used: false,
      model: "qwen2.5:3b",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    },
    validation_report: {
      valid: true,
      checked: 1,
      passed: 1,
      failed: 0,
      errors: [],
    },
  };
}

describe("worker artifact validation", () => {
  it("accepts a complete evidence-bound bundle", () => {
    expect(
      validateArtifactBundle(bundle(), { fitScoreThreshold: 70, maxPerDomain: 2 }),
    ).toBeTruthy();
  });

  it("rejects duplicates, domain overflow, and invalid links", () => {
    const second = draft({
      prospect_id: "p2",
      links: ["https://junglegrid.dev"],
      body: body.replace("https://junglegrid.dev", "https://invalid.test"),
    });
    const result = validateEmailDraftArtifact([draft(), second], {
      fitScoreThreshold: 70,
      maxPerDomain: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Duplicate email/);
    expect(result.errors.join(" ")).toMatch(/exceeds the cap/);
    expect(result.errors.join(" ")).toMatch(/Allowed links are|must include/);
  });

  it("rejects worker-reported failures", () => {
    const invalid = bundle();
    invalid.validation_report.valid = false;
    expect(() =>
      validateArtifactBundle(invalid, { fitScoreThreshold: 70, maxPerDomain: 2 }),
    ).toThrow(/marked.*invalid/);
  });
});
