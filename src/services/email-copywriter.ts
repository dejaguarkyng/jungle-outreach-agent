import type { Prospect, ResearchNote } from "@/src/domain/schemas";
import {
  ALLOWED_LINK,
  validateDraftContent,
} from "@/src/safety/email-validation";

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
  const detail = clip(research.personalizationDetail, 18);
  const relevance = clip(research.junglegridRelevance, 24);
  const subject = `Jungle Grid x ${clip(prospect.project.split("/").pop() ?? prospect.project, 5)}`;
  const body = [
    `Hi ${firstName(prospect.name)},`,
    "",
    `I saw your work on ${prospect.project}, especially ${detail}. I’m building Jungle Grid for teams that need to run inference, workers, and long-running AI jobs without stitching together queueing, retries, and artifact handling themselves.`,
    "",
    `I’m reaching out because ${relevance}. That usually becomes painful once an AI product moves from demos into real workloads and the background execution layer starts becoming a bottleneck.`,
    "",
    `If that is a live problem for you, the shortest overview is ${ALLOWED_LINK}.`,
    "",
    "Benedict",
  ].join("\n");
  const validation = validateDraftContent(subject, body);
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
