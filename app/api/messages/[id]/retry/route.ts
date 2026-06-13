import { NextResponse } from "next/server";
import { DeliveryService } from "@/src/delivery/service";
import { apiError } from "@/src/lib/api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await new DeliveryService().sendMessage(id));
  } catch (error) {
    return apiError(error);
  }
}
