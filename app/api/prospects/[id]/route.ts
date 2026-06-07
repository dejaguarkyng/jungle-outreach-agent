import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import { apiError } from "@/src/lib/api";
import { prospectCategorySchema, prospectStatusSchema } from "@/src/domain/schemas";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  roleTitle: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  category: prospectCategorySchema.optional(),
  status: prospectStatusSchema.optional(),
  research: z
    .object({
      summary: z.string().min(1),
      personalizationDetail: z.string().min(1),
      junglegridRelevance: z.string().min(1),
      evidenceUrls: z.array(z.string().url()).min(1),
    })
    .optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const repository = new OutreachRepository();
  const prospect = repository.getProspect(id);
  if (!prospect) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  return NextResponse.json({
    prospect,
    research: repository.getResearch(id),
    draft: repository.getDraftByProspect(id),
    contactHistory: repository
      .listDrafts()
      .filter((item) => item.prospect.email === prospect.email || item.prospect.domain === prospect.domain)
      .map((item) => ({
        draftId: item.id,
        approvalStatus: item.approvalStatus,
        deliveryStatus: item.deliveryStatus,
        createdAt: item.createdAt,
        email: item.prospect.email,
      })),
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
    const { research, ...prospectPatch } = payload;
    let prospect = repository.getProspect(id);
    if (!prospect) throw new Error("Prospect not found.");
    const note = research ? repository.saveResearch(id, research) : repository.getResearch(id);
    if (Object.keys(prospectPatch).length) {
      prospect = repository.updateProspect(id, prospectPatch);
    } else {
      prospect = repository.getProspect(id)!;
    }
    return NextResponse.json({ prospect, research: note });
  } catch (error) {
    return apiError(error);
  }
}
