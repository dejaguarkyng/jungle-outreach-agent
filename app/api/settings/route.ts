import { NextRequest, NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";
import { settingsSchema } from "@/src/domain/schemas";
import { apiError } from "@/src/lib/api";
import { getEnv } from "@/src/config/env";
import { getZeptoMailStatus } from "@/apps/api/src/services/zeptomail";

export function GET() {
  const env = getEnv();
  return NextResponse.json({
    settings: new OutreachRepository().getSettings(),
    secrets: {
      zeptoMailApiKey: Boolean(env.ZEPTOMAIL_API_KEY),
      zeptoMailApiBase: Boolean(env.ZEPTOMAIL_API_BASE),
      githubToken: Boolean(env.GITHUB_TOKEN),
      jungleGridApiKey: Boolean(env.JUNGLEGRID_API_KEY),
    },
    zeptomail: getZeptoMailStatus(),
    jungleGridApiBase: env.JUNGLEGRID_API_BASE,
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const settings = settingsSchema.parse(await request.json());
    return NextResponse.json(new OutreachRepository().saveSettings(settings));
  } catch (error) {
    return apiError(error);
  }
}
