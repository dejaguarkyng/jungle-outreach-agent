import { PageHeader } from "@/components/page-header";
import { ResearchReview } from "@/components/research-review";
import { OutreachRepository } from "@/src/db/repository";

export const dynamic = "force-dynamic";

export default function ResearchPage() {
  const repository = new OutreachRepository();
  const prospects = repository
    .listProspects({ limit: 500 })
    .filter((prospect) => ["researched", "scored", "approved"].includes(prospect.status));
  const items = prospects.map((prospect) => ({
    prospect,
    research: repository.getResearch(prospect.id),
  }));
  return (
    <>
      <PageHeader
        title="Research review"
        description="Approve evidence-grounded prospects before any outreach draft is generated."
      />
      <div className="p-5 lg:p-8">
        <ResearchReview initialItems={items} />
      </div>
    </>
  );
}
