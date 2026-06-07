import { PageHeader } from "@/components/page-header";
import { ManualRunForm } from "@/components/manual-run-form";
import { OutreachRepository } from "@/src/db/repository";

export const dynamic = "force-dynamic";

export default function ManualRunPage() {
  const settings = new OutreachRepository().getSettings();
  return (
    <>
      <PageHeader
        title="Manual run"
        description="Start a bounded discovery-to-draft workflow and monitor persisted phases."
      />
      <div className="p-5 lg:p-8">
        <ManualRunForm
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
