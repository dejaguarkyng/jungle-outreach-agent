import pino from "pino";
import { getEnv } from "@/src/config/env";

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  redact: {
    paths: [
      "ZEPTOMAIL_API_KEY",
      "GITHUB_TOKEN",
      "JUNGLEGRID_API_KEY",
      "*.access_token",
      "*.refresh_token",
      "*.authorization",
    ],
    censor: "[REDACTED]",
  },
});
