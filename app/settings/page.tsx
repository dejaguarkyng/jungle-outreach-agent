import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { OutreachRepository } from "@/src/db/repository";
import { getEnv } from "@/src/config/env";
import { getZeptoMailStatus } from "@/apps/api/src/services/zeptomail";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const repository = new OutreachRepository();
  const env = getEnv();
  return (
    <>
      <PageHeader
        title="Settings"
        description="Jungle Grid readiness, ZeptoMail status, worker settings, safety limits, and blocklist."
      />
      <div className="p-5 lg:p-8">
        <SettingsForm
          initialSettings={repository.getSettings()}
          secrets={{
            zeptoMailApiKey: Boolean(env.ZEPTOMAIL_API_KEY),
            zeptoMailApiBase: Boolean(env.ZEPTOMAIL_API_BASE),
            githubToken: Boolean(env.GITHUB_TOKEN),
            jungleGridApiKey: Boolean(env.JUNGLEGRID_API_KEY),
          }}
          zeptomail={getZeptoMailStatus()}
          jungleGridApiBase={env.JUNGLEGRID_API_BASE}
          initialBlocked={repository.listBlocked() as Array<{
            id: string;
            email?: string | null;
            domain?: string | null;
            reason: string;
            created_at: string;
          }>}
        />
      </div>
    </>
  );
}
