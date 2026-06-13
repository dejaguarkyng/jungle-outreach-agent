import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OutreachRepository } from "@/src/db/repository";
import { encryptBrowserSession } from "@/src/security/browser-session";
import { apiError } from "@/src/lib/api";

const browserSessionInput = z.object({
  workspaceId: z.string().min(1).default("default"),
  provider: z.string().min(1).default("browser"),
  storageState: z.object({
    cookies: z.array(z.record(z.unknown())).default([]),
    origins: z.array(z.record(z.unknown())).default([]),
  }),
  expiresAt: z.string().datetime().nullable().optional(),
});

export function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "default";
  const provider = request.nextUrl.searchParams.get("provider") ?? "browser";
  const session = new OutreachRepository().getBrowserSession(workspaceId, provider);
  return NextResponse.json({
    workspaceId,
    provider,
    configured: Boolean(session),
    expiresAt: session?.expiresAt ?? null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const input = browserSessionInput.parse(await request.json());
    const encrypted = encryptBrowserSession(input.storageState);
    new OutreachRepository().saveBrowserSession({
      workspaceId: input.workspaceId,
      provider: input.provider,
      encryptedPayload: encrypted.encryptedPayload,
      iv: encrypted.iv,
      tag: encrypted.tag,
      expiresAt: input.expiresAt,
    });
    return NextResponse.json(
      {
        workspaceId: input.workspaceId,
        provider: input.provider,
        configured: true,
        expiresAt: input.expiresAt ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export function DELETE(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "default";
  const provider = request.nextUrl.searchParams.get("provider") ?? "browser";
  new OutreachRepository().revokeBrowserSession(workspaceId, provider);
  return NextResponse.json({ revoked: true });
}
