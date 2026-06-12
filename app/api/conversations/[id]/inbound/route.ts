import { NextResponse } from "next/server";
import { z } from "zod";
import { contactPointTypeSchema } from "@/src/domain/schemas";
import { ConversationService } from "@/src/services/conversation-service";

const inputSchema = z.object({
  channel: contactPointTypeSchema,
  body: z.string().trim().min(1),
  externalMessageId: z.string().trim().min(1).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const input = inputSchema.parse(await request.json());
    const result = await new ConversationService().processInbound({
      conversationId: id,
      channel: input.channel,
      body: input.body,
      externalMessageId: input.externalMessageId ?? null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Inbound reply ingestion failed." },
      { status: 400 },
    );
  }
}
