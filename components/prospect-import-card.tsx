"use client";

import { useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

type PreviewRow = {
  rowNumber: number;
  row: {
    name: string;
    project: string;
    email?: string;
    company?: string;
    category?: string;
  } | null;
  errors: string[];
};

type PreviewResult = {
  format: "csv" | "json";
  rows: PreviewRow[];
  validRows: number;
  invalidRows: number;
  imported?: number;
  skipped?: number;
};

export function ProspectImportCard() {
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [content, setContent] = useState(
    "name,email,company,project,category,websiteUrl\nJane Maintainer,jane@example.com,Acme,Acme Platform,saas,https://acme.example",
  );
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function previewImport() {
    const response = await fetch("/api/prospects/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, content, dryRun: true }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Preview failed.");
      return;
    }
    setPreview(payload);
    setMessage(null);
  }

  async function importRows() {
    const response = await fetch("/api/prospects/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, content, dryRun: false }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Import failed.");
      return;
    }
    setPreview(payload);
    setMessage(`Imported ${payload.imported} rows. Skipped ${payload.skipped}. Refresh the page to see newly added prospects.`);
  }

  async function loadFile(file: File) {
    const text = await file.text();
    setContent(text);
    setFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Import seed prospects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload CSV or JSON seed rows, preview validation results, then import them into the self-hosted instance.
          </p>
        </div>
        <Badge>{format.toUpperCase()}</Badge>
      </div>
      <div className="mt-4 grid gap-4">
        <Field label="Format">
          <select
            className="h-9 rounded-md border bg-black/20 px-3 text-sm"
            value={format}
            onChange={(event) => setFormat(event.target.value as "csv" | "json")}
          >
            <option value="csv">CSV</option>
            <option value="json">JSON array</option>
          </select>
        </Field>
        <Field label="Upload file">
          <input
            type="file"
            accept=".csv,.json,application/json,text/csv"
            className="block text-sm text-muted-foreground"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }}
          />
        </Field>
        <Field label="Seed content">
          <Textarea
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="font-mono text-xs"
          />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={previewImport}>
            <FileUp className="h-4 w-4" /> Preview import
          </Button>
          <Button onClick={importRows}>
            <Upload className="h-4 w-4" /> Import valid rows
          </Button>
        </div>
      </div>
      {message ? <p className="mt-4 rounded-md border bg-black/20 px-3 py-2 text-sm">{message}</p> : null}
      {preview ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{preview.validRows} valid</Badge>
            <Badge tone={preview.invalidRows > 0 ? "red" : "neutral"}>{preview.invalidRows} invalid</Badge>
            {typeof preview.imported === "number" ? <Badge>{preview.imported} imported</Badge> : null}
          </div>
          <div className="max-h-80 space-y-2 overflow-auto">
            {preview.rows.slice(0, 12).map((row) => (
              <div key={row.rowNumber} className="rounded-md border bg-black/20 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Row {row.rowNumber}</span>
                  <Badge tone={row.errors.length === 0 ? "green" : "red"}>
                    {row.errors.length === 0 ? "Ready" : "Error"}
                  </Badge>
                </div>
                {row.row ? (
                  <p className="mt-1 text-muted-foreground">
                    {row.row.name} · {row.row.project} · {row.row.email ?? row.row.company ?? "no direct email"}
                  </p>
                ) : null}
                {row.errors.length > 0 ? (
                  <ul className="mt-2 list-disc pl-4 text-red-300">
                    {row.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
