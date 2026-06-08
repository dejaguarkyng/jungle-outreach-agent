"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Ban, Save, Send, ShieldCheck, X } from "lucide-react";
import { ALLOWED_OUTREACH_LINKS, MAX_DRAFT_WORDS, MIN_DRAFT_WORDS } from "@/packages/shared/src";
import type { EmailDraft, Prospect } from "@/src/domain/schemas";
import { editableDraftSchema, extractLinks, countWords } from "@/src/safety/email-validation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { formatDate } from "@/src/lib/utils";
import type { z } from "zod";

type DraftRow = EmailDraft & { prospect: Prospect };
type DraftForm = z.infer<typeof editableDraftSchema>;

function validLinkCount(links: string[]): boolean {
  return (
    links.length >= 1 &&
    links.length <= ALLOWED_OUTREACH_LINKS.length &&
    links.every((link) => ALLOWED_OUTREACH_LINKS.includes(link as (typeof ALLOWED_OUTREACH_LINKS)[number]))
  );
}

export function DraftWorkspace({ initialDrafts }: { initialDrafts: DraftRow[] }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState(initialDrafts[0]?.id ?? null);
  const [bulkPhrase, setBulkPhrase] = useState("");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const selected = drafts.find((draft) => draft.id === selectedId) ?? null;
  const approvedCount = drafts.filter(
    (draft) =>
      draft.approvalStatus === "approved" &&
      (draft.deliveryStatus === "not_sent" || draft.deliveryStatus === "failed"),
  ).length;

  async function bulkSendApproved() {
    setBulkMessage(null);
    const response = await fetch("/api/drafts/bulk-send-approved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationPhrase: bulkPhrase }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setBulkMessage(payload.error ?? "Bulk send failed.");
      return;
    }
    const updated = new Map(
      payload.results
        ?.filter((row: { ok: boolean; draft?: EmailDraft }) => row.ok && row.draft)
        .map((row: { draft: EmailDraft }) => [row.draft.id, row.draft]),
    );
    setDrafts((current) =>
      current.map((draft) => (updated.has(draft.id) ? { ...draft, ...updated.get(draft.id)! } : draft)),
    );
    setBulkMessage(`Bulk send completed: ${payload.results?.filter((row: { ok: boolean }) => row.ok).length ?? 0} sent.`);
    setBulkPhrase("");
  }

  return (
    <div className="grid min-h-[calc(100vh-130px)] gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-lg border">
        <div className="border-b px-4 py-3">
          <p className="text-xs uppercase text-muted-foreground">{drafts.length} validated drafts</p>
          <div className="mt-3 flex gap-2">
            <Input
              value={bulkPhrase}
              onChange={(event) => setBulkPhrase(event.target.value)}
              placeholder="SEND APPROVED DRAFTS"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={bulkPhrase !== "SEND APPROVED DRAFTS" || approvedCount === 0}
              onClick={bulkSendApproved}
            >
              Bulk send
            </Button>
          </div>
          {bulkMessage ? <p className="mt-2 text-xs text-muted-foreground">{bulkMessage}</p> : null}
        </div>
        <div className="max-h-[calc(100vh-190px)] overflow-y-auto">
          {drafts.map((draft) => (
            <button
              key={draft.id}
              onClick={() => setSelectedId(draft.id)}
              className={`block w-full border-b px-4 py-4 text-left hover:bg-white/[0.025] ${
                selectedId === draft.id ? "bg-white/[0.04]" : "bg-card"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{draft.prospect.name}</p>
                <Badge tone={draft.deliveryStatus === "sent" ? "green" : draft.deliveryStatus === "failed" ? "red" : "neutral"}>
                  {draft.deliveryStatus}
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{draft.subject}</p>
              <div className="mt-3 flex gap-3 font-mono text-[11px] text-muted-foreground">
                <span>{draft.wordCount} words</span>
                <span>{draft.links.length} links</span>
                <span>{draft.approvalStatus}</span>
                <span>{formatDate(draft.createdAt)}</span>
              </div>
            </button>
          ))}
          {drafts.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No drafts yet. Approve researched prospects, then run the draft stage.
            </p>
          ) : null}
        </div>
      </div>
      {selected ? (
        <DraftEditor
          key={selected.id}
          draft={selected}
          onUpdate={(next) =>
            setDrafts((current) =>
              current.map((draft) => (draft.id === next.id ? { ...draft, ...next } : draft)),
            )
          }
        />
      ) : (
        <div className="grid place-items-center rounded-lg border text-sm text-muted-foreground">
          Select a draft to review.
        </div>
      )}
    </div>
  );
}

function DraftEditor({
  draft,
  onUpdate,
}: {
  draft: DraftRow;
  onUpdate: (draft: EmailDraft) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = draft.approvalStatus === "pending_review" || draft.deliveryStatus === "failed";
  const form = useForm<DraftForm>({
    resolver: zodResolver(editableDraftSchema),
    defaultValues: { subject: draft.subject, body: draft.body },
    mode: "onChange",
  });
  const body = form.watch("body");
  const wordCount = useMemo(() => countWords(body), [body]);
  const links = useMemo(() => extractLinks(body), [body]);

  async function save() {
    const values = await form.trigger().then((valid) => (valid ? form.getValues() : null));
    if (!values) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Draft update failed.");
      onUpdate(payload);
      setMessage("Local draft saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function draftAction(action: "approve" | "reject" | "send") {
    setBusy(true);
    try {
      const response = await fetch(`/api/drafts/${draft.id}/${action}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Draft ${action} failed.`);
      onUpdate(payload);
      setMessage(
        action === "approve"
          ? "Draft approved. It can now be sent manually."
          : action === "reject"
            ? "Draft rejected."
            : "Approved draft sent through ZeptoMail.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Draft ${action} failed.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="font-semibold">{draft.prospect.name}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{draft.prospect.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Source: <a href={draft.prospect.emailSourceUrl} target="_blank" rel="noreferrer" className="underline">{draft.prospect.emailSourceUrl}</a>
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={wordCount >= MIN_DRAFT_WORDS && wordCount <= MAX_DRAFT_WORDS ? "green" : "red"}>
            {wordCount} words
          </Badge>
          <Badge tone={validLinkCount(links) ? "green" : "red"}>{links.length} links</Badge>
          <Badge tone={draft.approvalStatus === "approved" ? "green" : draft.approvalStatus === "rejected" ? "red" : "amber"}>
            {draft.approvalStatus}
          </Badge>
          <Badge tone={draft.deliveryStatus === "sent" ? "green" : draft.deliveryStatus === "failed" ? "red" : "neutral"}>
            {draft.deliveryStatus}
          </Badge>
        </div>
      </div>
      <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(() => save())}>
        <Field label="Subject" error={form.formState.errors.subject?.message}>
          <Input disabled={!editable} {...form.register("subject")} />
        </Field>
        <Field label="Body" error={form.formState.errors.body?.message}>
          <Textarea disabled={!editable} className="min-h-[300px] font-mono leading-6" {...form.register("body")} />
        </Field>
        <div className="rounded-md border bg-black/20 p-3 text-sm">
          <p className="font-medium">Evidence before sending</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {draft.evidenceUrls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  {url}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Claims: {draft.personalizationClaims.join("; ")}
          </p>
        </div>
        {message ? <p className="rounded-md border bg-black/20 px-3 py-2 text-sm">{message}</p> : null}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button type="submit" variant="secondary" disabled={busy || !editable}>
            <Save className="h-4 w-4" /> Save local changes
          </Button>
          <Button
            type="button"
            disabled={busy || !form.formState.isValid || draft.approvalStatus !== "pending_review"}
            onClick={() => draftAction("approve")}
          >
            <ShieldCheck className="h-4 w-4" /> Approve
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || draft.approvalStatus === "rejected" || draft.deliveryStatus === "sent"}
            onClick={() => draftAction("reject")}
          >
            <X className="h-4 w-4" /> Reject
          </Button>
          <Button
            type="button"
            disabled={busy || draft.approvalStatus !== "approved" || draft.deliveryStatus === "sent"}
            onClick={() => draftAction("send")}
          >
            <Send className="h-4 w-4" /> Send approved
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              await fetch("/api/suppressions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: draft.prospect.email,
                  reason: "Blocked from drafts workspace.",
                  source: "dashboard",
                }),
              });
              setMessage("Contact suppressed.");
            }}
          >
            <Ban className="h-4 w-4" /> Block contact
          </Button>
        </div>
      </form>
    </Card>
  );
}
