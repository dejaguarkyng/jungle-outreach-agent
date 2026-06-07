import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import { apiError } from "@/src/lib/api";

const schema = z.object({ reason: z.string().min(3).max(300) });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { reason } = schema.parse(await request.json());
    const repository = new OutreachRepository();
    repository.blockContact(id, reason);
    return NextResponse.json({ prospect: repository.getProspect(id) });
  } catch (error) {
    return apiError(error);
  }
}
