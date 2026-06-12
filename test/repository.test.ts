import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import { closeDatabase, getDatabase } from "@/src/db/database";
import { OutreachRepository } from "@/src/db/repository";
import { resetEnvForTests } from "@/src/config/env";

const base = {
  name: "Jane Maintainer",
  email: "jane@acme.dev",
  emailSourceUrl: "https://github.com/jane",
  emailSourceType: "github_profile" as const,
  githubUsername: "jane",
  githubUrl: "https://github.com/jane",
  project: "acme/agent",
  projectKey: "acme/agent",
  category: "agent_framework" as const,
};

describe("OutreachRepository deduplication", () => {
  beforeEach(() => {
    closeDatabase();
    process.env.DATABASE_URL = ":memory:";
    getDatabase();
  });

  it("prevents duplicate people and projects", () => {
    const repository = new OutreachRepository();
    const first = repository.upsertProspect(base);
    const second = repository.upsertProspect({ ...base, name: "Jane Updated" });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(repository.listProspects()).toHaveLength(1);
  });

  it("tracks workflow status without implying email was sent", () => {
    const repository = new OutreachRepository();
    const prospect = repository.upsertProspect(base).prospect;
    repository.setProspectStatus(prospect.id, "reviewed");
    expect(repository.getProspect(prospect.id)?.status).toBe("reviewed");
  });

  it("exposes worker exclusions from saved contacts and suppressions", () => {
    const repository = new OutreachRepository();
    repository.upsertProspect(base);
    repository.addSuppression({
      email: "blocked@other.dev",
      domain: "suppressed.dev",
      reason: "Operator suppression.",
    });

    expect(repository.getWorkerExclusions()).toEqual({
      emails: ["blocked@other.dev", "jane@acme.dev"],
      domains: ["acme.dev", "suppressed.dev"],
      projectKeys: ["acme/agent"],
    });
  });

  it("migrates legacy prospect rows into contact points", () => {
    closeDatabase();
    const filename = `/tmp/openline-legacy-${Date.now()}.db`;
    const legacy = new Database(filename);
    legacy.exec(`
      CREATE TABLE prospects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, role_title TEXT,
        email TEXT NOT NULL, normalized_email TEXT NOT NULL UNIQUE,
        email_source_url TEXT NOT NULL, email_source_type TEXT NOT NULL,
        github_username TEXT, github_url TEXT, website_url TEXT, company TEXT,
        project TEXT NOT NULL, project_key TEXT NOT NULL, project_description TEXT,
        category TEXT NOT NULL, fit_score INTEGER, score_breakdown TEXT,
        confidence_score REAL, status TEXT NOT NULL DEFAULT 'found',
        domain TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO prospects VALUES (
        'legacy-1', 'Legacy Person', NULL, 'legacy@example.dev', 'legacy@example.dev',
        'https://example.dev/contact', 'official_website', NULL, NULL,
        'https://example.dev', NULL, 'example/project', 'example/project', NULL,
        'other', NULL, NULL, 0.8, 'found', 'example.dev',
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
      CREATE TABLE email_drafts (
        id TEXT PRIMARY KEY,
        prospect_id TEXT NOT NULL UNIQUE,
        to_email TEXT NOT NULL,
        from_email TEXT NOT NULL,
        from_name TEXT NOT NULL,
        reply_to TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        word_count INTEGER NOT NULL,
        validation_status TEXT NOT NULL,
        approval_status TEXT NOT NULL,
        delivery_status TEXT NOT NULL,
        zeptomail_message_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO email_drafts VALUES (
        'legacy-draft-1', 'legacy-1', 'legacy@example.dev', 'sender@example.com',
        'Sender', 'reply@example.com', 'Legacy subject', 'Legacy body', 2,
        'passed', 'approved', 'sent', 'zepto-legacy-1',
        '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z'
      );
    `);
    legacy.close();
    process.env.DATABASE_URL = filename;
    resetEnvForTests();
    const migrated = getDatabase();
    const repository = new OutreachRepository(migrated);
    expect(repository.getProspect("legacy-1")?.contactPoints?.[0].value).toBe(
      "legacy@example.dev",
    );
    const conversations = repository.listConversations("legacy-1");
    expect(conversations).toHaveLength(1);
    expect(repository.listConversationMessages(conversations[0].id)).toEqual([
      expect.objectContaining({
        subject: "Legacy subject",
        body: "Legacy body",
        status: "sent",
        validationStatus: "passed",
        externalMessageId: "zepto-legacy-1",
      }),
    ]);
    const columns = migrated.prepare("PRAGMA table_info(prospects)").all() as Array<{
      name: string;
      notnull: number;
    }>;
    expect(columns.find((column) => column.name === "normalized_email")?.notnull).toBe(0);
    closeDatabase();
    fs.rmSync(filename, { force: true });
    process.env.DATABASE_URL = ":memory:";
    resetEnvForTests();
  });
});
