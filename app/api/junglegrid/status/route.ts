import { NextResponse } from "next/server";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";

export async function GET() {
  return NextResponse.json(await new JungleGridWorkloadProvider().status());
}
