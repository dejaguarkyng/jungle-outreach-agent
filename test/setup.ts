import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetEnvForTests } from "@/src/config/env";

process.env.DATABASE_URL = ":memory:";
process.env.JUNGLEGRID_SITE = "https://junglegrid.dev";
process.env.JUNGLEGRID_MODE = "local-template";
process.env.JUNGLEGRID_API_BASE = "https://api.junglegrid.dev";
process.env.JUNGLEGRID_DEFAULT_IMAGE = "ghcr.io/jungle-grid/outreach-qwen-worker:latest";
process.env.OLLAMA_MODEL = "qwen2.5:3b";
process.env.MAX_DRAFTS_PER_DOMAIN = "2";
process.env.DRY_RUN = "true";
process.env.EMAIL_SEND_MODE = "disabled";
process.env.ZEPTOMAIL_FROM_EMAIL = "bbg@junglegrid.dev";
process.env.ZEPTOMAIL_FROM_NAME = "Benedict from Jungle Grid";
process.env.ZEPTOMAIL_REPLY_TO = "bbg@junglegrid.dev";

afterEach(() => {
  cleanup();
  resetEnvForTests();
});
