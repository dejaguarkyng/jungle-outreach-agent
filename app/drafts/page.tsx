import { PageHeader } from "@/components/page-header";
import { DraftWorkspace } from "@/components/draft-workspace";
import { OutreachRepository } from "@/src/db/repository";

export const dynamic = "force-dynamic";

export default function DraftsPage() {
  const drafts = new OutreachRepository().listDrafts();
  return (
    <>
      <PageHeader
        title="Drafts"
        description="Validate, edit, approve, reject, and manually send approved drafts through ZeptoMail."
      />
      <div className="p-5 lg:p-8">
        <DraftWorkspace initialDrafts={drafts} />
      </div>
    </>
  );
}
