import fs from "node:fs";
import { OutreachRepository } from "@/src/db/repository";

export function pruneExpiredDeliveryScreenshots(
  repository = new OutreachRepository(),
): number {
  let deleted = 0;
  for (const screenshot of repository.listExpiredDeliveryScreenshots()) {
    try {
      fs.rmSync(screenshot.path, { force: true });
    } finally {
      repository.deleteDeliveryScreenshot(screenshot.id);
      deleted += 1;
    }
  }
  return deleted;
}
