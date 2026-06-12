import { NextRequest, NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";
import { apiError } from "@/src/lib/api";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const repository = new OutreachRepository();
    const run = repository.getRun(id);
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    const execution = repository.getLatestJungleGridExecution(id);
    if (!execution?.junglegridJobId) {
      return NextResponse.json({ error: "Run has no active Jungle Grid job." }, { status: 409 });
    }
    if (["completed", "failed", "cancelled", "timed_out", "blocked"].includes(execution.executionPhase)) {
      return NextResponse.json({ error: "Jungle Grid job is already terminal." }, { status: 409 });
    }

    await new JungleGridWorkloadProvider().cancelJob(execution.junglegridJobId);
    repository.updateJungleGridExecution(execution.id, {
      executionPhase: "cancelled",
      completedAt: new Date().toISOString(),
      statusMessage: "Cancellation requested by operator.",
      failureReason: "Cancellation requested by operator.",
    });
    repository.updateRun(id, {
      phase: "cancelled",
      error: "Cancellation requested by operator.",
    });
    repository.addRunEvent(id, "cancelled", "Cancellation requested by operator.", "warn", {
      jobId: execution.junglegridJobId,
    });
    return NextResponse.json({ cancelled: true, jobId: execution.junglegridJobId });
  } catch (error) {
    return apiError(error);
  }
}
