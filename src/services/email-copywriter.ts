import type { Prospect, ResearchNote } from "@/src/domain/schemas";
import { ALLOWED_LINK, validateDraftContent } from "@/src/safety/email-validation";

function words(value: string): string[] {
  return value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

function clip(value: string, maxWords: number): string {
  return words(value).slice(0, maxWords).join(" ").replace(/[,:;.-]+$/, "");
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function heuristicDraft(prospect: Prospect, research: ResearchNote): { subject: string; body: string } {
  const detail = clip(research.personalizationDetail, 11);
  const relevance = clip(research.junglegridRelevance, 16);
  const subject = `Jungle Grid x ${clip(prospect.project.split("/").pop() ?? prospect.project, 5)}`;
  let body = [
    `Hi ${firstName(prospect.name)},`,
    "",
    `I saw your work on ${prospect.project}, especially ${detail}. I’m building Jungle Grid, an AI execution layer for agent-triggered workloads, inference, batch jobs, logs, retries, and artifacts.`,
    "",
    `I’m reaching out because ${relevance}. It seems close to the execution problems teams encounter as AI workloads move beyond local development.`,
    "",
    `Thought it might be relevant to what you’re building: ${ALLOWED_LINK}`,
    "",
    "Benedict",
  ].join("\n");

  let validation = validateDraftContent(subject, body);
  if (validation.wordCount < 60) {
    body = body.replace(
      "\n\nThought it might",
      "\n\nI’d value your perspective if this overlaps with what your users are running today.\n\nThought it might",
    );
    validation = validateDraftContent(subject, body);
  }
  if (!validation.valid) {
    throw new Error(`Unable to construct a valid draft: ${validation.errors.join(" ")}`);
  }
  return { subject, body };
}

export class EmailCopywriter {
  async write(prospect: Prospect, research: ResearchNote): Promise<{ subject: string; body: string }> {
    return heuristicDraft(prospect, research);
  }
}
