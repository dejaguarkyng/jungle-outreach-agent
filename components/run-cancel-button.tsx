"use client";

import { useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunCancelButton({ runId }: { runId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Cancellation failed.");
      setPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div>
      <Button variant="secondary" disabled={pending} onClick={cancel}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
        Cancel job
      </Button>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
