import { NextRequest, NextResponse } from "next/server";
import { campaignConfigurationSchema } from "@/packages/shared/src";
import { OutreachRepository } from "@/src/db/repository";
import { apiError } from "@/src/lib/api";

export const dynamic = "force-dynamic";

export function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return params.then(({ id }) => {
    const campaign = new OutreachRepository().getCampaign(id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    return NextResponse.json({ campaign });
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = campaignConfigurationSchema.parse(await request.json());
    if (input.campaignId !== id) {
      throw new Error("Campaign ID in the payload must match the route.");
    }
    return NextResponse.json({
      campaign: new OutreachRepository().saveCampaign(input),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  new OutreachRepository().deleteCampaign(id);
  return NextResponse.json({ deleted: true });
}
