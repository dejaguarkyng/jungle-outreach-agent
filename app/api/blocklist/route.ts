import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import { apiError } from "@/src/lib/api";

const createSchema = z
  .object({
    email: z.string().email().optional(),
    domain: z.string().min(3).optional(),
    reason: z.string().min(3).max(300),
  })
  .refine((value) => value.email || value.domain, "Email or domain is required.");

export function GET() {
  return NextResponse.json(new OutreachRepository().listBlocked());
}

export async function POST(request: NextRequest) {
  try {
    const input = createSchema.parse(await request.json());
    const repository = new OutreachRepository();
    repository.addBlockedContact(input);
    return NextResponse.json(repository.listBlocked(), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = z.string().uuid().parse(request.nextUrl.searchParams.get("id"));
    const repository = new OutreachRepository();
    repository.removeBlockedContact(id);
    return NextResponse.json(repository.listBlocked());
  } catch (error) {
    return apiError(error);
  }
}
