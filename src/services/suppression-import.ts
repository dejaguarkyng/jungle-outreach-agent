import { OutreachRepository } from "@/src/db/repository";

type ImportFormat = "csv" | "json";

type SuppressionRow = {
  email?: string;
  domain?: string;
  reason: string;
  source?: string;
};

type PreviewRow = {
  rowNumber: number;
  row: SuppressionRow | null;
  errors: string[];
};

export type SuppressionImportPreview = {
  format: ImportFormat;
  rows: PreviewRow[];
  validRows: number;
  invalidRows: number;
};

export function previewSuppressionImport(
  format: ImportFormat,
  content: string,
): SuppressionImportPreview {
  const rawRows = format === "json" ? parseJsonRows(content) : parseCsvRows(content);
  const rows = rawRows.map((row, index) => validateRow(row, index + 1));
  return {
    format,
    rows,
    validRows: rows.filter((row) => row.row && row.errors.length === 0).length,
    invalidRows: rows.filter((row) => row.errors.length > 0).length,
  };
}

export function importSuppressionsFromContent(
  repository: OutreachRepository,
  format: ImportFormat,
  content: string,
): SuppressionImportPreview & { imported: number; skipped: number } {
  const preview = previewSuppressionImport(format, content);
  let imported = 0;
  let skipped = 0;
  for (const item of preview.rows) {
    if (!item.row || item.errors.length > 0) {
      skipped += 1;
      continue;
    }
    repository.addSuppression(item.row);
    imported += 1;
  }
  return { ...preview, imported, skipped };
}

function validateRow(raw: Record<string, unknown>, rowNumber: number): PreviewRow {
  const email = stringValue(raw.email);
  const domain = stringValue(raw.domain);
  const reason = stringValue(raw.reason);
  const source = stringValue(raw.source) || "operator_import";
  const errors: string[] = [];

  if (!email && !domain) errors.push("Either email or domain is required.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Invalid email format.");
  }
  if (!reason) errors.push("Reason is required.");

  return {
    rowNumber,
    row:
      errors.length > 0
        ? null
        : {
            email: email || undefined,
            domain: domain.replace(/^@/, "").toLowerCase() || undefined,
            reason,
            source,
          },
    errors,
  };
}

function parseJsonRows(content: string): Record<string, unknown>[] {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON import must be an array of suppression objects.");
  }
  return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
}

function parseCsvRows(content: string): Record<string, unknown>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line: string): string[] {
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
