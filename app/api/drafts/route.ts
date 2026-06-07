import { NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(new OutreachRepository().listDrafts());
}
