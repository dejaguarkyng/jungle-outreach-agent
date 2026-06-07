import { NextRequest, NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const minScore = params.get("minScore");
  const prospects = new OutreachRepository().listProspects({
    search: params.get("search") || undefined,
    category: params.get("category") || undefined,
    status: params.get("status") || undefined,
    source: params.get("source") || undefined,
    from: params.get("from") || undefined,
    minScore: minScore ? Number(minScore) : undefined,
    limit: Math.min(Number(params.get("limit") || 250), 1000),
  });
  return NextResponse.json(prospects);
}
