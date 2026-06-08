import { describe, expect, it } from "vitest";
import { countWords, validateDraftContent } from "@/src/safety/email-validation";

const validDraft = {
  subject: "Jungle Grid and Acme agent runtime",
  body: [
    "Hi Jane, I read the public notes for Acme agent runtime and noticed its durable job queue keeps logs, retries, and artifacts together.",
    "I’m building Jungle Grid for teams that need to run inference, workers, and long-running AI jobs without stitching together queueing, retries, and artifact handling themselves.",
    "The overlap with your runtime work seemed clear because that execution layer usually gets painful once agent actions stop being tiny requests and start behaving like real workloads in production.",
    "If that is a live problem for you, the shortest overview is https://junglegrid.dev.",
    "Benedict",
  ].join(" "),
};

describe("outreach copy validation", () => {
  it("accepts a 70-140 word body with the single allowed link", () => {
    const result = validateDraftContent(validDraft.subject, validDraft.body);
    expect(countWords(validDraft.body)).toBeGreaterThanOrEqual(70);
    expect(countWords(validDraft.body)).toBeLessThanOrEqual(140);
    expect(result.valid).toBe(true);
  });

  it("rejects extra or alternative links", () => {
    expect(validateDraftContent(validDraft.subject, `${validDraft.body}\nhttps://example.com`).valid).toBe(false);
    expect(
      validateDraftContent(
        validDraft.subject,
        `${validDraft.body} https://example.com`,
      )
        .valid,
    ).toBe(false);
  });

  it("rejects bodies outside 70-140 words", () => {
    expect(validateDraftContent("Subject", "Hi there https://junglegrid.dev").valid).toBe(false);
  });
});
