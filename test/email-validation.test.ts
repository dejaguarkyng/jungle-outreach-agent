import { describe, expect, it } from "vitest";
import { countWords, validateDraftContent } from "@/src/safety/email-validation";

const validDraft = {
  subject: "Jungle Grid and Acme agent runtime",
  body: [
    "Hi Jane, I read the public notes for Acme agent runtime and noticed its durable job queue keeps logs, retries, and artifacts together.",
    "Jungle Grid helps agent teams run real compute jobs when tool calls outgrow lightweight APIs.",
    "The overlap with your runtime work seemed clear, so I wanted to share the project for operators evaluating batch inference workflows: https://junglegrid.dev",
    "Benedict",
  ].join(" "),
};

describe("outreach copy validation", () => {
  it("accepts a 60-80 word body with exactly the Jungle Grid link", () => {
    const result = validateDraftContent(validDraft.subject, validDraft.body);
    expect(countWords(validDraft.body)).toBeGreaterThanOrEqual(60);
    expect(countWords(validDraft.body)).toBeLessThanOrEqual(80);
    expect(result.valid).toBe(true);
  });

  it("rejects extra or alternative links", () => {
    expect(validateDraftContent(validDraft.subject, `${validDraft.body}\nhttps://example.com`).valid).toBe(false);
    expect(
      validateDraftContent(
        validDraft.subject,
        validDraft.body.replace("https://junglegrid.dev", "https://example.com"),
      )
        .valid,
    ).toBe(false);
  });

  it("rejects bodies outside 60-80 words", () => {
    expect(validateDraftContent("Subject", "Hi there https://junglegrid.dev").valid).toBe(false);
  });
});
