import { NextResponse } from "next/server";
import { z } from "zod";
import { ConversationService } from "@/src/services/conversation-service";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const raw = await request.json().catch(() => ({}));
    const input = inputSchema.parse(raw);
    const results = await new ConversationService().processDueFollowUps(input.limit);
    return NextResponse.json({
      evaluated: results.length,
      completed: results.filter((result) => result.status === "completed").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Scheduled conversation evaluation failed.",
      },
      { status: 400 },
    );
  }
}
