import { Octokit } from "@octokit/rest";
import { getEnv } from "@/src/config/env";
import {
  extractPublicEmails,
  validateProfileEmail,
  type PublicEmailEvidence,
} from "@/src/safety/public-email";
import type { ProspectCategory } from "@/src/domain/schemas";

export type DiscoveryCandidate = {
  name: string;
  roleTitle: string | null;
  contact: PublicEmailEvidence;
  githubUsername: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  company: string | null;
  project: string;
  projectKey: string;
  projectDescription: string | null;
  repoUrl: string;
  category: ProspectCategory;
  stars: number;
  pushedAt: string | null;
};

const queryPacks: Array<{ query: string; category: ProspectCategory }> = [
  { query: '"AI agent" framework in:name,description,readme stars:>20', category: "agent_framework" },
  { query: 'MCP server "model context protocol" in:name,description,readme stars:>10', category: "mcp" },
  { query: 'workflow automation agent in:name,description,readme stars:>20', category: "workflow_automation" },
  { query: '"AI infrastructure" inference in:description,readme stars:>20', category: "ai_infrastructure" },
  { query: 'vllm inference serving in:name,description,readme stars:>20', category: "inference_training" },
  { query: '"batch jobs" agent runtime in:description,readme stars:>10', category: "agent_compute" },
];

export class GitHubProvider {
  private readonly octokit: Octokit;

  constructor(token = getEnv().GITHUB_TOKEN) {
    this.octokit = new Octokit({
      auth: token,
      userAgent: "jungle-grid-outreach-agent/1.0",
      throttle: undefined,
    });
  }

  async discover(limit: number, category?: ProspectCategory): Promise<DiscoveryCandidate[]> {
    const packs = category ? queryPacks.filter((pack) => pack.category === category) : queryPacks;
    const candidates: DiscoveryCandidate[] = [];
    const perQuery = Math.max(5, Math.ceil(limit / Math.max(1, packs.length)));

    for (const pack of packs) {
      if (candidates.length >= limit) break;
      const response = await this.octokit.search.repos({
        q: `${pack.query} archived:false fork:false`,
        sort: "updated",
        order: "desc",
        per_page: Math.min(perQuery, 30),
      });

      for (const repo of response.data.items) {
        if (candidates.length >= limit) break;
        if (!repo.owner) continue;
        const candidate = await this.repoToCandidate(repo.owner.login, repo.name, pack.category);
        if (candidate) candidates.push(candidate);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }

    return candidates;
  }

  async getReadme(projectKey: string): Promise<{ text: string; sourceUrl: string }> {
    const [owner, repo] = projectKey.split("/");
    if (!owner || !repo) throw new Error("Invalid GitHub project key.");
    const response = await this.octokit.repos.getReadme({
      owner,
      repo,
      mediaType: { format: "raw" },
    });
    const data: unknown = response.data;
    return {
      text:
        typeof data === "string"
          ? data.slice(0, 80_000)
          : Buffer.from((data as { content?: string }).content ?? "", "base64")
              .toString("utf8")
              .slice(0, 80_000),
      sourceUrl: `https://github.com/${owner}/${repo}#readme`,
    };
  }

  private async repoToCandidate(
    owner: string,
    repoName: string,
    category: ProspectCategory,
  ): Promise<DiscoveryCandidate | null> {
    const [repoResponse, readme] = await Promise.all([
      this.octokit.repos.get({ owner, repo: repoName }),
      this.getReadme(`${owner}/${repoName}`).catch(() => null),
    ]);
    const repo = repoResponse.data;
    const maintainers =
      repo.owner.type === "User"
        ? [repo.owner.login]
        : await this.getTopContributorLogins(owner, repoName);

    for (const login of maintainers.slice(0, 3)) {
      const profileResponse = await this.octokit.users.getByUsername({ username: login });
      const profile = profileResponse.data;
      const profileContact = validateProfileEmail(profile.email, profile.html_url);
      const readmeContacts = readme
        ? extractPublicEmails(readme.text, readme.sourceUrl, "repository_readme")
        : [];
      const contact = profileContact ?? readmeContacts[0];
      if (!contact) continue;

      return {
        name: profile.name?.trim() || login,
        roleTitle: profile.bio?.slice(0, 160) || null,
        contact,
        githubUsername: login,
        githubUrl: profile.html_url,
        websiteUrl: repo.homepage || profile.blog || null,
        company: profile.company?.replace(/^@/, "") || (repo.owner.type === "Organization" ? owner : null),
        project: repo.full_name,
        projectKey: repo.full_name.toLowerCase(),
        projectDescription: repo.description,
        repoUrl: repo.html_url,
        category,
        stars: repo.stargazers_count,
        pushedAt: repo.pushed_at,
      };
    }
    return null;
  }

  private async getTopContributorLogins(owner: string, repo: string): Promise<string[]> {
    const response = await this.octokit.repos.listContributors({
      owner,
      repo,
      per_page: 5,
      anon: "false",
    });
    return response.data
      .map((contributor) => contributor.login)
      .filter((login): login is string => Boolean(login));
  }
}
