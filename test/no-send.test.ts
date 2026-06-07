import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

describe("manual-send architecture", () => {
  it("contains no removed provider send API invocation or auto-send route", () => {
    const files = [...sourceFiles(path.resolve("src")), ...sourceFiles(path.resolve("app"))];
    const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(source).not.toContain(["users.messages.", "send"].join(""));
    expect(source).not.toContain(["users.drafts.", "send"].join(""));
    expect(source).not.toMatch(/auto[-_ ]?send/i);
    expect(source).not.toMatch(/scheduled[-_ ]?send/i);
  });
});
