// Postgres persistence, set up the same way as the other Thought Authorities sites on Netlify:
//  - Production on Netlify: Netlify Database (NETLIFY_DB_URL, provided by Netlify) via @netlify/database.
//  - Local development and tests: PGlite, an embedded Postgres (same SQL, no server needed).
// Every tenant table carries org_id and every query in the services filters on it. Sensitive columns are
// encrypted at the application layer. Queries made while a transaction is open automatically join it.
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config, IS_PROD, IS_TEST } from './config.js';

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email_lookup TEXT NOT NULL UNIQUE,
  email_enc TEXT NOT NULL,
  first_name_enc TEXT, last_name_enc TEXT,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret_enc TEXT, mfa_pending_secret_enc TEXT, mfa_last_step BIGINT NOT NULL DEFAULT -1,
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
  ord INTEGER NOT NULL DEFAULT 0,
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
  seq BIGSERIAL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS ta_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Audit, approval and version tables are append-only. The only exception is the purge of expired demo
-- tenants, which sets the transaction-local flag ta.purge.
CREATE OR REPLACE FUNCTION ta_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('ta.purge', true), '') = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $fn$;
`;
const IMMUTABLE = ['audit_events', 'approvals', 'record_versions', 'task_events', 'document_versions', 'access_log'];
const TRIGGERS = IMMUTABLE.map((t) => `
DROP TRIGGER IF EXISTS ${t}_append_only ON ${t};
CREATE TRIGGER ${t}_append_only BEFORE UPDATE OR DELETE ON ${t} FOR EACH ROW EXECUTE FUNCTION ta_append_only();`).join('\n');

// ---------- Backends ----------
const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

async function openPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = config.pgliteDir;
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const pg = dir ? new PGlite(dir) : new PGlite();
  await pg.waitReady;
  return {
    kind: 'pglite',
    query: (sql, params) => pg.query(sql, params),
    exec: (sql) => pg.exec(sql),
    transaction: (fn) => pg.transaction((t) => fn({ query: (s, p) => t.query(s, p), exec: (s) => t.exec(s) })),
  };
}

async function openNetlify() {
  const { getDatabase } = await import('@netlify/database');
  const { pool } = getDatabase({ connectionString: config.databaseUrl });
  const wrap = (c) => ({ query: (s, p) => c.query(s, p), exec: (s) => c.query(s) });
  return {
    kind: 'postgres',
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

let ready = null;
const als = new AsyncLocalStorage();

export function init() {
  ready ??= (async () => {
    let backend;
    if (config.databaseUrl) backend = await openNetlify();
    else if (IS_PROD && !IS_TEST && !config.allowEmbeddedDb) {
      throw new Error('No database configured. On Netlify, enable Netlify Database for this site (it provides NETLIFY_DB_URL).');
    } else backend = await openPglite();
    await backend.transaction(async (t) => {
      await t.query('SELECT pg_advisory_xact_lock(735001)');
      await t.exec('CREATE TABLE IF NOT EXISTS ta_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      const v = await t.query("SELECT value FROM ta_meta WHERE key = 'schema_version'");
      if (Number(v.rows[0]?.value || 0) < SCHEMA_VERSION) {
        await t.exec(SCHEMA);
        await t.exec(TRIGGERS);
        await t.query("INSERT INTO ta_meta (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [String(SCHEMA_VERSION)]);
      }
    });
    return backend;
  })();
  return ready;
}

async function conn() {
  return als.getStore() || (await init());
}

export const db = {
  async get(sql, ...params) { return (await (await conn()).query(toPg(sql), params)).rows[0]; },
  async all(sql, ...params) { return (await (await conn()).query(toPg(sql), params)).rows; },
  async run(sql, ...params) { const r = await (await conn()).query(toPg(sql), params); return { changes: r.affectedRows ?? r.rowCount ?? 0 }; },
  async exec(sql) { return (await conn()).exec(sql); },
  async kind() { return (await init()).kind; },
};

/** Run fn in a transaction. Nested calls join the outer transaction. */
export async function tx(fn) {
  if (als.getStore()) return fn();
  const backend = await init();
  return backend.transaction((t) => als.run(t, fn));
}

/** Within tx(): allow deletion of append-only rows (used only to purge expired demo tenants). */
export const allowPurge = () => db.exec("SET LOCAL ta.purge = 'on'");

export const now = () => new Date().toISOString();
