import Link from "next/link";
import { ArrowRight, CheckCircle2, Mail, Target, Users } from "lucide-react";
import { OutreachRepository } from "@/src/db/repository";
import { getZeptoMailStatus } from "@/apps/api/src/services/zeptomail";
import { getEnv } from "@/src/config/env";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDate } from "@/src/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const repository = new OutreachRepository();
  const env = getEnv();
  const businessProfile = repository.getBusinessProfile();
  const savedCampaigns = repository.listCampaigns();
  const setupChecks = [
    ["Business profile", Boolean(businessProfile)],
    ["Saved campaign", savedCampaigns.length > 0],
    ["Jungle Grid API", Boolean(env.JUNGLEGRID_API_KEY)],
    ["Browser session key", Boolean(env.OPENLINE_SESSION_ENCRYPTION_KEY)],
  ] as const;
  const summary = repository.dashboardSummary() as {
    counts: Record<string, number>;
    totalProspects: number;
    todayDrafted: number;
    dailyTarget: number;
    approvedDrafts: number;
    sentDrafts: number;
    failedSends: number;
    blockedContacts: number;
    latestRun: {
      phase: string;
      createdAt: string;
      draftedCount: number;
      failedCount: number;
      mode: string;
      modelMode: string | null;
      junglegridJobId: string | null;
    } | null;
  };
  const zeptomail = getZeptoMailStatus();
  const progress = Math.min(100, Math.round((summary.todayDrafted / summary.dailyTarget) * 100));
  const metrics = [
    ["Found", summary.counts.found ?? 0],
    ["Researched", summary.counts.researched ?? 0],
    ["Scored", summary.counts.scored ?? 0],
    ["Drafted", summary.counts.drafted ?? 0],
    ["Reviewed", summary.counts.reviewed ?? 0],
    ["Approved", summary.approvedDrafts],
    ["Sent", summary.sentDrafts],
    ["Failed sends", summary.failedSends],
    ["Sent manually", summary.counts.sent_manually ?? 0],
    ["Replied", summary.counts.replied ?? 0],
    ["Bounced", summary.counts.bounced ?? 0],
    ["Blocked", summary.counts.blocked ?? 0],
  ];

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description="Self-hosted prospect research, internal draft review, and manually approved delivery."
        actions={
          <Link href="/run" className={cn(buttonVariants(), "no-underline")}>
            Start manual run <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="space-y-6 p-5 lg:p-8">
        {!businessProfile || savedCampaigns.length === 0 ? (
          <Card className="border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-medium">Finish initial setup</p>
            <p className="mt-1 text-amber-100/80">
              {businessProfile ? "Create at least one saved campaign." : "Add a business profile, then create your first campaign."}
            </p>
            <div className="mt-3 flex gap-2">
              {!businessProfile ? (
                <Link href="/settings" className={cn(buttonVariants({ variant: "secondary" }), "no-underline")}>
                  Open settings
                </Link>
              ) : null}
              <Link href="/campaigns" className={cn(buttonVariants({ variant: "secondary" }), "no-underline")}>
                Manage campaigns
              </Link>
            </div>
          </Card>
        ) : null}
        {!zeptomail.sendEnabled ? (
          <Card className="border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-medium">ZeptoMail sending is disabled</p>
            <p className="mt-1 text-amber-100/80">{zeptomail.message}</p>
            <p className="mt-1 text-amber-100/80">{zeptomail.complianceWarning}</p>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-sm">Prospect inventory</span>
              <Users className="h-4 w-4" />
            </div>
            <p className="mt-3 text-3xl font-semibold">{summary.totalProspects}</p>
            <p className="mt-1 text-xs text-muted-foreground">Unique public professional contacts</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-sm">Today&apos;s send target</span>
              <Target className="h-4 w-4" />
            </div>
            <p className="mt-3 text-3xl font-semibold">
              {summary.todayDrafted}
              <span className="text-base font-normal text-muted-foreground"> / {summary.dailyTarget}</span>
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full bg-green-400" style={{ width: `${progress}%` }} />
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-sm">ZeptoMail sender</span>
              <Mail className="h-4 w-4" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <p className="font-mono text-sm">{zeptomail.fromEmail}</p>
              <Badge tone={zeptomail.sendEnabled ? "green" : "amber"}>
                {zeptomail.sendEnabled ? "Manual send enabled" : "Disabled"}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Sends require approval, validation, suppression checks, and a user click.
            </p>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Setup checklist</h2>
            <div className="mt-4 space-y-3">
              {setupChecks.map(([label, ready]) => (
                <div key={label} className="flex items-center justify-between rounded-md border bg-black/20 px-3 py-2 text-sm">
                  <span>{label}</span>
                  <Badge tone={ready ? "green" : "amber"}>
                    {ready ? "Ready" : "Missing"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Next steps</h2>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>1. Save the business profile in Settings.</p>
              <p>2. Create at least one campaign from the Campaigns page.</p>
              <p>3. Import seed prospects and suppressions if you already have them.</p>
              <p>4. Configure provider credentials and browser authorization only for the channels you plan to use.</p>
            </div>
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Pipeline inventory</h2>
            <span className="text-xs text-muted-foreground">Current status per prospect</span>
          </div>
          <div className="grid grid-cols-2 border-l border-t sm:grid-cols-3 xl:grid-cols-12">
            {metrics.map(([label, value]) => (
              <div key={label} className="border-b border-r bg-card px-4 py-4">
                <p className="text-2xl font-semibold">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Latest run</h2>
              {summary.latestRun ? (
                <Badge tone={summary.latestRun.phase === "failed" ? "red" : "green"}>
                  {summary.latestRun.phase}
                </Badge>
              ) : null}
            </div>
            {summary.latestRun ? (
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Started</p>
                  <p className="mt-1">{formatDate(summary.latestRun.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Drafted</p>
                  <p className="mt-1">{summary.latestRun.draftedCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Failed</p>
                  <p className="mt-1">{summary.latestRun.failedCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Mode</p>
                  <p className="mt-1">{summary.latestRun.mode}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Model</p>
                  <p className="mt-1">{summary.latestRun.modelMode ?? "pending"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Job</p>
                  <p className="mt-1 truncate font-mono text-xs">
                    {summary.latestRun.junglegridJobId ?? "local"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No outreach runs yet.</p>
            )}
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-300" />
              <h2 className="text-sm font-semibold">Safety boundary</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Jungle Grid writes validated artifacts. This app stores drafts internally, then ZeptoMail
              can send only after manual approval, validation, and suppression checks.
            </p>
          </Card>
        </section>
      </div>
    </>
  );
}
