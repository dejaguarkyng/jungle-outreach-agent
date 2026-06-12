import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProspectsTable } from "@/components/prospects-table";
import { DraftWorkspace } from "@/components/draft-workspace";
import { ManualRunForm } from "@/components/manual-run-form";
import type { EmailDraft, Prospect } from "@/src/domain/schemas";
import { settingsSchema } from "@/src/domain/schemas";

const prospect: Prospect = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Jane Maintainer",
  roleTitle: "Maintainer",
  email: "jane@acme.dev",
  emailSourceUrl: "https://github.com/jane",
  emailSourceType: "github_profile",
  githubUsername: "jane",
  githubUrl: "https://github.com/jane",
  websiteUrl: "https://acme.dev",
  company: "Acme",
  project: "acme/agent-runtime",
  projectKey: "acme/agent-runtime",
  projectDescription: "Agent runtime",
  category: "agent_compute",
  fitScore: 90,
  scoreBreakdown: null,
  confidenceScore: 0.95,
  status: "approved",
  domain: "acme.dev",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const body = `Hi Jane,

I saw your work on Acme's agent runtime and its durable job queue. I’m building Jungle Grid for teams that need to run inference, workers, and long-running AI jobs without stitching together queueing, retries, and artifact handling themselves.

I’m reaching out because agent tools need reliable compute beyond lightweight API calls. It seems close to the execution problems teams hit once workloads grow into production systems and the background execution layer starts becoming a bottleneck.

If that is a live problem for you, the shortest overview is https://junglegrid.dev.

Benedict`;

const draft: EmailDraft & { prospect: Prospect } = {
  id: "22222222-2222-4222-8222-222222222222",
  prospectId: prospect.id,
  toEmail: prospect.email,
  fromEmail: "bbg@junglegrid.dev",
  fromName: "Benedict from Jungle Grid",
  replyTo: "bbg@junglegrid.dev",
  subject: "Jungle Grid x agent runtime",
  body,
  wordCount: body.split(/\s+/).length,
  links: ["https://junglegrid.dev"],
  evidenceUrls: [prospect.emailSourceUrl, "https://acme.dev/agent-runtime"],
  personalizationClaims: ["durable job queue"],
  validationStatus: "send_ready",
  validationErrors: [],
  approvalStatus: "pending_review",
  deliveryStatus: "not_sent",
  approvedAt: null,
  approvedBy: null,
  sentAt: null,
  zeptomailMessageId: null,
  zeptomailRequestId: null,
  zeptomailError: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  prospect,
};

describe("operator frontend", () => {
  it("renders and filters the prospect table", () => {
    render(<ProspectsTable prospects={[prospect]} />);
    expect(screen.getByText("Jane Maintainer")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search prospects"), { target: { value: "missing" } });
    expect(screen.getByText("No prospects match the current filters.")).toBeInTheDocument();
  });

  it("shows manual approval controls and no auto-send toggle", () => {
    render(<DraftWorkspace initialDrafts={[draft]} />);
    expect(screen.getByRole("button", { name: /^Approve$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Reject$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Send approved$/i })).toBeDisabled();
    expect(screen.queryByText(/auto-send/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/1 link/)).toHaveLength(2);
  });

  it("renders the bounded run creation form", () => {
    render(
      <ManualRunForm
        campaigns={[{ id: "jungle-grid", name: "Jungle Grid AI execution", offer: "Jungle Grid" }]}
        defaults={{ targetCount: 17, scoreThreshold: 70, dryRun: true }}
      />,
    );
    expect(screen.getByLabelText("Target count")).toHaveValue(17);
    expect(screen.getByText("Dry-run mode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review run/i })).toBeInTheDocument();
  });

  it("rejects invalid safety settings", () => {
    expect(
      settingsSchema.safeParse({
        dailyTarget: 0,
        fitScoreThreshold: 101,
        perDomainCap: 0,
        mode: "local-template",
        modelName: "qwen2.5:3b",
        workerImage: "worker:test",
        dryRun: true,
        junglegridSite: "https://example.com",
      }).success,
    ).toBe(false);
  });
});
