import { NextRequest, NextResponse } from "next/server";
import { OutreachService } from "@/src/services/outreach-service";
import { ZeptoMailProviderError } from "@/apps/api/src/services/zeptomail";
import { apiError } from "@/src/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await new OutreachService().sendApprovedDraft(id));
  } catch (error) {
    if (error instanceof ZeptoMailProviderError) {
      return NextResponse.json({ error: error.message, providerError: error.normalized }, { status: 502 });
    }
    return apiError(error);
  }
}
