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

const evidence = {
  evidence_id: "ev-runtime",
  entity_id: "project:sample-agent-runtime",
  claim_type: "ai_workload" as const,
  claim: "The durable worker queue preserves logs and output artifacts.",
  source_url: "https://github.com/sample/agent-runtime#readme",
  source_type: "repository_readme",
  source_authority: 0.95,
  published_at: null,
  retrieved_at: new Date().toISOString(),
  directness: "direct" as const,
  freshness: 1,
  independence_group: "github-readme",
  content_hash: "hash-runtime",
  clean: true,
};

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
    validation_status: "send_ready",
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
        entity_id: "project:sample-agent-runtime",
        canonical_entity_id: "project:sample-agent-runtime",
        project: "sample/agent-runtime",
        project_url: "https://github.com/sample/agent-runtime",
        project_description: "Durable agent jobs.",
        category: "agent_compute",
        canonical_entities: [
          {
            entity_id: "project:sample-agent-runtime",
            entity_type: "project",
            canonical_name: "sample/agent-runtime",
            aliases: ["sample/agent-runtime", "agent-runtime"],
            source_specific_ids: { github: "sample/agent-runtime" },
            confidence: 0.95,
          },
          {
            entity_id: "person:avery",
            entity_type: "person",
            canonical_name: "Avery",
            aliases: ["Avery"],
            source_specific_ids: { email: "avery@agent-runtime.dev" },
            confidence: 0.8,
          },
        ],
        verified_relationships: [
          {
            relationship_type: "person_reachable_for_project",
            from_entity_id: "person:avery",
            to_entity_id: "project:sample-agent-runtime",
            confidence: 0.8,
            evidence_ids: ["ev-runtime"],
          },
        ],
        conflicting_claims: [],
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
        evidence: [evidence],
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
        evidence: [evidence],
        score_evidence_ids: {
          agentMcpRelevance: ["ev-runtime"],
          aiWorkloadRelevance: ["ev-runtime"],
        },
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
      status: "successful",
      primary_model_generated: 1,
      fallback_generated: 0,
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

  it("fails closed when a production Qwen bundle omits semantic stage execution", () => {
    const invalid = bundle();
    invalid.run_summary.execution_backend = "jungle_grid";
    invalid.run_summary.production_eligible = true;
    expect(() =>
      validateArtifactBundle(invalid, { fitScoreThreshold: 70, maxPerDomain: 2 }),
    ).toThrow(/must complete research, qualification/);
  });

  it("validates the selected campaign offer URL instead of hardcoding Jungle Grid", () => {
    const genericBody = body
      .replaceAll("Jungle Grid", "Trace Harbor")
      .replace("https://junglegrid.dev", "https://traceharbor.example");
    const generic = bundle([
      draft({
        category: "developer_tool",
        subject: "Trace Harbor and agent-runtime",
        body: genericBody,
        word_count: genericBody.trim().split(/\s+/).length,
        links: ["https://traceharbor.example"],
      }),
    ]);
    generic.prospects[0].category = "developer_tool";
    generic.scored_prospects[0].category = "developer_tool";
    generic.run_summary.campaign_id = "generic-saas-observability";
    generic.run_summary.offer_name = "Trace Harbor";
    expect(
      validateArtifactBundle(generic, { fitScoreThreshold: 70, maxPerDomain: 2 }),
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

  it("rejects canonical relationships that reference unknown evidence", () => {
    const invalid = bundle();
    invalid.prospects[0].verified_relationships![0].evidence_ids = ["ev-missing"];
    expect(() =>
      validateArtifactBundle(invalid, { fitScoreThreshold: 70, maxPerDomain: 2 }),
    ).toThrow(/relationship references unknown evidence/);
  });

  it("accepts degraded fallback drafts only as manual review", () => {
    const fallback = draft({
      model_mode: "fallback",
      validation_status: "manual_review_required",
      validation_errors: ["fallback generation requires manual review"],
    });
    const degraded = bundle([fallback]);
    degraded.run_summary.fallback_used = true;
    degraded.run_summary.status = "degraded";
    degraded.run_summary.primary_model_generated = 0;
    degraded.run_summary.fallback_generated = 1;
    degraded.run_summary.drafts_passed = 0;
    degraded.validation_report.passed = 0;
    degraded.validation_report.send_ready = 0;
    degraded.validation_report.manual_review_required = 1;
    expect(
      validateArtifactBundle(degraded, { fitScoreThreshold: 70, maxPerDomain: 2 }),
    ).toBeTruthy();
  });

  it("rejects fallback-only qwen runs reported as successful", () => {
    const fallback = draft({
      model_mode: "fallback",
      validation_status: "send_ready",
      validation_errors: [],
    });
    const degraded = bundle([fallback]);
    degraded.run_summary.fallback_used = true;
    degraded.run_summary.status = "successful";
    degraded.run_summary.primary_model_generated = 0;
    degraded.run_summary.fallback_generated = 1;
    expect(() =>
      validateArtifactBundle(degraded, { fitScoreThreshold: 70, maxPerDomain: 2 }),
    ).toThrow(/Fallback-only Qwen runs must be reported as degraded|Fallback drafts require manual review/);
  });
});
