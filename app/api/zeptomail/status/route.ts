import { NextResponse } from "next/server";
import { getZeptoMailStatus } from "@/apps/api/src/services/zeptomail";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getZeptoMailStatus());
}
