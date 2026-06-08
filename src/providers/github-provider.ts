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
  contactQuality: number;
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

type QueryPack = {
  queries: string[];
  registryTerms: string[];
  category: ProspectCategory;
};

type PackageRegistryMetadata = {
  projectUrls: string[];
  packagePageUrls: string[];
};

const sameDomainPageLimit = 5;
const likelyContactPath = /(?:^|\/)(contact|about|team|company|support|docs|legal|privacy|impressum)(?:\/|$)/i;
const likelyDocsPath = /(?:^|\/)(docs?|guide|developers?|api|reference|manual)(?:\/|$)/i;
const hrefPattern = /href=["']([^"'#]+)["']/gi;
const docsHosts = [/^docs\./i, /readthedocs\.io$/i, /github\.io$/i, /mintlify\.app$/i];

const queryPacks: QueryPack[] = [
  {
    queries: [
      '"AI agent" framework in:name,description,readme stars:>20',
      'agent runtime in:name,description,readme stars:>15',
      '"tool calling" agent in:description,readme stars:>10',
    ],
    registryTerms: ["ai agent framework", "agent runtime", "tool calling agent"],
    category: "agent_framework",
  },
  {
    queries: [
      'MCP server "model context protocol" in:name,description,readme stars:>10',
      '"model context protocol" tools in:description,readme stars:>8',
      'mcp agent tools in:name,description,readme stars:>8',
    ],
    registryTerms: ["model context protocol", "mcp tools", "mcp agent"],
    category: "mcp",
  },
  {
    queries: [
      'workflow automation agent in:name,description,readme stars:>20',
      '"durable workflow" in:description,readme stars:>10',
      '"background jobs" automation in:description,readme stars:>10',
    ],
    registryTerms: ["workflow automation agent", "durable workflow", "background jobs automation"],
    category: "workflow_automation",
  },
  {
    queries: [
      '"AI infrastructure" inference in:description,readme stars:>20',
      'gpu orchestration inference in:description,readme stars:>15',
      '"model serving" infrastructure in:description,readme stars:>10',
    ],
    registryTerms: ["ai infrastructure inference", "gpu orchestration inference", "model serving infrastructure"],
    category: "ai_infrastructure",
  },
  {
    queries: [
      'vllm inference serving in:name,description,readme stars:>20',
      '"batch inference" training in:description,readme stars:>10',
      'fine-tuning inference gpu in:description,readme stars:>10',
    ],
    registryTerms: ["vllm inference serving", "batch inference training", "fine tuning inference gpu"],
    category: "inference_training",
  },
  {
    queries: [
      '"batch jobs" agent runtime in:description,readme stars:>10',
      'durable execution runtime in:description,readme stars:>10',
      'worker queue artifacts retries in:description,readme stars:>8',
    ],
    registryTerms: ["batch jobs agent runtime", "durable execution runtime", "worker queue artifacts"],
    category: "agent_compute",
  },
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
    const seenProjects = new Set<string>();
    const seenUsers = new Set<string>();

    for (const pack of packs) {
      if (candidates.length >= limit) break;
      for (const query of pack.queries) {
        if (candidates.length >= limit) break;
        for (const page of [1, 2]) {
          if (candidates.length >= limit) break;
          const response = await this.octokit.search.repos({
            q: `${query} archived:false fork:false`,
            sort: "updated",
            order: "desc",
            per_page: 30,
            page,
          });

          for (const repo of response.data.items) {
            if (candidates.length >= limit) break;
            if (!repo.owner || seenProjects.has(repo.full_name.toLowerCase())) continue;
            seenProjects.add(repo.full_name.toLowerCase());
            const candidate = await this.repoToCandidate(repo.owner.login, repo.name, pack.category);
            if (candidate) candidates.push(candidate);
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
        }
      }

      for (const project of await this.searchPackageRegistryProjects(pack, limit - candidates.length, seenProjects)) {
        if (candidates.length >= limit) break;
        const candidate = await this.repoToCandidate(project.owner, project.repo, pack.category);
        if (candidate) candidates.push(candidate);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      for (const accountType of ["user", "org"] as const) {
        for (const query of pack.queries) {
          if (candidates.length >= limit) break;
          const normalizedQuery = this.toAccountSearchQuery(query);
          const response = await this.octokit.search.users({
            q: `${normalizedQuery} in:login,fullname,bio type:${accountType}`,
            per_page: 10,
            page: 1,
          });
          for (const user of response.data.items) {
            if (candidates.length >= limit) break;
            if (seenUsers.has(user.login.toLowerCase())) continue;
            seenUsers.add(user.login.toLowerCase());
            const candidate = await this.profileToCandidate(user.login, pack.category, seenProjects);
            if (candidate) candidates.push(candidate);
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
        }
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
    const registryMetadata = await this.getPackageRegistryMetadata(
      owner,
      repoName,
      repo.default_branch ?? "main",
    );
    const homepageContacts = await this.getWebsiteContacts([repo.homepage, ...registryMetadata.projectUrls]);
    const packageContacts = await this.getPackageRegistryContacts(registryMetadata.packagePageUrls);

    for (const login of maintainers.slice(0, 3)) {
      const profileResponse = await this.octokit.users.getByUsername({ username: login });
      const profile = profileResponse.data;
      const profileContact = validateProfileEmail(profile.email, profile.html_url);
      const readmeContacts = readme
        ? extractPublicEmails(readme.text, readme.sourceUrl, "repository_readme")
        : [];
      const blogContacts = await this.getWebsiteContacts(profile.blog);
      const contact = this.pickBestContact(
        [profileContact, ...readmeContacts, ...homepageContacts, ...blogContacts, ...packageContacts].filter(
          Boolean,
        ) as PublicEmailEvidence[],
      );
      if (!contact) continue;

      return {
        name: profile.name?.trim() || login,
        roleTitle: profile.bio?.slice(0, 160) || null,
        contact,
        contactQuality: this.scoreContact(contact),
        githubUsername: login,
        githubUrl: profile.html_url,
        websiteUrl: repo.homepage || profile.blog || null,
        company: profile.company?.replace(/^@/, "") || (repo.owner.type === "Organization" ? owner : null),
        project: repo.full_name,
        projectKey: repo.full_name.toLowerCase(),
        projectDescription: repo.description,
        repoUrl: repo.html_url,
        category,
        stars: repo.stargazers_count ?? 0,
        pushedAt: repo.pushed_at ?? null,
      };
    }
    return null;
  }

  private async profileToCandidate(
    login: string,
    category: ProspectCategory,
    seenProjects: Set<string>,
  ): Promise<DiscoveryCandidate | null> {
    const profileResponse = await this.octokit.users.getByUsername({ username: login });
    const profile = profileResponse.data;
    const repos =
      profile.type === "Organization"
        ? await this.octokit.repos.listForOrg({ org: login, sort: "updated", per_page: 10 })
        : await this.octokit.repos.listForUser({ username: login, sort: "updated", per_page: 10 });
    const repo = repos.data.find(
      (item) => !item.fork && !item.archived && !seenProjects.has(item.full_name.toLowerCase()),
    );
    if (!repo) return null;
    seenProjects.add(repo.full_name.toLowerCase());
    const registryMetadata = await this.getPackageRegistryMetadata(
      repo.owner.login,
      repo.name,
      repo.default_branch ?? "main",
    );

    const [readme, homepageContacts, blogContacts, packageContacts] = await Promise.all([
      this.getReadme(repo.full_name).catch(() => null),
      this.getWebsiteContacts([repo.homepage, ...registryMetadata.projectUrls]),
      this.getWebsiteContacts(profile.blog),
      this.getPackageRegistryContacts(registryMetadata.packagePageUrls),
    ]);
    const profileContact = validateProfileEmail(profile.email, profile.html_url);
    const readmeContacts = readme
      ? extractPublicEmails(readme.text, readme.sourceUrl, "repository_readme")
      : [];
    const contact = this.pickBestContact(
      [profileContact, ...blogContacts, ...homepageContacts, ...readmeContacts, ...packageContacts].filter(
        Boolean,
      ) as PublicEmailEvidence[],
    );
    if (!contact) return null;

    return {
      name: profile.name?.trim() || login,
      roleTitle: profile.bio?.slice(0, 160) || null,
      contact,
      contactQuality: this.scoreContact(contact),
      githubUsername: login,
      githubUrl: profile.html_url,
      websiteUrl: repo.homepage || profile.blog || null,
      company: profile.company?.replace(/^@/, "") || (profile.type === "Organization" ? login : null),
      project: repo.full_name,
      projectKey: repo.full_name.toLowerCase(),
      projectDescription: repo.description,
      repoUrl: repo.html_url,
      category,
      stars: repo.stargazers_count ?? 0,
      pushedAt: repo.pushed_at ?? null,
    };
  }

  private async getWebsiteContacts(urls: Array<string | null | undefined> | string | null | undefined): Promise<PublicEmailEvidence[]> {
    const seeds = (Array.isArray(urls) ? urls : [urls])
      .map((value) => value?.trim() ?? "")
      .filter(Boolean);
    if (seeds.length === 0) return [];
    try {
      const normalizedSeeds = seeds
        .map((value) => {
          try {
            const parsed = new URL(value);
            if (!["http:", "https:"].includes(parsed.protocol)) return null;
            return parsed.toString();
          } catch {
            return null;
          }
        })
        .filter((value): value is string => Boolean(value));
      if (normalizedSeeds.length === 0) return [];

      const seedBases = normalizedSeeds.map((value) => new URL(value));
      const toVisit = [...normalizedSeeds];
      const visited = new Set<string>();
      const found: PublicEmailEvidence[] = [];

      while (toVisit.length > 0 && visited.size < sameDomainPageLimit) {
        const current = toVisit.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const response = await fetch(current, {
          headers: { "User-Agent": "jungle-grid-outreach-agent/1.0" },
        });
        if (!response.ok) continue;
        const text = (await response.text()).slice(0, 120_000);
        const currentUrl = new URL(current);
        const sourceType = seedBases.some((base) => this.isDocsUrl(currentUrl, base)) ? "project_docs" : "official_website";
        found.push(...extractPublicEmails(text, current, sourceType));

        for (const next of this.extractLikelySiteLinks(text, seedBases)) {
          if (!visited.has(next) && !toVisit.includes(next)) toVisit.push(next);
          if (toVisit.length + visited.size >= sameDomainPageLimit) break;
        }
      }

      const seen = new Set<string>();
      return found.filter((contact) => {
        if (seen.has(contact.email)) return false;
        seen.add(contact.email);
        return true;
      });
    } catch {
      return [];
    }
  }

  private extractLikelySiteLinks(html: string, bases: URL[]): string[] {
    const links: string[] = [];
    for (const match of html.matchAll(hrefPattern)) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      try {
        const next = new URL(raw, bases[0]);
        if (!["http:", "https:"].includes(next.protocol)) continue;
        const sameOrigin = bases.some((base) => next.origin === base.origin);
        const docsOrigin = bases.some((base) => next.hostname === base.hostname || this.isDocsUrl(next, base));
        if (!sameOrigin && !docsOrigin) continue;
        if (
          !likelyContactPath.test(next.pathname) &&
          !likelyDocsPath.test(next.pathname) &&
          !bases.some((base) => this.isDocsUrl(next, base))
        ) {
          continue;
        }
        links.push(next.toString());
      } catch {
        continue;
      }
    }
    return [...new Set(links)];
  }

  private isDocsUrl(url: URL, base: URL): boolean {
    return (
      likelyDocsPath.test(url.pathname) ||
      docsHosts.some((pattern) => pattern.test(url.hostname)) ||
      url.hostname === `docs.${base.hostname.replace(/^www\./, "")}`
    );
  }

  private pickBestContact(contacts: PublicEmailEvidence[]): PublicEmailEvidence | null {
    return contacts
      .slice()
      .sort((left, right) => this.scoreContact(right) - this.scoreContact(left))[0] ?? null;
  }

  private scoreContact(contact: PublicEmailEvidence): number {
    const base =
      {
        official_website: 100,
        project_docs: 90,
        package_page: 85,
        github_profile: 75,
        repository_readme: 70,
      }[contact.sourceType] ?? 60;
    const context = contact.context.toLowerCase();
    const contextBonus = /\b(business|partnership|contact|support|hello|reach us)\b/.test(context) ? 8 : 0;
    const genericPenalty = /\b(admin|info)\@/.test(contact.email) ? -4 : 0;
    return base + contextBonus + genericPenalty;
  }

  private async getPackageRegistryMetadata(
    owner: string,
    repoName: string,
    branch: string,
  ): Promise<PackageRegistryMetadata> {
    const manifests = await Promise.all([
      this.getRawFile(owner, repoName, branch, "package.json"),
      this.getRawFile(owner, repoName, branch, "pyproject.toml"),
      this.getRawFile(owner, repoName, branch, "Cargo.toml"),
    ]);
    const projectUrls = new Set<string>();
    const packagePageUrls = new Set<string>();

    const packageJson = manifests[0];
    if (packageJson) {
      try {
        const parsed = JSON.parse(packageJson) as {
          name?: string;
          homepage?: string;
          bugs?: string | { url?: string };
        };
        if (parsed.name) {
          packagePageUrls.add(`https://www.npmjs.com/package/${encodeURIComponent(parsed.name)}`);
          const npm = await this.fetchRegistryJson(`https://registry.npmjs.org/${encodeURIComponent(parsed.name)}`);
          const npmRecord = this.asRecord(npm);
          const distTags = this.asRecord(npmRecord?.["dist-tags"]);
          const versions = this.asRecord(npmRecord?.versions);
          const latestTag = typeof distTags?.latest === "string" ? distTags.latest : null;
          const latest = latestTag ? this.asRecord(versions?.[latestTag]) : null;
          const latestBugs = this.asRecord(latest?.bugs);
          for (const value of [latest?.homepage, latestBugs?.url, parsed.homepage]) {
            if (typeof value === "string" && value.trim()) projectUrls.add(value.trim());
          }
        }
      } catch {
        // Ignore malformed package manifests.
      }
    }

    const pyproject = manifests[1];
    if (pyproject) {
      const name = pyproject.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1];
      if (name) {
        packagePageUrls.add(`https://pypi.org/project/${encodeURIComponent(name)}/`);
        const pypi = await this.fetchRegistryJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
        const info = this.asRecord(this.asRecord(pypi)?.info);
        const projectUrlsRecord = this.asRecord(info?.project_urls);
        for (const value of [info?.home_page, ...Object.values(projectUrlsRecord ?? {})]) {
          if (typeof value === "string" && value.trim()) projectUrls.add(value.trim());
        }
      }
    }

    const cargo = manifests[2];
    if (cargo) {
      const name = cargo.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1];
      if (name) {
        packagePageUrls.add(`https://crates.io/crates/${encodeURIComponent(name)}`);
        const crates = await this.fetchRegistryJson(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`);
        const crate = this.asRecord(this.asRecord(crates)?.crate);
        for (const value of [crate?.homepage, crate?.documentation, crate?.repository]) {
          if (typeof value === "string" && value.trim()) projectUrls.add(value.trim());
        }
      }
    }

    return {
      projectUrls: [...projectUrls],
      packagePageUrls: [...packagePageUrls],
    };
  }

  private async getPackageRegistryContacts(packagePageUrls: string[]): Promise<PublicEmailEvidence[]> {
    const contacts: PublicEmailEvidence[] = [];
    for (const url of packagePageUrls) {
      try {
        const response = await fetch(url, { headers: { "User-Agent": "jungle-grid-outreach-agent/1.0" } });
        if (!response.ok) continue;
        const text = (await response.text()).slice(0, 120_000);
        contacts.push(...extractPublicEmails(text, url, "package_page"));
      } catch {
        continue;
      }
    }
    return contacts;
  }

  private async searchPackageRegistryProjects(
    pack: QueryPack,
    remaining: number,
    seenProjects: Set<string>,
  ): Promise<Array<{ owner: string; repo: string }>> {
    const found: Array<{ owner: string; repo: string }> = [];
    const seen = new Set<string>();

    for (const term of pack.registryTerms) {
      if (found.length >= remaining) break;
      const urls = [
        ...(await this.searchNpmRegistry(term)),
        ...(await this.searchCratesRegistry(term)),
      ];
      for (const url of urls) {
        if (found.length >= remaining) break;
        const project = this.parseGitHubRepo(url);
        if (!project) continue;
        const key = `${project.owner}/${project.repo}`.toLowerCase();
        if (seen.has(key) || seenProjects.has(key)) continue;
        seen.add(key);
        seenProjects.add(key);
        found.push(project);
      }
    }

    return found;
  }

  private async searchNpmRegistry(term: string): Promise<string[]> {
    const response = await this.fetchRegistryJson(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(term)}&size=8`,
    );
    const objects = this.asRecord(response)?.objects;
    return Array.isArray(objects)
      ? objects
          .flatMap((entry: { package?: { links?: Record<string, string | undefined> } }) =>
            Object.values(entry.package?.links ?? {}).filter((value): value is string => Boolean(value)),
          )
      : [];
  }

  private async searchCratesRegistry(term: string): Promise<string[]> {
    const response = await this.fetchRegistryJson(
      `https://crates.io/api/v1/crates?page=1&per_page=8&q=${encodeURIComponent(term)}`,
    );
    const crates = this.asRecord(response)?.crates;
    return Array.isArray(crates)
      ? crates.flatMap((entry: Record<string, string | null>) =>
          [entry.repository, entry.homepage, entry.documentation].filter((value): value is string => Boolean(value)),
        )
      : [];
  }

  private parseGitHubRepo(value: string): { owner: string; repo: string } | null {
    const normalized = value.trim().replace(/^git\+/, "").replace(/\.git$/i, "");
    const match = normalized.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  private toAccountSearchQuery(query: string): string {
    return query.replace(/ in:[^ ]+/g, "").replace(/\bstars:\>[0-9]+\b/g, "").replace(/\s+/g, " ").trim();
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  }

  private async getRawFile(
    owner: string,
    repo: string,
    branch: string,
    filePath: string,
  ): Promise<string | null> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    try {
      const response = await fetch(url, { headers: { "User-Agent": "jungle-grid-outreach-agent/1.0" } });
      if (!response.ok) return null;
      return (await response.text()).slice(0, 120_000);
    } catch {
      return null;
    }
  }

  private async fetchRegistryJson(url: string): Promise<unknown> {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "jungle-grid-outreach-agent/1.0" } });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
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
