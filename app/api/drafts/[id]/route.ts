import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import { apiError } from "@/src/lib/api";
import { extractLinks, validateDraftContent } from "@/src/safety/email-validation";

const patchSchema = z
  .object({
    subject: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    for (const error of validateDraftContent(value.subject, value.body).errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  });

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const repository = new OutreachRepository();
  const draft = repository.getDraft(id);
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  return NextResponse.json({
    draft,
    prospect: repository.getProspect(draft.prospectId),
    research: repository.getResearch(draft.prospectId),
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = patchSchema.parse(await request.json());
    const repository = new OutreachRepository();
    const current = repository.getDraft(id);
    if (!current) throw new Error("Draft not found.");
    if (current.approvalStatus !== "pending_review" && current.deliveryStatus !== "failed") {
      throw new Error("Only pending-review or failed drafts can be edited.");
    }
    const validation = validateDraftContent(payload.subject, payload.body);
    const draft = repository.saveDraft(current.prospectId, {
      subject: payload.subject,
      body: payload.body,
      wordCount: validation.wordCount,
      links: extractLinks(`${payload.subject}\n${payload.body}`),
      evidenceUrls: current.evidenceUrls,
      personalizationClaims: current.personalizationClaims,
      validationStatus: "send_ready",
      validationErrors: [],
    });
    return NextResponse.json(draft);
  } catch (error) {
    return apiError(error);
  }
}
