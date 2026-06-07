import { NextResponse } from "next/server";
import {
  ZeptoMailProviderError,
  ZeptoMailService,
} from "@/apps/api/src/services/zeptomail";
import { apiError } from "@/src/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await new ZeptoMailService().sendTest();
    return NextResponse.json({
      message: "ZeptoMail test email sent to ZEPTOMAIL_TEST_RECIPIENT.",
      result,
    });
  } catch (error) {
    if (error instanceof ZeptoMailProviderError) {
      return NextResponse.json({ error: error.message, providerError: error.normalized }, { status: 502 });
    }
    return apiError(error);
  }
}
