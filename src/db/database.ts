import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getEnv } from "@/src/config/env";

let database: Database.Database | undefined;

function resolveDatabasePath(value: string): string {
  const raw = value.startsWith("file:") ? value.slice(5) : value;
  if (raw === ":memory:") return raw;
  return path.isAbsolute(raw)
    ? raw
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), raw);
}

export function getDatabase(): Database.Database {
  if (database) return database;

  const databasePath = resolveDatabasePath(getEnv().DATABASE_URL);
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  migrate(database);
  return database;
}

export function closeDatabase(): void {
  database?.close();
  database = undefined;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role_title TEXT,
      email TEXT NOT NULL,
      normalized_email TEXT NOT NULL UNIQUE,
      email_source_url TEXT NOT NULL,
      email_source_type TEXT NOT NULL,
      github_username TEXT,
      github_url TEXT,
      website_url TEXT,
      company TEXT,
      project TEXT NOT NULL,
      project_key TEXT NOT NULL,
      project_description TEXT,
      category TEXT NOT NULL,
      fit_score INTEGER,
      score_breakdown TEXT,
      confidence_score REAL,
      status TEXT NOT NULL DEFAULT 'found',
      domain TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_github_username
      ON prospects(lower(github_username)) WHERE github_username IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_project_key
      ON prospects(project_key);
    CREATE INDEX IF NOT EXISTS idx_prospects_status_score
      ON prospects(status, fit_score DESC);
    CREATE INDEX IF NOT EXISTS idx_prospects_domain ON prospects(domain);

    CREATE TABLE IF NOT EXISTS research_notes (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL UNIQUE REFERENCES prospects(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      personalization_detail TEXT NOT NULL,
      junglegrid_relevance TEXT NOT NULL,
      evidence_urls TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_drafts (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL UNIQUE REFERENCES prospects(id) ON DELETE CASCADE,
      to_email TEXT NOT NULL,
      from_email TEXT NOT NULL,
      from_name TEXT NOT NULL,
      reply_to TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      links TEXT NOT NULL DEFAULT '[]',
      evidence_urls TEXT NOT NULL DEFAULT '[]',
      personalization_claims TEXT NOT NULL DEFAULT '[]',
      validation_status TEXT NOT NULL DEFAULT 'failed',
      validation_errors TEXT NOT NULL DEFAULT '[]',
      approval_status TEXT NOT NULL DEFAULT 'pending_review',
      delivery_status TEXT NOT NULL DEFAULT 'not_sent',
      approved_at TEXT,
      approved_by TEXT,
      sent_at TEXT,
      zeptomail_message_id TEXT,
      zeptomail_request_id TEXT,
      zeptomail_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_runs (
      id TEXT PRIMARY KEY,
      run_type TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'local-template',
      junglegrid_job_id TEXT,
      target_count INTEGER NOT NULL,
      drafted_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      model_mode TEXT,
      artifacts_json TEXT NOT NULL DEFAULT '[]',
      phase TEXT NOT NULL DEFAULT 'queued',
      notes TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES outreach_runs(id) ON DELETE CASCADE,
      phase TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_prospects (
      run_id TEXT NOT NULL REFERENCES outreach_runs(id) ON DELETE CASCADE,
      prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
      outcome TEXT NOT NULL,
      reason TEXT,
      PRIMARY KEY (run_id, prospect_id)
    );

    CREATE TABLE IF NOT EXISTS blocked_contacts (
      id TEXT PRIMARY KEY,
      email TEXT,
      domain TEXT,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      CHECK (email IS NOT NULL OR domain IS NOT NULL)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_email
      ON blocked_contacts(lower(email)) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_domain
      ON blocked_contacts(lower(domain)) WHERE domain IS NOT NULL;

    CREATE TABLE IF NOT EXISTS suppressions (
      id TEXT PRIMARY KEY,
      email TEXT,
      domain TEXT,
      reason TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      CHECK (email IS NOT NULL OR domain IS NOT NULL)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_suppressions_email
      ON suppressions(lower(email)) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_suppressions_domain
      ON suppressions(lower(domain)) WHERE domain IS NOT NULL;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      outcome TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, "outreach_runs", "mode", "TEXT NOT NULL DEFAULT 'local-template'");
  ensureColumn(db, "outreach_runs", "junglegrid_job_id", "TEXT");
  ensureColumn(db, "outreach_runs", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "outreach_runs", "model_mode", "TEXT");
  ensureColumn(db, "outreach_runs", "artifacts_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "email_drafts", "to_email", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "email_drafts", "from_email", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "email_drafts", "from_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "email_drafts", "reply_to", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "email_drafts", "links", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "email_drafts", "evidence_urls", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "email_drafts", "personalization_claims", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "email_drafts", "validation_status", "TEXT NOT NULL DEFAULT 'failed'");
  ensureColumn(db, "email_drafts", "validation_errors", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "email_drafts", "approval_status", "TEXT NOT NULL DEFAULT 'pending_review'");
  ensureColumn(db, "email_drafts", "delivery_status", "TEXT NOT NULL DEFAULT 'not_sent'");
  ensureColumn(db, "email_drafts", "approved_at", "TEXT");
  ensureColumn(db, "email_drafts", "approved_by", "TEXT");
  ensureColumn(db, "email_drafts", "sent_at", "TEXT");
  ensureColumn(db, "email_drafts", "zeptomail_message_id", "TEXT");
  ensureColumn(db, "email_drafts", "zeptomail_request_id", "TEXT");
  ensureColumn(db, "email_drafts", "zeptomail_error", "TEXT");

  const env = getEnv();
  db.prepare(
    `UPDATE email_drafts
     SET from_email = CASE WHEN from_email = '' THEN ? ELSE from_email END,
         from_name = CASE WHEN from_name = '' THEN ? ELSE from_name END,
         reply_to = CASE WHEN reply_to = '' THEN ? ELSE reply_to END`,
  ).run(env.ZEPTOMAIL_FROM_EMAIL, env.ZEPTOMAIL_FROM_NAME, env.ZEPTOMAIL_REPLY_TO);
  db.prepare(
    `UPDATE email_drafts
     SET to_email = (
       SELECT email FROM prospects WHERE prospects.id = email_drafts.prospect_id
     )
     WHERE to_email = ''`,
  ).run();
  db.prepare(
    `UPDATE email_drafts
     SET evidence_urls = json_array((
       SELECT email_source_url FROM prospects WHERE prospects.id = email_drafts.prospect_id
     ))
     WHERE evidence_urls = '[]'`,
  ).run();
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
