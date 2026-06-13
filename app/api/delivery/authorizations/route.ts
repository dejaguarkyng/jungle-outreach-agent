import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import { apiError } from "@/src/lib/api";

const authorizationInput = z.object({
  workspaceId: z.string().min(1).default("default"),
  provider: z.string().min(1),
  destinationPattern: z.string().min(1),
  permissions: z.array(z.string().min(1)).default([]),
  authorizedBy: z.string().min(1).default("operator"),
  expiresAt: z.string().datetime().nullable().optional(),
});

export function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "default";
  return NextResponse.json(
    new OutreachRepository().listProviderAuthorizations(workspaceId),
  );
}

export async function POST(request: NextRequest) {
  try {
    const input = authorizationInput.parse(await request.json());
    return NextResponse.json(
      new OutreachRepository().saveProviderAuthorization(input),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const repository = new OutreachRepository();
  repository.revokeProviderAuthorization(id);
  return NextResponse.json({ revoked: true });
}
