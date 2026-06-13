import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  businessArchetypeSchema,
  campaignConfigurationSchema,
} from "@/packages/shared/src";
import { OutreachRepository } from "@/src/db/repository";
import {
  buildCampaignFromProfile,
  listTemplateCampaignConfigurations,
} from "@/src/services/campaign-config";
import { apiError } from "@/src/lib/api";

const presetRequestSchema = z.object({
  mode: z.literal("preset"),
  campaignId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  archetype: businessArchetypeSchema,
});

const configRequestSchema = z.object({
  mode: z.literal("config").default("config"),
  campaign: campaignConfigurationSchema,
});

export const dynamic = "force-dynamic";

export function GET() {
  const repository = new OutreachRepository();
  return NextResponse.json({
    campaigns: repository.listCampaigns(),
    templates: listTemplateCampaignConfigurations(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const repository = new OutreachRepository();
    if (payload?.mode === "preset") {
      const input = presetRequestSchema.parse(payload);
      const campaign = buildCampaignFromProfile(repository.getBusinessProfile(), input);
      return NextResponse.json(
        { campaign: repository.saveCampaign(campaign) },
        { status: 201 },
      );
    }
    const input = configRequestSchema.parse(payload);
    return NextResponse.json(
      { campaign: repository.saveCampaign(input.campaign) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
