import { PageHeader } from "@/components/page-header";
import { BusinessProfileForm } from "@/components/business-profile-form";
import { SettingsForm } from "@/components/settings-form";
import { SuppressionImportCard } from "@/components/suppression-import-card";
import { OutreachRepository } from "@/src/db/repository";
import { getEnv } from "@/src/config/env";
import { getZeptoMailStatus } from "@/apps/api/src/services/zeptomail";
import { DeliveryService } from "@/src/delivery/service";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const repository = new OutreachRepository();
  const env = getEnv();
  const workspaceId = "default";
  return (
    <>
      <PageHeader
        title="Settings"
        description="Operational budgets, delivery readiness, browser controls, retention, and blocklist."
      />
      <div className="space-y-5 p-5 lg:p-8">
        <BusinessProfileForm initialProfile={repository.getBusinessProfile()} />
        <SuppressionImportCard />
        <SettingsForm
          initialSettings={repository.getSettings()}
          deliveryAdapters={new DeliveryService(repository).statuses()}
          providerAuthorizations={repository.listProviderAuthorizations(workspaceId)}
          browserSessionStatus={{
            workspaceId,
            provider: "browser",
            configured: Boolean(repository.getBrowserSession(workspaceId, "browser")),
            expiresAt: repository.getBrowserSession(workspaceId, "browser")?.expiresAt ?? null,
          }}
          secrets={{
            zeptoMailApiKey: Boolean(env.ZEPTOMAIL_API_KEY),
            zeptoMailApiBase: Boolean(env.ZEPTOMAIL_API_BASE),
            githubToken: Boolean(env.GITHUB_TOKEN),
            jungleGridApiKey: Boolean(env.JUNGLEGRID_API_KEY),
            slackBotToken: Boolean(env.SLACK_BOT_TOKEN),
            discordBotToken: Boolean(env.DISCORD_BOT_TOKEN),
            xBearerToken: Boolean(env.X_BEARER_TOKEN),
            metaAccessToken: Boolean(env.META_ACCESS_TOKEN),
            whatsAppAccessToken: Boolean(env.WHATSAPP_ACCESS_TOKEN),
            twilioCredentials: Boolean(
              env.TWILIO_ACCOUNT_SID &&
                env.TWILIO_AUTH_TOKEN &&
                env.TWILIO_FROM_NUMBER,
            ),
            browserSessionEncryption: Boolean(env.OPENLINE_SESSION_ENCRYPTION_KEY),
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
