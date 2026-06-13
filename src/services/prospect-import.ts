import {
  prospectCategorySchema,
  type ProspectCategory,
} from "@/src/domain/schemas";
import { OutreachRepository } from "@/src/db/repository";

type ImportFormat = "csv" | "json";

type ProspectImportRow = {
  name: string;
  email?: string;
  company?: string;
  project: string;
  projectKey?: string;
  projectDescription?: string;
  websiteUrl?: string;
  githubUrl?: string;
  githubUsername?: string;
  emailSourceUrl?: string;
  emailSourceType?: "github_profile" | "repository_readme" | "official_website" | "project_docs" | "package_page";
  category?: ProspectCategory;
  confidenceScore?: number;
};

type PreviewRow = {
  rowNumber: number;
  row: ProspectImportRow | null;
  errors: string[];
};

export type ProspectImportPreview = {
  format: ImportFormat;
  rows: PreviewRow[];
  validRows: number;
  invalidRows: number;
};

const allowedEmailSources = new Set([
  "github_profile",
  "repository_readme",
  "official_website",
  "project_docs",
  "package_page",
]);

export function previewProspectImport(
  format: ImportFormat,
  content: string,
): ProspectImportPreview {
  const rawRows = format === "json" ? parseJsonRows(content) : parseCsvRows(content);
  const rows = rawRows.map((row, index) => validateImportRow(row, index + 1));
  return {
    format,
    rows,
    validRows: rows.filter((row) => row.errors.length === 0 && row.row).length,
    invalidRows: rows.filter((row) => row.errors.length > 0).length,
  };
}

export function importProspectsFromContent(
  repository: OutreachRepository,
  format: ImportFormat,
  content: string,
): ProspectImportPreview & { imported: number; skipped: number } {
  const preview = previewProspectImport(format, content);
  let imported = 0;
  let skipped = 0;
  for (const item of preview.rows) {
    if (item.errors.length > 0 || !item.row) {
      skipped += 1;
      continue;
    }
    repository.upsertProspect({
      name: item.row.name,
      email: item.row.email,
      emailSourceUrl: item.row.emailSourceUrl ?? item.row.websiteUrl ?? item.row.githubUrl ?? "",
      emailSourceType: item.row.emailSourceType ?? "official_website",
      githubUsername: item.row.githubUsername ?? null,
      githubUrl: item.row.githubUrl ?? null,
      websiteUrl: item.row.websiteUrl ?? null,
      company: item.row.company ?? null,
      project: item.row.project,
      projectKey: item.row.projectKey ?? normalizeProjectKey(item.row.project),
      projectDescription: item.row.projectDescription ?? null,
      category: item.row.category ?? "other",
      confidenceScore: item.row.confidenceScore ?? null,
    });
    imported += 1;
  }
  return { ...preview, imported, skipped };
}

function validateImportRow(
  raw: Record<string, unknown>,
  rowNumber: number,
): PreviewRow {
  const name = stringValue(raw.name);
  const project = stringValue(raw.project || raw.business || raw.repository);
  const email = stringValue(raw.email);
  const websiteUrl = stringValue(raw.websiteUrl || raw.website || raw.domain);
  const githubUrl = stringValue(raw.githubUrl || raw.github);
  const emailSourceUrl = stringValue(raw.emailSourceUrl || raw.sourceUrl || websiteUrl || githubUrl);
  const categoryRaw = stringValue(raw.category);
  const emailSourceType = stringValue(raw.emailSourceType || raw.sourceType) || "official_website";
  const errors: string[] = [];

  if (!name) errors.push("Missing name.");
  if (!project) errors.push("Missing project or business.");
  if (!email && !websiteUrl && !githubUrl) {
    errors.push("At least one of email, websiteUrl, or githubUrl is required.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Invalid email format.");
  }
  if (websiteUrl && !looksLikeUrl(websiteUrl)) {
    errors.push("Invalid website URL.");
  }
  if (githubUrl && !looksLikeUrl(githubUrl)) {
    errors.push("Invalid GitHub URL.");
  }
  if (emailSourceUrl && !looksLikeUrl(emailSourceUrl)) {
    errors.push("Invalid source URL.");
  }
  let category: ProspectCategory | undefined;
  if (categoryRaw) {
    const parsed = prospectCategorySchema.safeParse(categoryRaw);
    if (!parsed.success) {
      errors.push(`Unsupported category "${categoryRaw}".`);
    } else {
      category = parsed.data;
    }
  }
  if (!allowedEmailSources.has(emailSourceType)) {
    errors.push(`Unsupported emailSourceType "${emailSourceType}".`);
  }

  const row: ProspectImportRow | null =
    errors.length > 0
      ? null
      : {
          name,
          email: email || undefined,
          company: stringValue(raw.company) || undefined,
          project,
          projectKey: stringValue(raw.projectKey) || normalizeProjectKey(project),
          projectDescription: stringValue(raw.projectDescription || raw.notes) || undefined,
          websiteUrl: normalizeUrl(websiteUrl),
          githubUrl: normalizeUrl(githubUrl),
          githubUsername: stringValue(raw.githubUsername) || githubUsernameFromUrl(githubUrl),
          emailSourceUrl: normalizeUrl(emailSourceUrl),
          emailSourceType: emailSourceType as ProspectImportRow["emailSourceType"],
          category: category ?? "other",
          confidenceScore: numberValue(raw.confidenceScore),
        };

  return { rowNumber, row, errors };
}

function parseJsonRows(content: string): Record<string, unknown>[] {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON import must be an array of prospect objects.");
  }
  return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
}

function parseCsvRows(content: string): Record<string, unknown>[] {
  const lines = splitCsvLines(content).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLines(content: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"') {
      if (inQuotes && content[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) lines.push(current);
  return lines;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function normalizeProjectKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(normalizeUrl(value) ?? "");
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}

function githubUsernameFromUrl(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(normalizeUrl(value) ?? "");
    if (!url.hostname.includes("github.com")) return undefined;
    return url.pathname.split("/").filter(Boolean)[0] || undefined;
  } catch {
    return undefined;
  }
}
