// SQLite persistence using Node's built-in driver. Every tenant table carries org_id and every query
// in the repositories filters on it. Sensitive columns are encrypted at the application layer.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email_lookup TEXT NOT NULL UNIQUE,
  email_enc TEXT NOT NULL,
  first_name_enc TEXT, last_name_enc TEXT,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret_enc TEXT, mfa_pending_secret_enc TEXT, mfa_last_step INTEGER NOT NULL DEFAULT -1,
  recovery_codes TEXT,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  password_changed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name_enc TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  demo_expires_at TEXT,
  require_mfa INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(org_id, user_id)
);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email_lookup TEXT NOT NULL, email_enc TEXT NOT NULL,
  role TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, created_by TEXT NOT NULL, accepted_at TEXT, revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT,
  project_id TEXT,
  csrf TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'full',
  remember INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, last_seen TEXT NOT NULL, expires_at TEXT NOT NULL,
  ua_hash TEXT
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name_enc TEXT NOT NULL,
  profile_enc TEXT,
  assessment_enc TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  closed_at TEXT,
  created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Not started',
  owner_role TEXT NOT NULL, reviewer_role TEXT,
  assignee_id TEXT,
  material INTEGER NOT NULL DEFAULT 0,
  depends_on TEXT NOT NULL DEFAULT '[]',
  na_rationale TEXT,
  due_date TEXT,
  evidence TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(project_id, key)
);
CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, task_id TEXT NOT NULL, user_id TEXT,
  from_status TEXT, to_status TEXT, note_enc TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  form TEXT NOT NULL,
  status TEXT NOT NULL,
  classification TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  data_enc TEXT NOT NULL,
  dedupe_key TEXT,
  created_by TEXT NOT NULL, updated_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_scope ON records(org_id, project_id, form);
CREATE TABLE IF NOT EXISTS record_versions (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL, org_id TEXT NOT NULL,
  version INTEGER NOT NULL, status TEXT NOT NULL, data_enc TEXT NOT NULL,
  changed_by TEXT NOT NULL, at TEXT NOT NULL,
  UNIQUE(record_id, version)
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL, record_id TEXT NOT NULL, record_version INTEGER NOT NULL,
  decision TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, note_enc TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  folder TEXT NOT NULL,
  name_enc TEXT NOT NULL,
  classification TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'Unreviewed',
  legal_hold INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL, org_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  object_name TEXT NOT NULL, wrapped_key TEXT NOT NULL,
  size INTEGER NOT NULL, mime TEXT NOT NULL, sha256 TEXT NOT NULL,
  scan_status TEXT NOT NULL,
  uploaded_by TEXT NOT NULL, at TEXT NOT NULL,
  UNIQUE(document_id, version)
);
CREATE TABLE IF NOT EXISTS access_log (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, document_id TEXT NOT NULL,
  user_id TEXT NOT NULL, action TEXT NOT NULL, version INTEGER, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  org_id TEXT, user_id TEXT,
  action TEXT NOT NULL, target TEXT, detail TEXT,
  ip_hash TEXT, at TEXT NOT NULL,
  prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  to_enc TEXT NOT NULL, subject TEXT NOT NULL, body_enc TEXT NOT NULL,
  created_at TEXT NOT NULL, sent_at TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS ai_interactions (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, user_id TEXT NOT NULL,
  model TEXT NOT NULL, mode TEXT NOT NULL,
  payload_enc TEXT NOT NULL, at TEXT NOT NULL
);
`;

// Audit, approval and version tables are append-only: block UPDATE and DELETE at the database level.
const IMMUTABLE = ['audit_events', 'approvals', 'record_versions', 'task_events', 'document_versions', 'access_log'];
const TRIGGERS = IMMUTABLE.map((t) => `
CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t}
  WHEN (SELECT COUNT(*) FROM _purge_allowed) = 0
BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;`).join('\n');

export function openDb(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  // Purge of expired demo tenants is the only path allowed to delete immutable rows.
  db.exec('CREATE TABLE IF NOT EXISTS _purge_allowed (x INTEGER);');
  db.exec(TRIGGERS);
  return db;
}

export const db = openDb();
export const now = () => new Date().toISOString();

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
