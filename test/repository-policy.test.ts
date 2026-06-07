import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (
      [
        "node_modules",
        ".next",
        ".git",
        "data",
        ".venv",
        ".pytest_cache",
        ".pytest_tmp",
        ".claude",
        "artifacts",
        "coverage",
        "exports",
        "__pycache__",
        ".jungle_outreach_agent.egg-info.removed",
      ].includes(entry.name) ||
      entry.name.endsWith(".egg-info") ||
      entry.name.endsWith(".pyc") ||
      entry.name.startsWith(".env")
    ) {
      return [];
    }
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  });
}

describe("repository policy", () => {
  it("contains no hosted model or removed mail-provider credential names", () => {
    const forbidden = [
      ["OPEN", "AI_API_KEY"].join(""),
      ["DEEP", "SEEK_API_KEY"].join(""),
      ["ANTH", "ROPIC_API_KEY"].join(""),
      ["GEM", "INI_API_KEY"].join(""),
      ["GOOGLE", "_CLIENT_ID"].join(""),
      ["GOOGLE", "_CLIENT_SECRET"].join(""),
      ["GOOGLE", "_REFRESH_TOKEN"].join(""),
      ["GMAIL", "_SEND_AS"].join(""),
      ["users.messages.", "send"].join(""),
      ["users.drafts.", "send"].join(""),
    ];
    const source = files(process.cwd())
      .filter((file) => !file.endsWith("tsconfig.tsbuildinfo"))
      .filter((file) => !file.endsWith("package-lock.json"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    for (const name of forbidden) expect(source).not.toContain(name);
  });

  it("ships CI, security, worker image, and release workflows", () => {
    for (const name of ["ci.yml", "security.yml", "worker-image.yml", "release.yml"]) {
      expect(fs.existsSync(path.join(".github", "workflows", name))).toBe(true);
    }
  });
});
