import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import {
  importProspectsFromContent,
  previewProspectImport,
} from "@/src/services/prospect-import";
import { apiError } from "@/src/lib/api";

const importRequestSchema = z.object({
  format: z.enum(["csv", "json"]),
  content: z.string().min(1),
  dryRun: z.boolean().default(true),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const input = importRequestSchema.parse(await request.json());
    if (input.dryRun) {
      return NextResponse.json(previewProspectImport(input.format, input.content));
    }
    return NextResponse.json(
      importProspectsFromContent(new OutreachRepository(), input.format, input.content),
    );
  } catch (error) {
    return apiError(error);
  }
}
