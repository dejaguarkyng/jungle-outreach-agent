"use client";

import { useState } from "react";
import { AlertTriangle, Ban, Check, ExternalLink, Save, X } from "lucide-react";
import type { Prospect, ResearchNote } from "@/src/domain/schemas";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ReviewItem = { prospect: Prospect; research: ResearchNote | null };

export function ResearchReview({ initialItems }: { initialItems: ReviewItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function setStatus(id: string, status: Prospect["status"]) {
    setBusy(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/prospects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Update failed.");
      setItems((current) =>
        current.map((item) => (item.prospect.id === id ? { ...item, prospect: payload.prospect } : item)),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function block(id: string) {
    setBusy(id);
    try {
      const response = await fetch(`/api/prospects/${id}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Blocked during operator research review." }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Block failed.");
      setItems((current) =>
        current.map((item) => (item.prospect.id === id ? { ...item, prospect: payload.prospect } : item)),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Block failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveResearch(item: ReviewItem, detail: string, relevance: string) {
    if (!item.research) return;
    setBusy(item.prospect.id);
    try {
      const response = await fetch(`/api/prospects/${item.prospect.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          research: {
            ...item.research,
            personalizationDetail: detail,
            junglegridRelevance: relevance,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Save failed.");
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.prospect.id === item.prospect.id
            ? { prospect: payload.prospect, research: payload.research }
            : currentItem,
        ),
      );
      setMessage("Research note saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-md border bg-card px-4 py-3 text-sm">{message}</p> : null}
      {items.length === 0 ? (
        <div className="rounded-lg border px-5 py-16 text-center text-sm text-muted-foreground">
          No researched prospects are waiting for review.
        </div>
      ) : null}
      {items.map((item) => (
        <ResearchRow
          key={item.prospect.id}
          item={item}
          busy={busy === item.prospect.id}
          onStatus={setStatus}
          onBlock={block}
          onSave={saveResearch}
        />
      ))}
    </div>
  );
}

function ResearchRow({
  item,
  busy,
  onStatus,
  onBlock,
  onSave,
}: {
  item: ReviewItem;
  busy: boolean;
  onStatus: (id: string, status: Prospect["status"]) => Promise<void>;
  onBlock: (id: string) => Promise<void>;
  onSave: (item: ReviewItem, detail: string, relevance: string) => Promise<void>;
}) {
  const [detail, setDetail] = useState(item.research?.personalizationDetail ?? "");
  const [relevance, setRelevance] = useState(item.research?.junglegridRelevance ?? "");
  const evidenceReady = Boolean(
    item.prospect.emailSourceUrl && item.research?.evidenceUrls.length && detail.trim(),
  );
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{item.prospect.name}</h2>
            <Badge>{item.prospect.fitScore ?? "unscored"}</Badge>
            <Badge tone={evidenceReady ? "green" : "amber"}>
              {evidenceReady ? "Evidence ready" : "Weak evidence"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.prospect.project} · {item.prospect.email}
          </p>
        </div>
        <Badge>{item.prospect.status.replaceAll("_", " ")}</Badge>
      </div>

      {!evidenceReady ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          Drafting remains blocked until public email and personalization evidence are present.
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs uppercase text-muted-foreground">Personalization detail</p>
          <Textarea value={detail} onChange={(event) => setDetail(event.target.value)} />
        </div>
        <div>
          <p className="mb-2 text-xs uppercase text-muted-foreground">Why Jungle Grid is relevant</p>
          <Textarea value={relevance} onChange={(event) => setRelevance(event.target.value)} />
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{item.research?.summary}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={item.prospect.emailSourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-green-300"
        >
          Public email source <ExternalLink className="h-3 w-3" />
        </a>
        {item.research?.evidenceUrls.map((url, index) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-green-300">
            Evidence {index + 1} <ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
        <Button variant="secondary" size="sm" disabled={busy || !item.research} onClick={() => onSave(item, detail, relevance)}>
          <Save className="h-3.5 w-3.5" /> Save notes
        </Button>
        <Button size="sm" disabled={busy || !evidenceReady} onClick={() => onStatus(item.prospect.id, "approved")}>
          <Check className="h-3.5 w-3.5" /> Approve
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => onStatus(item.prospect.id, "rejected")}>
          <X className="h-3.5 w-3.5" /> Reject
        </Button>
        <Button variant="destructive" size="sm" disabled={busy} onClick={() => onBlock(item.prospect.id)}>
          <Ban className="h-3.5 w-3.5" /> Block
        </Button>
      </div>
    </Card>
  );
}
