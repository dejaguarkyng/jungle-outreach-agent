import { PageHeader } from "@/components/page-header";
import { CampaignsManager } from "@/components/campaigns-manager";
import { OutreachRepository } from "@/src/db/repository";
import { listTemplateCampaignConfigurations } from "@/src/services/campaign-config";

export const dynamic = "force-dynamic";

export default function CampaignsPage() {
  const repository = new OutreachRepository();
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Create, inspect, and persist the campaign contracts that drive discovery, scoring, proof generation, and delivery."
      />
      <div className="p-5 lg:p-8">
        <CampaignsManager
          campaigns={repository.listCampaigns()}
          templates={listTemplateCampaignConfigurations()}
        />
      </div>
    </>
  );
}
