import { z } from "zod";

const emailSchema = z.string().email();
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const publicContext =
  /\b(contact|business|partnerships?|inquiries|reach(?:\s+us)?|email|support|hello)\b/i;
const rejectedLocalParts = /^(noreply|no-reply|donotreply|do-not-reply|example|test|admin)$/i;
const rejectedDomains = new Set([
  "example.com",
  "example.org",
  "example.net",
  "email.com",
  "domain.com",
  "users.noreply.github.com",
]);

export type PublicEmailEvidence = {
  email: string;
  sourceUrl: string;
  sourceType:
    | "github_profile"
    | "repository_readme"
    | "official_website"
    | "project_docs"
    | "package_page";
  context: string;
};

function normalizeEmail(value: string): string {
  return value.trim().replace(/[),.;:]+$/, "").toLowerCase();
}

function isRejected(email: string): boolean {
  const [local, domain] = email.split("@");
  return (
    !local ||
    !domain ||
    rejectedLocalParts.test(local) ||
    rejectedDomains.has(domain) ||
    domain.endsWith(".local") ||
    local.includes("yourname") ||
    email.includes("placeholder")
  );
}

export function validateProfileEmail(
  email: string | null | undefined,
  sourceUrl: string,
): PublicEmailEvidence | null {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  if (!emailSchema.safeParse(normalized).success || isRejected(normalized)) return null;
  return {
    email: normalized,
    sourceUrl,
    sourceType: "github_profile",
    context: "Public email field on the professional GitHub profile.",
  };
}

export function extractPublicEmails(
  text: string,
  sourceUrl: string,
  sourceType: "repository_readme" | "official_website" | "project_docs" | "package_page",
): PublicEmailEvidence[] {
  const matches = [...text.matchAll(emailPattern)];
  const seen = new Set<string>();
  const results: PublicEmailEvidence[] = [];

  for (const match of matches) {
    const normalized = normalizeEmail(match[0]);
    if (seen.has(normalized) || isRejected(normalized)) continue;
    if (!emailSchema.safeParse(normalized).success) continue;

    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 100), Math.min(text.length, index + 140));
    if (!publicContext.test(context)) continue;

    seen.add(normalized);
    results.push({ email: normalized, sourceUrl, sourceType, context: context.trim() });
  }

  return results;
}
