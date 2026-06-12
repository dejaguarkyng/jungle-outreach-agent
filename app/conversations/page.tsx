import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { MessageApproveButton } from "@/components/message-approve-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OutreachRepository } from "@/src/db/repository";
import { formatDate } from "@/src/lib/utils";

export const dynamic = "force-dynamic";

export default function ConversationsPage() {
  const repository = new OutreachRepository();
  const conversations = repository.listConversations();

  return (
    <>
      <PageHeader
        title="Conversations"
        description="Managed reply analysis, opportunity progression, policy decisions, and approvals."
      />
      <div className="space-y-5 p-5 lg:p-8">
        {conversations.map((conversation) => {
          const prospect = repository.getProspect(conversation.prospectId);
          const messages = repository.listConversationMessages(conversation.id);
          const jobs = repository.listConversationJobs(conversation.id);
          return (
            <Card key={conversation.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/prospects/${conversation.prospectId}`}
                    className="font-semibold text-green-300 hover:underline"
                  >
                    {prospect?.name ?? conversation.prospectId}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {conversation.channel.replaceAll("_", " ")} · {prospect?.project}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={conversation.status === "opted_out" ? "red" : "green"}>
                    {conversation.status.replaceAll("_", " ")}
                  </Badge>
                  <Badge>{conversation.opportunityState.replaceAll("_", " ")}</Badge>
                </div>
              </div>
              {conversation.summary ? (
                <p className="mt-4 text-sm">{conversation.summary}</p>
              ) : null}
              <div className="mt-5 space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {message.direction} · {message.classification ?? message.status}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(message.createdAt)}
                      </p>
                    </div>
                    {message.subject ? <p className="mt-2 font-medium">{message.subject}</p> : null}
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{message.body}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge>{message.validationStatus.replaceAll("_", " ")}</Badge>
                      {message.junglegridJobId ? (
                        <span className="font-mono text-xs">{message.junglegridJobId}</span>
                      ) : null}
                      {message.status === "approval_required" ? (
                        <MessageApproveButton messageId={message.id} />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {jobs.length ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  Latest managed job: <span className="font-mono">{String(jobs[0].junglegrid_job_id ?? "pending")}</span>
                  {" "}· {String(jobs[0].status)}
                </p>
              ) : null}
            </Card>
          );
        })}
        {!conversations.length ? (
          <Card className="p-5 text-sm text-muted-foreground">
            Initial outreach will create the first conversation message.
          </Card>
        ) : null}
      </div>
    </>
  );
}
