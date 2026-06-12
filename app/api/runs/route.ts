import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import { runOutreach } from "@/src/services/run-orchestrator";
import { apiError } from "@/src/lib/api";
import { prospectCategorySchema } from "@/src/domain/schemas";
import { outreachModeSchema } from "@/packages/shared/src";
import { getEnv } from "@/src/config/env";

const runRequestSchema = z.object({
  targetCount: z.number().int().min(1).max(100).default(17),
  mode: outreachModeSchema.default("junglegrid-qwen"),
  category: prospectCategorySchema.optional(),
  scoreThreshold: z.number().int().min(0).max(100).optional(),
  dryRun: z.boolean().default(true),
  campaignId: z.string().trim().min(1).default("jungle-grid"),
});

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(new OutreachRepository().listRuns());
}

export async function POST(request: NextRequest) {
  try {
    const options = runRequestSchema.parse(await request.json());
    if (options.targetCount > getEnv().MAX_DRAFTS_PER_RUN) {
      throw new Error(`Target count exceeds MAX_DRAFTS_PER_RUN (${getEnv().MAX_DRAFTS_PER_RUN}).`);
    }
    const repository = new OutreachRepository();
    const run = repository.createRun(
      "manual",
      options.targetCount,
      JSON.stringify(options),
      options.mode,
    );
    repository.addRunEvent(run.id, "queued", "Manual run accepted by the local server.");

    void runOutreach(options, undefined, run.id).catch(() => {
      // The orchestrator persists errors. The UI polls the run records.
    });
    return NextResponse.json({ runId: run.id, run, accepted: true }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
