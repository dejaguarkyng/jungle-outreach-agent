import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachService } from "@/src/services/outreach-service";
import { apiError } from "@/src/lib/api";

const bulkApproveSchema = z.object({
  draftIds: z.array(z.string().min(1)).min(1),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const payload = bulkApproveSchema.parse(await request.json());
    const service = new OutreachService();
    const results = payload.draftIds.map((draftId) => {
      try {
        return { draftId, ok: true, draft: service.approveDraft(draftId) };
      } catch (error) {
        return {
          draftId,
          ok: false,
          error: error instanceof Error ? error.message : "Approval failed.",
        };
      }
    });
    return NextResponse.json({ results });
  } catch (error) {
    return apiError(error);
  }
}
