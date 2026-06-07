import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { outreachModeSchema } from "@/packages/shared/src";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";
import { apiError } from "@/src/lib/api";

const schema = z.object({
  mode: outreachModeSchema.exclude(["local-template"]).default("junglegrid-template"),
  target: z.number().int().min(1).max(3).default(1),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json().catch(() => ({})));
    const estimate = await new JungleGridWorkloadProvider().estimate(input.mode, input.target);
    return NextResponse.json({
      ok: true,
      message: "Jungle Grid accepted the worker contract for estimation. No job was started.",
      estimate,
    });
  } catch (error) {
    return apiError(error);
  }
}
