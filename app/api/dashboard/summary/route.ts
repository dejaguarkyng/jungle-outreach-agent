import { NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";
import { getZeptoMailStatus } from "@/apps/api/src/services/zeptomail";

export const dynamic = "force-dynamic";

export function GET() {
  const repository = new OutreachRepository();
  return NextResponse.json({ ...repository.dashboardSummary(), zeptomail: getZeptoMailStatus() });
}
