import { NextRequest, NextResponse } from "next/server";
import { OutreachService } from "@/src/services/outreach-service";
import { apiError } from "@/src/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return NextResponse.json(new OutreachService().rejectDraft(id));
  } catch (error) {
    return apiError(error);
  }
}
