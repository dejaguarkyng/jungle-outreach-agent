import { NextRequest, NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";
import { businessProfileInputSchema } from "@/packages/shared/src";
import { apiError } from "@/src/lib/api";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    profile: new OutreachRepository().getBusinessProfile(),
  });
}

export async function PUT(request: NextRequest) {
  try {
    const input = businessProfileInputSchema.parse(await request.json());
    return NextResponse.json({
      profile: new OutreachRepository().saveBusinessProfile(input),
    });
  } catch (error) {
    return apiError(error);
  }
}
