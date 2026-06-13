import { PageHeader } from "@/components/page-header";
import { ManualRunForm } from "@/components/manual-run-form";
import { OutreachRepository } from "@/src/db/repository";
import { listAvailableCampaigns } from "@/src/services/campaign-config";

export const dynamic = "force-dynamic";

export default function ManualRunPage() {
  const repository = new OutreachRepository();
  const settings = repository.getSettings();
  return (
    <>
      <PageHeader
        title="Manual run"
        description="Start a bounded discovery-to-draft workflow and monitor persisted phases."
      />
      <div className="p-5 lg:p-8">
        <ManualRunForm
          campaigns={listAvailableCampaigns(repository).map((campaign) => ({
            id: campaign.campaignId,
            name: campaign.name,
            offer: campaign.campaign.offer.name,
          }))}
          defaults={{
            targetCount: settings.dailyTarget,
            scoreThreshold: settings.fitScoreThreshold,
            dryRun: settings.dryRun,
            mode: settings.mode,
          }}
        />
      </div>
    </>
  );
}
