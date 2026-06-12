import { NextResponse } from "next/server";
import { ConversationService } from "@/src/services/conversation-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const message = await new ConversationService().approveMessage(id);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Message approval failed." },
      { status: 400 },
    );
  }
}
