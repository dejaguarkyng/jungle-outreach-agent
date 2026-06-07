import type { Prospect, ResearchNote } from "@/src/domain/schemas";
import { GitHubProvider } from "@/src/providers/github-provider";

function cleanMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickEvidenceDetail(readme: string, fallback: string): string {
  const clean = cleanMarkdown(readme).slice(0, 20_000);
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 240);
  const specific = sentences.find((sentence) =>
    /\b(agent|mcp|inference|training|workflow|runtime|compute|batch|deploy|tool|model)\b/i.test(
      sentence,
    ),
  );
  return specific ?? fallback;
}

function relevanceFor(prospect: Prospect): string {
  const byCategory: Record<Prospect["category"], string> = {
    agent_framework:
      "agent-triggered workloads need a reliable execution layer once tools move beyond lightweight API calls",
    mcp: "MCP tools that launch real compute need durable jobs, logs, retries, and retrievable artifacts",
    workflow_automation:
      "compute-heavy workflow steps benefit from a dedicated execution layer instead of tying up orchestrator workers",
    ai_infrastructure:
      "Jungle Grid can provide one control surface for dispatched AI workloads, retries, logs, and artifacts",
    llm_application:
      "production LLM features often need asynchronous inference and batch execution outside the application process",
    inference_training:
      "inference and training tools need dependable capacity, observable job execution, retries, and artifact handling",
    open_source_ai:
      "open-source AI tools can delegate durable compute jobs while retaining logs, retries, and artifacts",
    agent_compute:
      "agents that initiate real jobs need a durable boundary for compute, status, logs, retries, and artifacts",
  };
  return byCategory[prospect.category];
}

export class ProspectResearchService {
  constructor(private readonly github = new GitHubProvider()) {}

  async research(prospect: Prospect): Promise<Omit<ResearchNote, "id" | "prospectId" | "createdAt" | "updatedAt">> {
    const readme = await this.github.getReadme(prospect.projectKey);
    const fallback = prospect.projectDescription || `${prospect.project} is an active open-source project.`;
    const detail = pickEvidenceDetail(readme.text, fallback);
    const evidenceUrls = [...new Set([prospect.emailSourceUrl, readme.sourceUrl, prospect.githubUrl].filter(Boolean))] as string[];
    const relevance = relevanceFor(prospect);

    return {
      summary: `${prospect.project} is ${fallback.replace(/\.$/, "")}. The public project documentation highlights ${detail.replace(/\.$/, "")}.`,
      personalizationDetail: detail,
      junglegridRelevance: relevance,
      evidenceUrls,
    };
  }
}
