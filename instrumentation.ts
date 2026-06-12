export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { resumeActiveJungleGridRuns } = await import("@/src/services/run-orchestrator");
  const { OutreachRepository } = await import("@/src/db/repository");
  const { getEnv } = await import("@/src/config/env");
  new OutreachRepository().pruneExpiredData(getEnv().DATA_RETENTION_DAYS);
  void resumeActiveJungleGridRuns();
}
