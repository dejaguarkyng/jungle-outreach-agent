import { PageHeader } from "@/components/page-header";
import { ProspectsTable } from "@/components/prospects-table";
import { OutreachRepository } from "@/src/db/repository";

export const dynamic = "force-dynamic";

export default function ProspectsPage() {
  const prospects = new OutreachRepository().listProspects({ limit: 1000 });
  return (
    <>
      <PageHeader
        title="Prospects"
        description="Deduplicated public professional contacts with source provenance."
      />
      <div className="p-5 lg:p-8">
        <ProspectsTable prospects={prospects} />
      </div>
    </>
  );
}
