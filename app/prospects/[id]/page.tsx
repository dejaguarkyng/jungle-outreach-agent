import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { OutreachRepository } from "@/src/db/repository";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/src/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repository = new OutreachRepository();
  const prospect = repository.getProspect(id);
  if (!prospect) notFound();
  const research = repository.getResearch(id);
  const draft = repository.getDraftByProspect(id);
  return (
    <>
      <PageHeader
        title={prospect.name}
        description={`${prospect.project} · ${prospect.email}`}
        actions={<Badge tone="green">{prospect.status.replaceAll("_", " ")}</Badge>}
      />
      <div className="grid gap-5 p-5 lg:grid-cols-[1.25fr_0.75fr] lg:p-8">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Public evidence</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Email source">
                <a className="inline-flex items-center gap-1 text-green-300" href={prospect.emailSourceUrl} target="_blank" rel="noreferrer">
                  {prospect.emailSourceType.replaceAll("_", " ")} <ExternalLink className="h-3 w-3" />
                </a>
              </Detail>
              <Detail label="Profile">
                {prospect.githubUrl ? (
                  <a className="inline-flex items-center gap-1 text-green-300" href={prospect.githubUrl} target="_blank" rel="noreferrer">
                    GitHub profile <ExternalLink className="h-3 w-3" />
                  </a>
                ) : "—"}
              </Detail>
              <Detail label="Company">{prospect.company ?? "—"}</Detail>
              <Detail label="Created">{formatDate(prospect.createdAt)}</Detail>
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Research note</h2>
            {research ? (
              <div className="mt-4 space-y-5 text-sm">
                <Detail label="Summary">{research.summary}</Detail>
                <Detail label="Personalization detail">{research.personalizationDetail}</Detail>
                <Detail label="Jungle Grid relevance">{research.junglegridRelevance}</Detail>
                <div>
                  <p className="mb-2 text-xs uppercase text-muted-foreground">Evidence URLs</p>
                  <div className="space-y-2">
                    {research.evidenceUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="block break-all text-green-300 hover:underline">
                        {url}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Not researched yet.</p>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Fit score</h2>
            <p className="mt-3 text-4xl font-semibold">{prospect.fitScore ?? "—"}</p>
            {prospect.scoreBreakdown ? (
              <div className="mt-4 space-y-3">
                {Object.entries(prospect.scoreBreakdown).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</span>
                    <span className="font-mono">{value}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Contact history</h2>
            {draft ? (
              <div className="mt-4 text-sm">
                <p>
                  Approval: <Badge>{draft.approvalStatus.replaceAll("_", " ")}</Badge>
                </p>
                <p className="mt-2">
                  Delivery: <Badge>{draft.deliveryStatus.replaceAll("_", " ")}</Badge>
                </p>
                <Link href="/drafts" className="mt-4 inline-block text-green-300">Open drafts workspace</Link>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No draft has been created.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="leading-6">{children}</dd>
    </div>
  );
}
