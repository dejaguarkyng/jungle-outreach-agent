import { NextResponse } from "next/server";
import { DeliveryService } from "@/src/delivery/service";

export function GET() {
  return NextResponse.json({ adapters: new DeliveryService().statuses() });
}
