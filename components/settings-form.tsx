"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, KeyRound, Plus, Save, Trash2 } from "lucide-react";
import type { z } from "zod";
import { settingsSchema, type OutreachSettings } from "@/src/domain/schemas";
import type { ZeptoMailConfigStatus } from "@/apps/api/src/services/zeptomail";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type SettingsValues = z.infer<typeof settingsSchema>;
type Blocked = { id: string; email?: string | null; domain?: string | null; reason: string; created_at: string };

export function SettingsForm({
  initialSettings,
  secrets,
  zeptomail,
  jungleGridApiBase,
  initialBlocked,
}: {
  initialSettings: OutreachSettings;
  secrets: Record<string, boolean>;
  zeptomail: ZeptoMailConfigStatus;
  jungleGridApiBase: string;
  initialBlocked: Blocked[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [blockValue, setBlockValue] = useState("");
  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: initialSettings,
  });

  async function save(values: SettingsValues) {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Settings saved." : payload.error ?? "Settings could not be saved.");
  }

  async function testZeptoMail() {
    const response = await fetch("/api/zeptomail/test", { method: "POST" });
    const payload = await response.json();
    setMessage(payload.message ?? payload.error ?? "ZeptoMail test completed.");
  }

  async function addBlock() {
    const isEmail = blockValue.includes("@");
    const response = await fetch("/api/blocklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [isEmail ? "email" : "domain"]: blockValue,
        reason: "Added from settings.",
      }),
    });
    const payload = await response.json();
    if (response.ok) {
      setBlocked(payload);
      setBlockValue("");
    } else {
      setMessage(payload.error ?? "Blocklist update failed.");
    }
  }

  async function removeBlock(id: string) {
    const response = await fetch(`/api/blocklist?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setBlocked(await response.json());
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="p-5">
        <h2 className="font-semibold">Safety and workflow</h2>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(save)}>
          <Field label="Daily draft cap" error={form.formState.errors.dailyTarget?.message}>
            <Input type="number" {...form.register("dailyTarget")} />
          </Field>
          <Field label="Fit score threshold" error={form.formState.errors.fitScoreThreshold?.message}>
            <Input type="number" {...form.register("fitScoreThreshold")} />
          </Field>
          <Field label="Per-domain daily cap" error={form.formState.errors.perDomainCap?.message}>
            <Input type="number" {...form.register("perDomainCap")} />
          </Field>
          <Field label="Execution mode" error={form.formState.errors.mode?.message}>
            <select className="h-9 rounded-md border bg-black/20 px-3 text-sm" {...form.register("mode")}>
              <option value="local-template">Local template</option>
              <option value="junglegrid-template">Jungle Grid template</option>
              <option value="junglegrid-qwen">Jungle Grid Qwen</option>
            </select>
          </Field>
          <Field label="Ollama model" error={form.formState.errors.modelName?.message}>
            <Input {...form.register("modelName")} />
          </Field>
          <Field label="Worker image" error={form.formState.errors.workerImage?.message}>
            <Input {...form.register("workerImage")} />
          </Field>
          <Field label="Jungle Grid site" error={form.formState.errors.junglegridSite?.message}>
            <Input readOnly {...form.register("junglegridSite")} />
          </Field>
          <label className="flex items-center gap-3 rounded-md border bg-black/20 px-3 py-2 text-sm">
            <input type="checkbox" className="accent-green-500" {...form.register("dryRun")} />
            Dry-run mode
          </label>
          <div className="sm:col-span-2">
            <Button type="submit"><Save className="h-4 w-4" /> Save settings</Button>
          </div>
        </form>
        {message ? <p className="mt-4 rounded-md border bg-black/20 px-3 py-2 text-sm">{message}</p> : null}
      </Card>

      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="font-semibold">Provider readiness</h2>
          <div className="mt-4 space-y-3">
            <Provider name="ZeptoMail API key" ready={secrets.zeptoMailApiKey} />
            <Provider name={`ZeptoMail API base · ${zeptomail.apiBase ?? "not set"}`} ready={secrets.zeptoMailApiBase} />
            <Provider name={`ZeptoMail from · ${zeptomail.fromEmail}`} ready={zeptomail.configured} />
            <Provider name={`ZeptoMail reply-to · ${zeptomail.replyTo}`} ready={zeptomail.configured} />
            <Provider name={`Email send mode · ${zeptomail.sendMode}`} ready={zeptomail.sendEnabled} />
            <Provider name={`Jungle Grid API · ${jungleGridApiBase}`} ready={secrets.jungleGridApiKey} />
            <Provider name="GitHub API token" ready={secrets.githubToken} />
          </div>
          <p className="mt-4 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {zeptomail.complianceWarning}
          </p>
          <div className="mt-5 flex gap-2">
            <Input
              type="email"
              readOnly
              value={zeptomail.testRecipient ?? ""}
              placeholder="Set ZEPTOMAIL_TEST_RECIPIENT"
            />
            <Button variant="secondary" onClick={testZeptoMail}>
              <KeyRound className="h-4 w-4" /> Send test
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Blocklist</h2>
          <div className="mt-4 flex gap-2">
            <Input value={blockValue} onChange={(event) => setBlockValue(event.target.value)} placeholder="email@example.com or example.com" />
            <Button variant="secondary" disabled={!blockValue.trim()} onClick={addBlock}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          <div className="mt-4 divide-y">
            {blocked.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-mono text-xs">{entry.email ?? entry.domain}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.reason}</p>
                </div>
                <Button size="icon" variant="ghost" title="Remove blocklist entry" onClick={() => removeBlock(entry.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {blocked.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Blocklist is empty.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Provider({ name, ready }: { name: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-black/20 px-3 py-2 text-sm">
      <span>{name}</span>
      <Badge tone={ready ? "green" : "amber"}>
        {ready ? <Check className="mr-1 h-3 w-3" /> : null}
        {ready ? "Configured" : "Missing"}
      </Badge>
    </div>
  );
}
