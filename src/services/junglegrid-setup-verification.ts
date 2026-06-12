import {
  JungleGridWorkloadProvider,
  type JungleGridArtifact,
  type JungleGridJob,
  type JungleGridJobEvent,
  type JungleGridLogEntry,
} from "@/src/providers/junglegrid-workload-provider";
import { requiredArtifactNames } from "@/packages/shared/src";

type SetupProvider = {
  status(): Promise<{ configured: boolean; reachable: boolean; message: string }>;
  estimate(mode: "junglegrid-template", target: number): Promise<unknown>;
  submit(mode: "junglegrid-template", target: number): Promise<JungleGridJob>;
  waitForCompletion(jobId: string): Promise<JungleGridJob>;
  getEvents(jobId: string): Promise<JungleGridJobEvent[]>;
  getLogs(jobId: string): Promise<JungleGridLogEntry[]>;
  listArtifacts(jobId: string): Promise<JungleGridArtifact[]>;
};

export type JungleGridSetupVerification = {
  configured: true;
  reachable: true;
  estimate: unknown;
  jobId: string;
  status: "completed";
  events: number;
  logs: number;
  artifacts: string[];
};

export async function verifyJungleGridSetup(
  provider: SetupProvider = new JungleGridWorkloadProvider(),
): Promise<JungleGridSetupVerification> {
  const status = await provider.status();
  if (!status.configured || !status.reachable) {
    throw new Error(status.message);
  }

  const estimate = await provider.estimate("junglegrid-template", 1);
  const submitted = await provider.submit("junglegrid-template", 1);
  const completed = await provider.waitForCompletion(submitted.job_id);
  if (completed.status !== "completed") {
    throw new Error(
      `Jungle Grid setup job ended with ${completed.status}: ${
        completed.status_reason ?? "No status reason provided."
      }`,
    );
  }

  const [events, logs, artifacts] = await Promise.all([
    provider.getEvents(submitted.job_id),
    provider.getLogs(submitted.job_id),
    provider.listArtifacts(submitted.job_id),
  ]);
  const names = artifacts.map((artifact) => artifact.filename.split("/").pop() ?? artifact.filename);
  const missing = requiredArtifactNames.filter((name) => !names.includes(name));
  if (missing.length > 0) {
    throw new Error(`Jungle Grid setup job is missing artifacts: ${missing.join(", ")}.`);
  }

  return {
    configured: true,
    reachable: true,
    estimate,
    jobId: submitted.job_id,
    status: "completed",
    events: events.length,
    logs: logs.length,
    artifacts: names,
  };
}
