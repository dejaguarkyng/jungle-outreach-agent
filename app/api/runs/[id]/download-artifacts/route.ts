import { NextRequest, NextResponse } from "next/server";
import { OutreachRepository } from "@/src/db/repository";
import { JungleGridWorkloadProvider } from "@/src/providers/junglegrid-workload-provider";
import { validateArtifactBundle } from "@/src/services/artifact-ingestion";
import { apiError } from "@/src/lib/api";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const repository = new OutreachRepository();
    const run = repository.getRun(id);
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    if (!run.junglegridJobId) {
      return NextResponse.json({ error: "This run has no Jungle Grid artifacts." }, { status: 409 });
    }
    const bundle = await new JungleGridWorkloadProvider().downloadArtifactBundle(
      run.junglegridJobId,
    );
    const settings = repository.getSettings();
    const validated = validateArtifactBundle(bundle, {
      fitScoreThreshold: settings.fitScoreThreshold,
      maxPerDomain: settings.perDomainCap,
    });
    return new NextResponse(JSON.stringify(validated, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="jungle-outreach-${id}-artifacts.json"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
