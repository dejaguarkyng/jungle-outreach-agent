"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MessageApproveButton({ messageId }: { messageId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/messages/${messageId}/approve`, {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Approval failed.");
      setPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div>
      <Button size="sm" disabled={pending} onClick={approve}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Approve and send
      </Button>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
