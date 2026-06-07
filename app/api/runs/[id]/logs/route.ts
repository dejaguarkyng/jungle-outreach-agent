import { NextRequest, NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";
import { apiError } from "@/src/lib/api";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const repository = new OutreachRepository();
    const detail = repository.getRunDetail(id);
    if (!detail) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    const remoteLogs = detail.run.junglegridJobId
      ? await new JungleGridWorkloadProvider().getLogs(detail.run.junglegridJobId)
      : [];
    return NextResponse.json({ events: detail.events, remoteLogs });
  } catch (error) {
    return apiError(error);
  }
}
