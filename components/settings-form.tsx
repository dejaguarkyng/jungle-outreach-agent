"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, KeyRound, Plus, Save, Shield, Trash2 } from "lucide-react";
import type { z } from "zod";
import {
  settingsSchema,
  type DeliveryAdapterStatus,
  type OutreachSettings,
  type ProviderAuthorization,
} from "@/src/domain/schemas";
import type { ZeptoMailConfigStatus } from "@/apps/api/src/services/zeptomail";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type SettingsValues = z.infer<typeof settingsSchema>;
type Blocked = { id: string; email?: string | null; domain?: string | null; reason: string; created_at: string };

function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function SettingsForm({
  initialSettings,
  deliveryAdapters,
  providerAuthorizations,
  browserSessionStatus,
  secrets,
  zeptomail,
  jungleGridApiBase,
  initialBlocked,
}: {
  initialSettings: OutreachSettings;
  deliveryAdapters: DeliveryAdapterStatus[];
  providerAuthorizations: ProviderAuthorization[];
  browserSessionStatus: {
    workspaceId: string;
    provider: string;
    configured: boolean;
    expiresAt: string | null;
  };
  secrets: Record<string, boolean>;
  zeptomail: ZeptoMailConfigStatus;
  jungleGridApiBase: string;
  initialBlocked: Blocked[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [authorizations, setAuthorizations] = useState(providerAuthorizations);
  const [browserSession, setBrowserSession] = useState(browserSessionStatus);
  const [blockValue, setBlockValue] = useState("");
  const [authorizationProvider, setAuthorizationProvider] = useState("browser");
  const [authorizationPattern, setAuthorizationPattern] = useState("");
  const [authorizationPermissions, setAuthorizationPermissions] = useState(
    "submit_form,capture_screenshot",
  );
  const [authorizationExpiry, setAuthorizationExpiry] = useState("");
  const [browserState, setBrowserState] = useState('{"cookies":[],"origins":[]}');
  const [browserExpiry, setBrowserExpiry] = useState("");
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

  async function addAuthorization() {
    const response = await fetch("/api/delivery/authorizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "default",
        provider: authorizationProvider,
        destinationPattern: authorizationPattern,
        permissions: authorizationPermissions
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        expiresAt: toIsoOrNull(authorizationExpiry),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Authorization could not be saved.");
      return;
    }
    setAuthorizations([payload, ...authorizations.filter((item) => item.id !== payload.id)]);
    setAuthorizationPattern("");
    setAuthorizationExpiry("");
  }

  async function revokeAuthorization(id: string) {
    const response = await fetch(
      `/api/delivery/authorizations?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (response.ok) {
      setAuthorizations(
        authorizations.map((item) =>
          item.id === id ? { ...item, status: "revoked" } : item,
        ),
      );
    }
  }

  async function saveBrowserSession() {
    let storageState: { cookies: Record<string, unknown>[]; origins: Record<string, unknown>[] };
    try {
      storageState = JSON.parse(browserState) as {
        cookies: Record<string, unknown>[];
        origins: Record<string, unknown>[];
      };
    } catch {
      setMessage("Browser storage state must be valid JSON.");
      return;
    }
    const response = await fetch("/api/delivery/browser-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "default",
        provider: "browser",
        storageState,
        expiresAt: toIsoOrNull(browserExpiry),
      }),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Browser session stored." : payload.error ?? "Browser session could not be saved.");
    if (response.ok) {
      setBrowserSession(payload);
      setBrowserExpiry("");
    }
  }

  async function revokeBrowserSession() {
    const response = await fetch("/api/delivery/browser-sessions?workspaceId=default&provider=browser", {
      method: "DELETE",
    });
    if (response.ok) {
      setBrowserSession({
        workspaceId: "default",
        provider: "browser",
        configured: false,
        expiresAt: null,
      });
    }
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
              <option value="local-template">Legacy alias (Jungle Grid Qwen)</option>
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
          <Field label="Concurrent sources" error={form.formState.errors.maximumConcurrentSources?.message}>
            <Input type="number" {...form.register("maximumConcurrentSources", { valueAsNumber: true })} />
          </Field>
          <Field label="Concurrent enrichments" error={form.formState.errors.maximumConcurrentEnrichments?.message}>
            <Input type="number" {...form.register("maximumConcurrentEnrichments", { valueAsNumber: true })} />
          </Field>
          <Field label="Discovery deadline (seconds)" error={form.formState.errors.discoveryDeadlineSeconds?.message}>
            <Input type="number" {...form.register("discoveryDeadlineSeconds", { valueAsNumber: true })} />
          </Field>
          <Field label="Queries per source" error={form.formState.errors.sourceQueryBudget?.message}>
            <Input type="number" {...form.register("sourceQueryBudget", { valueAsNumber: true })} />
          </Field>
          <Field label="Candidates per source" error={form.formState.errors.sourceCandidateBudget?.message}>
            <Input type="number" {...form.register("sourceCandidateBudget", { valueAsNumber: true })} />
          </Field>
          <Field label="Preliminary multiplier" error={form.formState.errors.preliminaryTargetMultiplier?.message}>
            <Input type="number" step="0.5" {...form.register("preliminaryTargetMultiplier", { valueAsNumber: true })} />
          </Field>
          <Field label="Minimum distinct sources" error={form.formState.errors.minimumDistinctSources?.message}>
            <Input type="number" {...form.register("minimumDistinctSources", { valueAsNumber: true })} />
          </Field>
          <Field label="Source cache TTL (seconds)" error={form.formState.errors.sourceCacheTtlSeconds?.message}>
            <Input type="number" {...form.register("sourceCacheTtlSeconds", { valueAsNumber: true })} />
          </Field>
          <Field label="Evidence cap per source" error={form.formState.errors.maximumEvidencePerSource?.message}>
            <Input type="number" {...form.register("maximumEvidencePerSource", { valueAsNumber: true })} />
          </Field>
          <Field label="Prospect cap per entity" error={form.formState.errors.maximumProspectsPerEntity?.message}>
            <Input type="number" {...form.register("maximumProspectsPerEntity", { valueAsNumber: true })} />
          </Field>
          <Field label="Proof minimum score" error={form.formState.errors.proofMinimumScore?.message}>
            <Input type="number" {...form.register("proofMinimumScore", { valueAsNumber: true })} />
          </Field>
          <Field label="Screenshot retention days" error={form.formState.errors.screenshotRetentionDays?.message}>
            <Input type="number" {...form.register("screenshotRetentionDays", { valueAsNumber: true })} />
          </Field>
          <Field label="Data retention days" error={form.formState.errors.dataRetentionDays?.message}>
            <Input type="number" {...form.register("dataRetentionDays", { valueAsNumber: true })} />
          </Field>
          <Field label="Browser allowlist (comma-separated)" error={form.formState.errors.browserAllowedDomains?.message}>
            <Input
              value={form.watch("browserAllowedDomains").join(", ")}
              onChange={(event) =>
                form.setValue(
                  "browserAllowedDomains",
                  event.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                  { shouldDirty: true },
                )
              }
            />
          </Field>
          <Field label="Default allowed outreach URL" error={form.formState.errors.defaultAllowedOutreachUrl?.message}>
            <Input readOnly {...form.register("defaultAllowedOutreachUrl")} />
          </Field>
          <label className="flex items-center gap-3 rounded-md border bg-black/20 px-3 py-2 text-sm">
            <input type="checkbox" className="accent-green-500" {...form.register("dryRun")} />
            Dry-run mode
          </label>
          <label className="flex items-center gap-3 rounded-md border bg-black/20 px-3 py-2 text-sm">
            <input type="checkbox" className="accent-green-500" {...form.register("browserAutomationEnabled")} />
            Browser delivery enabled
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
            <Provider name="Slack bot token" ready={secrets.slackBotToken} />
            <Provider name="Discord bot token" ready={secrets.discordBotToken} />
            <Provider name="X API token" ready={secrets.xBearerToken} />
            <Provider name="Meta access token" ready={secrets.metaAccessToken} />
            <Provider name="WhatsApp access token" ready={secrets.whatsAppAccessToken} />
            <Provider name="Twilio credentials" ready={secrets.twilioCredentials} />
            <Provider name="Browser session encryption" ready={secrets.browserSessionEncryption} />
          </div>
          <div className="mt-5 space-y-3">
            {deliveryAdapters.map((adapter) => (
              <div key={adapter.adapterId} className="rounded-md border bg-black/20 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{adapter.adapterId}</span>
                  <Badge tone={adapter.available ? "green" : "amber"}>
                    {adapter.available ? "Available" : "Blocked"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {adapter.channels.join(", ")} · {adapter.message}
                </p>
              </div>
            ))}
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
          <h2 className="font-semibold">Provider authorizations</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Provider">
              <Input value={authorizationProvider} onChange={(event) => setAuthorizationProvider(event.target.value)} />
            </Field>
            <Field label="Destination pattern">
              <Input value={authorizationPattern} onChange={(event) => setAuthorizationPattern(event.target.value)} placeholder="example.com or github.com/org/repo" />
            </Field>
            <Field label="Permissions">
              <Input value={authorizationPermissions} onChange={(event) => setAuthorizationPermissions(event.target.value)} />
            </Field>
            <Field label="Expires at">
              <Input type="datetime-local" value={authorizationExpiry} onChange={(event) => setAuthorizationExpiry(event.target.value)} />
            </Field>
          </div>
          <div className="mt-4">
            <Button
              variant="secondary"
              disabled={!authorizationPattern.trim()}
              onClick={addAuthorization}
            >
              <Shield className="h-4 w-4" /> Add authorization
            </Button>
          </div>
          <div className="mt-4 divide-y">
            {authorizations.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs">{entry.provider}</p>
                    <Badge tone={entry.status === "active" ? "green" : "neutral"}>{entry.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.destinationPattern}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.permissions.join(", ") || "no explicit permissions"}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Revoke authorization"
                  onClick={() => revokeAuthorization(entry.id)}
                  disabled={entry.status !== "active"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {authorizations.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No provider authorizations.</p> : null}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Browser session</h2>
          <div className="mt-4 flex items-center justify-between rounded-md border bg-black/20 px-3 py-2 text-sm">
            <span>Managed browser session</span>
            <Badge tone={browserSession.configured ? "green" : "amber"}>
              {browserSession.configured ? "Configured" : "Missing"}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Workspace {browserSession.workspaceId} · provider {browserSession.provider} · expires{" "}
            {browserSession.expiresAt ?? "never"}
          </p>
          <div className="mt-4 grid gap-3">
            <Field label="Storage state JSON">
              <Textarea rows={8} value={browserState} onChange={(event) => setBrowserState(event.target.value)} />
            </Field>
            <Field label="Expires at">
              <Input type="datetime-local" value={browserExpiry} onChange={(event) => setBrowserExpiry(event.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={saveBrowserSession}>
              <KeyRound className="h-4 w-4" /> Save browser session
            </Button>
            <Button variant="ghost" onClick={revokeBrowserSession}>
              <Trash2 className="h-4 w-4" /> Revoke session
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
