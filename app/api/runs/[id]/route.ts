import { NextRequest, NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detail = new OutreachRepository().getRunDetail(id);
  if (!detail) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const format = request.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const rows = [
      ["prospect_id", "name", "email", "project", "fit_score", "outcome", "reason"],
      ...detail.prospects.map((entry) => {
        const item = entry as {
          outcome: string;
          reason?: string;
          prospect: { id: string; name: string; email: string; project: string; fitScore: number | null };
        };
        return [
          item.prospect.id,
          item.prospect.name,
          item.prospect.email,
          item.prospect.project,
          item.prospect.fitScore ?? "",
          item.outcome,
          item.reason ?? "",
        ];
      }),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="outreach-run-${id}.csv"`,
      },
    });
  }
  return NextResponse.json(detail);
}
