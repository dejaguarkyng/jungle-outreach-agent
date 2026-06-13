import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { OutreachRepository } from "@/src/db/repository";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/src/lib/utils";
import { RunArtifactActions } from "@/components/run-artifact-actions";
import { RunCancelButton } from "@/components/run-cancel-button";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = new OutreachRepository().getRunDetail(id);
  if (!detail) notFound();
  const runSummary = detail.run.runSummary;
  const sourceMetrics = Object.entries(runSummary?.source_metrics ?? {}).sort(
    (left, right) =>
      right[1].prospects - left[1].prospects ||
      right[1].evidence_items - left[1].evidence_items ||
      right[1].candidates - left[1].candidates,
  );
  const stageDurations = Object.entries(runSummary?.stage_durations_ms ?? {}).sort(
    (left, right) => right[1] - left[1],
  );
  const totalStageDuration = stageDurations.reduce((sum, [, duration]) => sum + duration, 0);
  const sourceHealthCounts = sourceMetrics.reduce<Record<string, number>>((counts, [, metrics]) => {
    counts[metrics.status] = (counts[metrics.status] ?? 0) + 1;
    return counts;
  }, {});
  const timeoutReasons = sourceMetrics
    .filter(([, metrics]) => metrics.timeout_reason)
    .map(([source, metrics]) => ({ source, reason: metrics.timeout_reason! }));
  const degradedSignals = (runSummary?.source_signals ?? []).filter(
    (signal) =>
      signal.status && signal.status !== "summary" && signal.status !== "healthy" && signal.status !== "productive",
  );
  const productiveSignals = (runSummary?.source_signals ?? [])
    .filter((signal) => signal.evidence_count && signal.evidence_count > 0)
    .sort((left, right) => (right.evidence_count ?? 0) - (left.evidence_count ?? 0))
    .slice(0, 8);
  const conversionStats = [
    ["Discovered", runSummary?.discovered ?? detail.prospects.length],
    ["Qualified", runSummary?.qualified ?? detail.prospects.length],
    ["Excluded", runSummary?.excluded ?? detail.run.failedCount],
    ["Drafted", runSummary?.drafted ?? detail.run.draftedCount],
  ] as const;
  const qualityMetrics = runSummary?.quality_metrics;

  return (
    <>
      <PageHeader
        title={`Run ${detail.run.id.slice(0, 8)}`}
        description={`${detail.run.mode} · ${formatDate(detail.run.createdAt)}`}
        actions={<Badge tone={detail.run.phase === "failed" ? "red" : "green"}>{detail.run.phase}</Badge>}
      />
      <div className="space-y-5 p-5 lg:p-8">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[
            ["Target", detail.run.targetCount],
            ["Drafted", detail.run.draftedCount],
            ["Failed", detail.run.failedCount],
            ["Prospects", detail.prospects.length],
            ["Model", detail.run.modelMode ?? "pending"],
            ["Retries", detail.run.retryCount],
            ["Job", detail.run.junglegridJobId?.slice(0, 12) ?? "local"],
            ["Artifacts", detail.run.artifacts.length],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </Card>
          ))}
        </section>
        {runSummary ? (
          <section className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <Card className="p-5">
                <h2 className="text-sm font-semibold">Source contribution</h2>
                <div className="mt-4 grid gap-3">
                  {sourceMetrics.map(([source, metrics]) => {
                    const cacheRate = percentage(metrics.cache_hits, metrics.requests);
                    const candidateConversion = percentage(metrics.prospects, metrics.candidates);
                    const evidencePerProspect =
                      metrics.prospects > 0
                        ? (metrics.evidence_items / metrics.prospects).toFixed(1)
                        : "0.0";
                    return (
                      <div key={source} className="rounded-md border bg-black/20 p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{source}</span>
                          <Badge tone={toneForHealth(metrics.status)}>{metrics.status}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                          <span>{metrics.queries} queries</span>
                          <span>{metrics.requests} requests</span>
                          <span>{metrics.candidates} candidates</span>
                          <span>{metrics.prospects} prospects</span>
                          <span>{metrics.evidence_items} evidence items</span>
                          <span>{cacheRate}% cache hit rate</span>
                          <span>{candidateConversion}% candidate conversion</span>
                          <span>{evidencePerProspect} evidence/prospect</span>
                        </div>
                        <p className="mt-2 text-muted-foreground">{metrics.duration_ms}ms total source time</p>
                        {metrics.timeout_reason ? (
                          <p className="mt-1 text-amber-200">{metrics.timeout_reason}</p>
                        ) : null}
                      </div>
                    );
                  })}
                  {sourceMetrics.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No source metrics recorded.</p>
                  ) : null}
                </div>
              </Card>
              <div className="space-y-5">
                <Card className="p-5">
                  <h2 className="text-sm font-semibold">Conversion and quality</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {conversionStats.map(([label, value]) => (
                      <div key={label} className="rounded-md border bg-black/20 p-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 text-xl font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                  {qualityMetrics ? (
                    <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                      <MetricRow
                        label="Qualification pass rate"
                        value={`${roundMetric(qualityMetrics.qualification_gate_pass_rate * 100)}%`}
                      />
                      <MetricRow
                        label="Fallback rate"
                        value={`${roundMetric(qualityMetrics.fallback_rate * 100)}%`}
                      />
                      <MetricRow
                        label="Evidence-backed scoring"
                        value={`${roundMetric(qualityMetrics.scored_criteria_with_evidence_ids_percentage)}%`}
                      />
                      <MetricRow
                        label="Duplicate collapse count"
                        value={String(qualityMetrics.duplicate_collapse_count)}
                      />
                      <MetricRow
                        label="Contamination rejection rate"
                        value={
                          qualityMetrics.contamination_rejection_rate === null
                            ? "n/a"
                            : `${roundMetric(qualityMetrics.contamination_rejection_rate * 100)}%`
                        }
                      />
                    </div>
                  ) : null}
                </Card>
                <Card className="p-5">
                  <h2 className="text-sm font-semibold">Source health</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.entries(sourceHealthCounts).map(([status, count]) => (
                      <Badge key={status} tone={toneForHealth(status)}>
                        {status} · {count}
                      </Badge>
                    ))}
                    {Object.keys(sourceHealthCounts).length === 0 ? (
                      <span className="text-sm text-muted-foreground">No health summary recorded.</span>
                    ) : null}
                  </div>
                  {timeoutReasons.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {timeoutReasons.map((item) => (
                        <div
                          key={`${item.source}-${item.reason}`}
                          className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
                        >
                          <span className="font-medium">{item.source}</span>: {item.reason}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Card>
              </div>
            </div>
            <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
              <Card className="p-5">
                <h2 className="text-sm font-semibold">Stage durations</h2>
                <div className="mt-4 space-y-2">
                  {stageDurations.map(([stage, duration]) => (
                    <div
                      key={stage}
                      className="rounded-md border bg-black/20 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>{stage.replaceAll("_", " ")}</span>
                        <span className="font-mono">{duration}ms</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {percentage(duration, totalStageDuration)}% of recorded pipeline time
                      </p>
                    </div>
                  ))}
                  {stageDurations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No stage timing recorded.</p>
                  ) : null}
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="text-sm font-semibold">Source signals</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Top productive records</p>
                    <div className="mt-2 space-y-2">
                      {productiveSignals.map((signal) => (
                        <div key={`${signal.source_type}-${signal.source_id ?? signal.url}`} className="rounded-md border bg-black/20 p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{signal.source_type}</span>
                            <span>{signal.evidence_count} evidence</span>
                          </div>
                          <p className="mt-1 truncate text-muted-foreground">{signal.title ?? signal.url ?? signal.source_id}</p>
                        </div>
                      ))}
                      {productiveSignals.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No productive source records recorded.</p>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Degraded and timeout events</p>
                    <div className="mt-2 space-y-2">
                      {degradedSignals.map((signal, index) => (
                        <div key={`${signal.source_type}-${signal.error ?? signal.status}-${index}`} className="rounded-md border bg-black/20 p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{signal.source_type}</span>
                            <Badge tone={signal.status === "timeout" ? "amber" : "red"}>
                              {signal.status ?? "degraded"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {signal.error ?? signal.timeout_reason ?? "No additional detail"}
                          </p>
                        </div>
                      ))}
                      {degradedSignals.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No degraded source events recorded.</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </section>
        ) : null}
        {detail.run.junglegridJobId ? (
          <Card className="space-y-3 p-5">
            <div>
              <p className="text-xs text-muted-foreground">Jungle Grid job ID</p>
              <p className="mt-1 font-mono text-sm">{detail.run.junglegridJobId}</p>
            </div>
            <RunArtifactActions runId={detail.run.id} />
            {!["completed", "failed", "cancelled", "timed_out", "blocked"].includes(
              detail.run.phase,
            ) ? (
              <RunCancelButton runId={detail.run.id} />
            ) : null}
            <div className="flex flex-wrap gap-2">
              {detail.run.artifacts.map((artifact) => (
                <Badge key={artifact}>{artifact}</Badge>
              ))}
            </div>
          </Card>
        ) : null}
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Jungle Grid attempts</h2>
          <div className="mt-4 divide-y">
            {detail.executions.map((execution) => (
              <div key={execution.id} className="grid gap-1 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs">
                    {execution.junglegridJobId ?? "not submitted"}
                  </span>
                  <Badge
                    tone={
                      ["failed", "timed_out", "cancelled"].includes(execution.executionPhase)
                        ? "red"
                        : "neutral"
                    }
                  >
                    {execution.executionPhase.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Attempt {execution.retryCount + 1} ·{" "}
                  {execution.pipelineStage.replaceAll("_", " ")}
                </p>
                {execution.failureReason ? (
                  <p className="text-xs text-red-300">{execution.failureReason}</p>
                ) : null}
              </div>
            ))}
            {detail.executions.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No managed attempts recorded.
              </p>
            ) : null}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Lifecycle log</h2>
          <div className="mt-4 divide-y">
            {detail.events.map((event) => {
              const item = event as { id: number; phase: string; level: string; message: string; created_at: string };
              return (
                <div key={item.id} className="grid gap-2 py-3 text-sm md:grid-cols-[160px_150px_1fr]">
                  <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
                  <Badge tone={item.level === "error" ? "red" : "neutral"}>{item.phase}</Badge>
                  <span>{item.message}</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Prospect outcomes</h2></div>
          <div className="divide-y">
            {detail.prospects.map((entry) => {
              const item = entry as { outcome: string; reason?: string; prospect: { id: string; name: string; email: string; project: string } };
              return (
                <div key={item.prospect.id} className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[1fr_1.5fr_130px_1fr]">
                  <span>{item.prospect.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{item.prospect.email}</span>
                  <Badge>{item.outcome}</Badge>
                  <span className="text-xs text-muted-foreground">{item.reason ?? item.prospect.project}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}

function percentage(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function roundMetric(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1);
}

function toneForHealth(status: string): "green" | "amber" | "red" | "neutral" {
  if (status === "productive" || status === "healthy") return "green";
  if (status === "empty" || status === "timeout") return "amber";
  if (status === "failed" || status === "degraded") return "red";
  return "neutral";
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-black/20 px-3 py-2">
      <span>{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}
