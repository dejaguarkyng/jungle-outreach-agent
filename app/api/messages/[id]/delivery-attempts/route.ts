import { NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return NextResponse.json(new OutreachRepository().listDeliveryAttempts(id));
}
