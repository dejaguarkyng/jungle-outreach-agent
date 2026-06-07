"use client";

import { useState } from "react";
import { Download, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunArtifactActions({ runId }: { runId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function download() {
    setMessage(null);
    const response = await fetch(`/api/runs/${runId}/download-artifacts`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.error ?? "Artifact download failed.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jungle-outreach-${runId}-artifacts.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/api/runs/${runId}/logs`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"
      >
        <ScrollText className="h-4 w-4" /> Logs
      </a>
      <Button type="button" variant="secondary" onClick={download}>
        <Download className="h-4 w-4" /> Download validated artifacts
      </Button>
      {message ? <span className="text-sm text-red-300">{message}</span> : null}
    </div>
  );
}
