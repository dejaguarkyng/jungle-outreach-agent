import type { Prospect, ResearchNote, ScoreBreakdown } from "@/src/domain/schemas";

const keywordGroups = {
  agent: /\b(agent|agentic|mcp|model context protocol|tool calling|autonomous)\b/i,
  workload: /\b(inference|training|fine[- ]?tun|batch|gpu|model serving|vllm|cuda)\b/i,
  infrastructure: /\b(compute|runtime|execution|queue|retry|artifact|sandbox|worker|orchestrat)\b/i,
};

export function scoreProspect(
  prospect: Prospect,
  research: ResearchNote,
  activity: { stars?: number; pushedAt?: string } = {},
): { score: number; breakdown: ScoreBreakdown } {
  const text = [
    prospect.project,
    prospect.projectDescription,
    research.summary,
    research.personalizationDetail,
    research.junglegridRelevance,
  ]
    .filter(Boolean)
    .join(" ");

  const categoryAgentBoost = ["agent_framework", "mcp", "agent_compute"].includes(prospect.category);
  const agentMcpRelevance = Math.min(
    20,
    (categoryAgentBoost ? 12 : 5) + (keywordGroups.agent.test(text) ? 8 : 0),
  );
  const aiWorkloadRelevance = Math.min(
    20,
    (["ai_infrastructure", "inference_training", "agent_compute"].includes(prospect.category)
      ? 12
      : 6) + (keywordGroups.workload.test(text) ? 8 : 0),
  );
  const infrastructurePain = Math.min(
    20,
    (keywordGroups.infrastructure.test(text) ? 14 : 7) +
      (/\b(reliab|scale|latency|capacity|deploy|production)\b/i.test(text) ? 6 : 0),
  );

  const pushedAt = activity.pushedAt ? new Date(activity.pushedAt).getTime() : 0;
  const ageDays = pushedAt ? (Date.now() - pushedAt) / 86_400_000 : Number.POSITIVE_INFINITY;
  const activityScore = ageDays <= 30 ? 10 : ageDays <= 180 ? 7 : 3;
  const starsScore = (activity.stars ?? 0) >= 1000 ? 5 : (activity.stars ?? 0) >= 100 ? 3 : 1;
  const openSourceActivity = Math.min(15, activityScore + starsScore);

  const jungleGridComprehension = Math.min(
    15,
    (keywordGroups.workload.test(text) ? 8 : 4) + (keywordGroups.infrastructure.test(text) ? 7 : 3),
  );
  const contactQuality =
    prospect.emailSourceType === "github_profile"
      ? 10
      : prospect.emailSourceType === "official_website"
        ? 9
        : 8;

  const breakdown: ScoreBreakdown = {
    agentMcpRelevance,
    aiWorkloadRelevance,
    infrastructurePain,
    openSourceActivity,
    jungleGridComprehension,
    contactQuality,
  };
  return {
    score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    breakdown,
  };
}
