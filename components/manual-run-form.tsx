"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  outreachModes,
  prospectCategories,
  runPhases,
  type OutreachRun,
} from "@/src/domain/schemas";

const schema = z.object({
  targetCount: z.coerce.number().int().min(1).max(100),
  mode: z.enum(outreachModes),
  category: z.enum(["", ...prospectCategories]),
  scoreThreshold: z.coerce.number().int().min(0).max(100),
  dryRun: z.boolean(),
  campaignId: z.string().min(1),
});
type Values = z.infer<typeof schema>;

export function ManualRunForm({
  defaults,
  campaigns,
}: {
  campaigns: Array<{ id: string; name: string; offer: string }>;
  defaults: {
    targetCount: number;
    scoreThreshold: number;
    dryRun: boolean;
    mode?: (typeof outreachModes)[number];
  };
}) {
  const [confirming, setConfirming] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<OutreachRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...defaults,
      mode: defaults.mode ?? "junglegrid-qwen",
      category: "",
      campaignId: campaigns[0]?.id ?? "jungle-grid",
    },
  });

  useEffect(() => {
    if (!runId) return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setRun(payload.run);
      if (["completed", "failed"].includes(payload.run.phase)) window.clearInterval(interval);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [runId]);

  async function start(values: Values) {
    setError(null);
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        category: values.category || undefined,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Run could not be started.");
      return;
    }
    setRunId(payload.runId);
    setConfirming(false);
  }

  const values = form.watch();
  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="p-5">
        <form className="space-y-4" onSubmit={form.handleSubmit(() => setConfirming(true))}>
          <Field label="Target count" error={form.formState.errors.targetCount?.message}>
            <Input type="number" min={1} max={100} {...form.register("targetCount")} />
          </Field>
          <Field label="Execution mode" error={form.formState.errors.mode?.message}>
            <select className="h-9 rounded-md border bg-black/20 px-3 text-sm" {...form.register("mode")}>
              {outreachModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campaign" error={form.formState.errors.campaignId?.message}>
            <select className="h-9 rounded-md border bg-black/20 px-3 text-sm" {...form.register("campaignId")}>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category focus" error={form.formState.errors.category?.message}>
            <select className="h-9 rounded-md border bg-black/20 px-3 text-sm" {...form.register("category")}>
              <option value="">All target categories</option>
              {prospectCategories.map((category) => (
                <option key={category} value={category}>
                  {category.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Minimum fit score" error={form.formState.errors.scoreThreshold?.message}>
            <Input type="number" min={0} max={100} {...form.register("scoreThreshold")} />
          </Field>
          <label className="flex items-start gap-3 rounded-md border bg-black/20 p-3 text-sm">
            <input type="checkbox" className="mt-1 accent-green-500" {...form.register("dryRun")} />
              <span>
                <span className="block font-medium">Dry-run mode</span>
              <span className="text-xs text-muted-foreground">Research and store internal drafts without sending email.</span>
            </span>
          </label>
          <Button type="submit" className="w-full">
            <Play className="h-4 w-4" /> Review run
          </Button>
        </form>
      </Card>

      <div className="space-y-5">
        {confirming ? (
          <Card className="border-green-500/25 p-5">
            <h2 className="font-semibold">Confirm outreach run</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This run will discover and research public contacts, score them, then draft only
              eligible prospects, validate artifacts, and store internal drafts. ZeptoMail sends are
              always a separate operator action after review and approval.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Target</dt><dd>{values.targetCount}</dd></div>
              <div><dt className="text-muted-foreground">Score floor</dt><dd>{values.scoreThreshold}</dd></div>
              <div><dt className="text-muted-foreground">Category</dt><dd>{values.category || "All"}</dd></div>
              <div><dt className="text-muted-foreground">Mode</dt><dd>{values.dryRun ? "Dry run" : "Draft creation"}</dd></div>
              <div><dt className="text-muted-foreground">Execution</dt><dd>{values.mode}</dd></div>
              <div><dt className="text-muted-foreground">Campaign</dt><dd>{campaigns.find((campaign) => campaign.id === values.campaignId)?.offer ?? values.campaignId}</dd></div>
            </dl>
            <div className="mt-5 flex gap-2">
              <Button onClick={form.handleSubmit(start)}>Confirm and start</Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Run progress</h2>
            {run ? <Badge tone={run.phase === "failed" ? "red" : "green"}>{run.phase.replaceAll("_", " ")}</Badge> : null}
          </div>
          <div className="mt-5 space-y-3">
            {runPhases.slice(1).map((phase) => {
              const currentIndex = run ? runPhases.indexOf(run.phase) : -1;
              const phaseIndex = runPhases.indexOf(phase);
              const complete = currentIndex > phaseIndex || run?.phase === "completed";
              const active = run?.phase === phase;
              return (
                <div key={phase} className="flex items-center gap-3 text-sm">
                  {complete ? (
                    <CheckCircle2 className="h-4 w-4 text-green-300" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-green-300" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border" />
                  )}
                  <span className={active || complete ? "text-foreground" : "text-muted-foreground"}>
                    {phase.replaceAll("_", " ")}
                  </span>
                </div>
              );
            })}
          </div>
          {!run ? <p className="mt-5 text-sm text-muted-foreground">No run is active.</p> : null}
          {run?.notes ? <p className="mt-5 rounded-md border bg-black/20 p-3 text-sm text-amber-200">{run.notes}</p> : null}
          {error ? <p className="mt-5 text-sm text-red-300">{error}</p> : null}
        </Card>
      </div>
    </div>
  );
}
