import { beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";
import {
  importProspectsFromContent,
  previewProspectImport,
} from "@/src/services/prospect-import";

describe("prospect import", () => {
  beforeEach(() => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
  });

  it("previews valid csv rows", () => {
    const preview = previewProspectImport(
      "csv",
      "name,email,company,project,category,websiteUrl\nJane,jane@example.com,Acme,Acme Platform,saas,https://acme.example",
    );
    expect(preview.validRows).toBe(1);
    expect(preview.invalidRows).toBe(0);
    expect(preview.rows[0].row).toEqual(
      expect.objectContaining({
        name: "Jane",
        project: "Acme Platform",
        category: "saas",
      }),
    );
  });

  it("reports invalid rows during preview", () => {
    const preview = previewProspectImport("csv", "name,project\n,");
    expect(preview.validRows).toBe(0);
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0].errors).toEqual(
      expect.arrayContaining(["Missing name.", "Missing project or business."]),
    );
  });

  it("imports valid json rows into prospects", () => {
    const repository = new OutreachRepository();
    const result = importProspectsFromContent(
      repository,
      "json",
      JSON.stringify([
        {
          name: "Jane Maintainer",
          email: "jane@example.com",
          company: "Acme",
          project: "Acme Platform",
          websiteUrl: "https://acme.example",
          category: "saas",
        },
        {
          name: "",
          project: "",
        },
      ]),
    );
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(repository.listProspects({ limit: 10 })).toEqual([
      expect.objectContaining({
        name: "Jane Maintainer",
        company: "Acme",
        project: "Acme Platform",
      }),
    ]);
  });
});
