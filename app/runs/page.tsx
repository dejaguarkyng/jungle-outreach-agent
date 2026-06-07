import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { OutreachRepository } from "@/src/db/repository";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/src/lib/utils";

export const dynamic = "force-dynamic";

export default function RunsPage() {
  const runs = new OutreachRepository().listRuns();
  return (
    <>
      <PageHeader title="Runs" description="Durable lifecycle history, outcomes, and exportable audit context." />
      <div className="p-5 lg:p-8">
        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b bg-white/[0.025] text-xs uppercase text-muted-foreground">
                <tr>
                  {["Run", "Mode", "Job", "Phase", "Target", "Drafted", "Failed", "Started", "Completed", ""].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map((run) => (
                  <tr key={run.id} className="bg-card">
                    <td className="px-4 py-3 font-mono text-xs">{run.id.slice(0, 8)}</td>
                    <td className="px-4 py-3">{run.mode}</td>
                    <td className="max-w-36 truncate px-4 py-3 font-mono text-xs">
                      {run.junglegridJobId ?? "local"}
                    </td>
                    <td className="px-4 py-3"><Badge tone={run.phase === "failed" ? "red" : "green"}>{run.phase}</Badge></td>
                    <td className="px-4 py-3">{run.targetCount}</td>
                    <td className="px-4 py-3">{run.draftedCount}</td>
                    <td className="px-4 py-3">{run.failedCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(run.startedAt ?? run.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(run.completedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <Link href={`/runs/${run.id}`} aria-label="Open run" className="text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        <a href={`/api/runs/${run.id}?format=csv`} aria-label="Export run CSV" className="text-muted-foreground hover:text-foreground">
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {runs.length === 0 ? <p className="px-4 py-16 text-center text-sm text-muted-foreground">No runs yet.</p> : null}
        </div>
      </div>
    </>
  );
}
