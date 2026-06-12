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
  const contactPoints = repository.listContactPoints(id);
  const proofArtifacts = repository.listProofArtifacts(id);
  const conversations = repository.listConversations(id);
  return (
    <>
      <PageHeader
        title={prospect.name}
        description={`${prospect.project} · ${prospect.email || "non-email contact"}`}
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
            <h2 className="text-sm font-semibold">Contact points</h2>
            <div className="mt-4 space-y-3 text-sm">
              {contactPoints.map((contact) => (
                <div key={contact.id}>
                  <Badge>{contact.type.replaceAll("_", " ")}</Badge>
                  <p className="mt-1 break-all">{contact.value}</p>
                  <p className="text-xs text-muted-foreground">
                    {contact.status} · confidence {Math.round(contact.confidence * 100)}%
                  </p>
                </div>
              ))}
            </div>
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
            <h2 className="text-sm font-semibold">Proof of value</h2>
            {proofArtifacts.length ? (
              <div className="mt-4 space-y-4 text-sm">
                {proofArtifacts.map((artifact) => (
                  <div key={artifact.id}>
                    <Badge tone="green">{artifact.type.replaceAll("_", " ")}</Badge>
                    <p className="mt-2 font-medium">{artifact.title}</p>
                    <p className="mt-1 text-muted-foreground">{artifact.content}</p>
                    <p className="mt-1 font-mono text-xs">{artifact.junglegridJobId}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No proof artifact yet.</p>
            )}
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
            {conversations.map((conversation) => (
              <div key={conversation.id} className="mt-4 border-t border-border pt-3 text-xs">
                <p>{conversation.channel.replaceAll("_", " ")} · {conversation.status}</p>
                <p className="text-muted-foreground">
                  Opportunity: {conversation.opportunityState.replaceAll("_", " ")}
                </p>
              </div>
            ))}
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
