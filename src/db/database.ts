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
  migrateProspectsForContactPoints(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role_title TEXT,
      email TEXT NOT NULL DEFAULT '',
      normalized_email TEXT UNIQUE,
      email_source_url TEXT NOT NULL DEFAULT '',
      email_source_type TEXT NOT NULL DEFAULT 'official_website',
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
      domain TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS junglegrid_jobs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES outreach_runs(id) ON DELETE CASCADE,
      junglegrid_job_id TEXT UNIQUE,
      workspace_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      pipeline_stage TEXT NOT NULL,
      estimate_json TEXT,
      execution_phase TEXT NOT NULL,
      status_message TEXT,
      submitted_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      logs_cursor TEXT,
      artifacts_json TEXT NOT NULL DEFAULT '[]',
      failure_reason TEXT,
      workload_metadata_json TEXT NOT NULL DEFAULT '{}',
      usage_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_junglegrid_jobs_run_id
      ON junglegrid_jobs(run_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_junglegrid_jobs_active
      ON junglegrid_jobs(execution_phase)
      WHERE execution_phase NOT IN ('completed', 'failed', 'cancelled', 'timed_out', 'blocked');

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

    CREATE TABLE IF NOT EXISTS contact_points (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      source_url TEXT NOT NULL,
      publicly_listed INTEGER NOT NULL DEFAULT 1,
      authorized INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(prospect_id, type, normalized_value)
    );
    CREATE INDEX IF NOT EXISTS idx_contact_points_lookup
      ON contact_points(type, normalized_value, status);

    CREATE TABLE IF NOT EXISTS proof_artifacts (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES outreach_runs(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      uri TEXT,
      evidence_ids TEXT NOT NULL DEFAULT '[]',
      junglegrid_job_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL,
      contact_point_id TEXT NOT NULL REFERENCES contact_points(id),
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      opportunity_state TEXT NOT NULL DEFAULT 'qualified',
      summary TEXT NOT NULL DEFAULT '',
      open_questions TEXT NOT NULL DEFAULT '[]',
      commitments TEXT NOT NULL DEFAULT '[]',
      objections TEXT NOT NULL DEFAULT '[]',
      follow_up_at TEXT,
      opted_out_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS policy_decisions (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      decision TEXT NOT NULL,
      reasons TEXT NOT NULL DEFAULT '[]',
      junglegrid_job_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      legacy_email_draft_id TEXT REFERENCES email_drafts(id) ON DELETE SET NULL,
      direction TEXT NOT NULL,
      channel TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      classification TEXT,
      validation_status TEXT NOT NULL,
      junglegrid_job_id TEXT,
      policy_decision_id TEXT REFERENCES policy_decisions(id) ON DELETE SET NULL,
      external_message_id TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conversation_jobs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      junglegrid_job_id TEXT UNIQUE,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_jobs_conversation
      ON conversation_jobs(conversation_id, created_at);
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
  ensureColumn(db, "prospects", "qualification_junglegrid_job_id", "TEXT");
  ensureColumn(db, "prospects", "scoring_junglegrid_job_id", "TEXT");
  ensureColumn(db, "research_notes", "junglegrid_job_id", "TEXT");

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
  backfillContactPointsAndMessages(db);
}

function migrateProspectsForContactPoints(db: Database.Database): void {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'prospects'")
    .get();
  if (!table) return;
  const columns = db.prepare("PRAGMA table_info(prospects)").all() as Array<{
    name: string;
    notnull: number;
  }>;
  if (columns.find((column) => column.name === "normalized_email")?.notnull !== 1) return;
  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE prospects_contact_migration (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, role_title TEXT,
      email TEXT NOT NULL DEFAULT '', normalized_email TEXT UNIQUE,
      email_source_url TEXT NOT NULL DEFAULT '',
      email_source_type TEXT NOT NULL DEFAULT 'official_website',
      github_username TEXT, github_url TEXT, website_url TEXT, company TEXT,
      project TEXT NOT NULL, project_key TEXT NOT NULL, project_description TEXT,
      category TEXT NOT NULL, fit_score INTEGER, score_breakdown TEXT,
      confidence_score REAL, status TEXT NOT NULL DEFAULT 'found',
      domain TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO prospects_contact_migration SELECT * FROM prospects;
    DROP TABLE prospects;
    ALTER TABLE prospects_contact_migration RENAME TO prospects;
  `);
  db.pragma("foreign_keys = ON");
}

function backfillContactPointsAndMessages(db: Database.Database): void {
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO contact_points (
      id, prospect_id, type, value, normalized_value, source_url, publicly_listed,
      authorized, confidence, status, created_at, updated_at
    )
    SELECT lower(hex(randomblob(16))), id, 'email', email, normalized_email,
      email_source_url, 1, 1, COALESCE(confidence_score, 0.5), 'active', created_at, updated_at
    FROM prospects WHERE email <> '' AND normalized_email IS NOT NULL`,
  ).run();
  const drafts = db
    .prepare(
      `SELECT d.*, p.id AS prospect_id, cp.id AS contact_point_id
       FROM email_drafts d
       JOIN prospects p ON p.id = d.prospect_id
       JOIN contact_points cp ON cp.prospect_id = p.id AND cp.type = 'email'
       WHERE NOT EXISTS (
         SELECT 1 FROM messages m WHERE m.legacy_email_draft_id = d.id
       )`,
    )
    .all() as Array<Record<string, unknown>>;
  for (const draft of drafts) {
    const conversationId = randomId();
    db.prepare(
      `INSERT INTO conversations (
        id, prospect_id, campaign_id, contact_point_id, channel, status,
        opportunity_state, created_at, updated_at
      ) VALUES (?, ?, 'jungle-grid', ?, 'email', ?, 'qualified', ?, ?)`,
    ).run(
      conversationId,
      draft.prospect_id,
      draft.contact_point_id,
      draft.delivery_status === "sent" ? "active" : "draft",
      draft.created_at ?? timestamp,
      draft.updated_at ?? timestamp,
    );
    db.prepare(
      `INSERT INTO messages (
        id, conversation_id, legacy_email_draft_id, direction, channel, subject,
        body, status, validation_status, external_message_id, created_at, sent_at
      ) VALUES (?, ?, ?, 'outbound', 'email', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomId(),
      conversationId,
      draft.id,
      draft.subject,
      draft.body,
      draft.delivery_status === "sent"
        ? "sent"
        : draft.approval_status === "approved"
          ? "approved"
          : "approval_required",
      draft.validation_status,
      draft.zeptomail_message_id,
      draft.created_at ?? timestamp,
      draft.sent_at,
    );
  }
}

function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
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
