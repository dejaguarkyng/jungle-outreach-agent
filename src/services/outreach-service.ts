import { OutreachRepository } from "@/src/db/repository";
import {
  validateEmailDraftArtifact,
} from "@/src/safety/email-validation";
import type { EmailDraft } from "@/src/domain/schemas";
import {
  ZeptoMailProviderError,
  ZeptoMailService,
} from "@/apps/api/src/services/zeptomail";

function startOfToday(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export class OutreachService {
  constructor(
    readonly repository = new OutreachRepository(),
  ) {}

  approveDraft(localDraftId: string, approvedBy = "operator"): EmailDraft {
    const draft = this.getSendableDraft(localDraftId);
    if (draft.validationStatus !== "send_ready" || draft.validationErrors.length > 0) {
      throw new Error("Draft validation must pass before approval.");
    }
    return this.repository.setDraftApproval(localDraftId, "approved", approvedBy);
  }

  rejectDraft(localDraftId: string): EmailDraft {
    const draft = this.repository.getDraft(localDraftId);
    if (!draft) throw new Error("Draft not found.");
    return this.repository.markDraftRejected(localDraftId);
  }

  async sendApprovedDraft(localDraftId: string): Promise<EmailDraft> {
    const settings = this.repository.getSettings();
    if (settings.dryRun) throw new Error("Dry-run mode is enabled; ZeptoMail send is blocked.");
    const draft = this.getSendableDraft(localDraftId);
    if (draft.approvalStatus !== "approved") throw new Error("Only approved drafts can be sent.");
    if (draft.deliveryStatus === "sent") throw new Error("Draft has already been sent.");
    if (draft.deliveryStatus === "sending") throw new Error("Draft is already sending.");
    const prospect = this.repository.getProspect(draft.prospectId)!;
    this.assertDraftCaps(prospect.domain, settings.dailyTarget, settings.perDomainCap);

    this.repository.setDraftDelivery(draft.id, "sending", { zeptomailError: null });
    try {
      const result = await new ZeptoMailService().send({
        toEmail: draft.toEmail,
        toName: prospect.name,
        subject: draft.subject,
        body: draft.body,
      });
      const sent = this.repository.setDraftDelivery(draft.id, "sent", {
        zeptomailMessageId: result.providerMessageId,
        zeptomailRequestId: result.requestId,
        zeptomailError: null,
      });
      this.repository.audit("operator", "zeptomail.sent", "email_draft", draft.id, "success", {
        requestId: result.requestId,
        providerMessageId: result.providerMessageId,
      });
      return sent;
    } catch (error) {
      const normalized =
        error instanceof ZeptoMailProviderError
          ? error.normalized
          : {
              statusCode: null,
              code: null,
              message: error instanceof Error ? error.message : "ZeptoMail send failed.",
              rawError: null,
            };
      this.repository.setDraftDelivery(draft.id, "failed", {
        zeptomailRequestId:
          typeof normalized.rawError === "object" &&
          normalized.rawError &&
          "request_id" in normalized.rawError
            ? String(normalized.rawError.request_id)
            : null,
        zeptomailError: JSON.stringify({
          statusCode: normalized.statusCode,
          code: normalized.code,
          message: normalized.message,
        }),
      });
      this.repository.audit("operator", "zeptomail.sent", "email_draft", draft.id, "failure", {
        statusCode: normalized.statusCode,
        code: normalized.code,
        message: normalized.message,
      });
      throw error;
    }
  }

  private getSendableDraft(localDraftId: string): EmailDraft {
    const draft = this.repository.getDraft(localDraftId);
    if (!draft) throw new Error("Draft not found.");
    const prospect = this.repository.getProspect(draft.prospectId);
    if (!prospect) throw new Error("Prospect not found.");
    if (
      this.repository.isBlocked(prospect.email, prospect.domain) ||
      this.repository.isSuppressed(prospect.email, prospect.domain)
    ) {
      throw new Error("Contact is blocked or suppressed.");
    }
    if (draft.validationStatus !== "send_ready" || draft.validationErrors.length > 0) {
      throw new Error("Draft validation failed.");
    }
    if (!draft.evidenceUrls.length || !draft.personalizationClaims.length || !prospect.emailSourceUrl) {
      throw new Error("Public evidence and email source URL are required.");
    }
    const research = this.repository.getResearch(prospect.id);
    this.assertPersistedDraftValid(prospect, research, draft);
    return draft;
  }

  private assertDraftCaps(domain: string, dailyTarget: number, perDomainCap: number): void {
    const today = startOfToday();
    if (this.repository.countDraftsSince(today) >= dailyTarget) {
      throw new Error(`Daily ZeptoMail send cap of ${dailyTarget} has been reached.`);
    }
    if (this.repository.countDomainDraftsSince(domain, today) >= perDomainCap) {
      throw new Error(`Daily per-domain send cap of ${perDomainCap} has been reached for ${domain}.`);
    }
  }

  private assertPersistedDraftValid(
    prospect: ReturnType<OutreachRepository["getProspect"]> & {},
    research: ReturnType<OutreachRepository["getResearch"]>,
    draft: NonNullable<ReturnType<OutreachRepository["getDraft"]>>,
  ): void {
    if (!prospect || prospect.fitScore === null) throw new Error("A fit score is required.");
    const settings = this.repository.getSettings();
    const evidenceUrls = [
      ...new Set([prospect.emailSourceUrl, ...draft.evidenceUrls, ...(research?.evidenceUrls ?? [])]),
    ];
    const personalizationClaims = [
      ...new Set([
        ...draft.personalizationClaims,
        ...(research?.personalizationDetail ? [research.personalizationDetail] : []),
      ]),
    ];
    const validation = validateEmailDraftArtifact(
      [
        {
          prospect_id: prospect.id,
          name: prospect.name,
          email: prospect.email,
          email_source_url: prospect.emailSourceUrl,
          project: prospect.project,
          category: prospect.category,
          fit_score: prospect.fitScore,
          subject: draft.subject,
          body: draft.body,
          word_count: draft.wordCount,
          links: draft.links,
          evidence_urls: evidenceUrls,
          personalization_claims: personalizationClaims,
          model_mode: "template",
          validation_status: draft.validationStatus,
          validation_errors: draft.validationErrors,
        },
      ],
      {
        fitScoreThreshold: settings.fitScoreThreshold,
        maxPerDomain: settings.perDomainCap,
      },
    );
    if (!validation.valid) {
      throw new Error(`Draft artifact validation failed: ${validation.errors.join(" ")}`);
    }
  }
}
