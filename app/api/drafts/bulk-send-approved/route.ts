import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import { OutreachService } from "@/src/services/outreach-service";
import { ZeptoMailProviderError } from "@/apps/api/src/services/zeptomail";
import { apiError } from "@/src/lib/api";

const bulkSendSchema = z.object({
  draftIds: z.array(z.string().min(1)).optional(),
  confirmationPhrase: z.literal("SEND APPROVED DRAFTS"),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = bulkSendSchema.parse(await request.json());
    const repository = new OutreachRepository();
    const draftIds =
      payload.draftIds ??
      repository
        .listDrafts()
        .filter(
          (draft) =>
            draft.approvalStatus === "approved" &&
            (draft.deliveryStatus === "not_sent" || draft.deliveryStatus === "failed"),
        )
        .map((draft) => draft.id);

    const service = new OutreachService(repository);
    const results = [];
    for (const draftId of draftIds) {
      const draft = repository.getDraft(draftId);
      if (!draft || draft.approvalStatus !== "approved") {
        results.push({ draftId, ok: false, error: "Draft is not approved." });
        continue;
      }
      try {
        results.push({ draftId, ok: true, draft: await service.sendApprovedDraft(draftId) });
      } catch (error) {
        results.push({
          draftId,
          ok: false,
          error: error instanceof Error ? error.message : "ZeptoMail send failed.",
          providerError: error instanceof ZeptoMailProviderError ? error.normalized : null,
        });
      }
    }
    return NextResponse.json({ results });
  } catch (error) {
    return apiError(error);
  }
}
