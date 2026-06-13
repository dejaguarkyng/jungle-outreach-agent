import { beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";
import {
  importSuppressionsFromContent,
  previewSuppressionImport,
} from "@/src/services/suppression-import";

describe("suppression import", () => {
  beforeEach(() => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
  });

  it("previews valid suppression csv rows", () => {
    const preview = previewSuppressionImport(
      "csv",
      "email,domain,reason,source\n,no-contact.example,manual suppression,operator_import",
    );
    expect(preview.validRows).toBe(1);
    expect(preview.invalidRows).toBe(0);
  });

  it("rejects invalid suppression rows", () => {
    const preview = previewSuppressionImport("csv", "email,domain,reason\n,,");
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0].errors).toEqual(
      expect.arrayContaining(["Either email or domain is required.", "Reason is required."]),
    );
  });

  it("imports valid suppressions into the repository", () => {
    const repository = new OutreachRepository();
    const result = importSuppressionsFromContent(
      repository,
      "json",
      JSON.stringify([
        { domain: "no-contact.example", reason: "manual suppression" },
        { email: "", domain: "", reason: "" },
      ]),
    );
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(repository.listSuppressions()).toEqual([
      expect.objectContaining({
        domain: "no-contact.example",
        reason: "manual suppression",
      }),
    ]);
  });
});
