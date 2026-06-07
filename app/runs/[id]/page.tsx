import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { OutreachRepository } from "@/src/db/repository";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/src/lib/utils";
import { RunArtifactActions } from "@/components/run-artifact-actions";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = new OutreachRepository().getRunDetail(id);
  if (!detail) notFound();
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
        {detail.run.junglegridJobId ? (
          <Card className="space-y-3 p-5">
            <div>
              <p className="text-xs text-muted-foreground">Jungle Grid job ID</p>
              <p className="mt-1 font-mono text-sm">{detail.run.junglegridJobId}</p>
            </div>
            <RunArtifactActions runId={detail.run.id} />
            <div className="flex flex-wrap gap-2">
              {detail.run.artifacts.map((artifact) => (
                <Badge key={artifact}>{artifact}</Badge>
              ))}
            </div>
          </Card>
        ) : null}
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
