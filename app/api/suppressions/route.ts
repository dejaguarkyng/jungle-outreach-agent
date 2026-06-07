import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import { apiError } from "@/src/lib/api";

const suppressionSchema = z
  .object({
    email: z.string().email().optional(),
    domain: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1),
    source: z.string().trim().min(1).default("operator"),
  })
  .refine((value) => Boolean(value.email || value.domain), {
    message: "Either email or domain is required.",
  });

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(new OutreachRepository().listSuppressions());
}

export async function POST(request: NextRequest) {
  try {
    const payload = suppressionSchema.parse(await request.json());
    const repository = new OutreachRepository();
    repository.addSuppression(payload);
    return NextResponse.json(repository.listSuppressions());
  } catch (error) {
    return apiError(error);
  }
}
