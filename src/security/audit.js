// Tamper-evident audit log: every event stores the hash of the previous event, so any edit or
// removal outside the application breaks the chain and is detected by verifyAuditChain().
import { db, now } from '../db.js';
import { newId, sha256, hmac } from './crypto.js';

const SENSITIVE_KEYS = /password|token|secret|code|otp|key/i;

function scrub(detail) {
  if (!detail || typeof detail !== 'object') return detail;
  const out = {};
  for (const [k, v] of Object.entries(detail)) out[k] = SENSITIVE_KEYS.test(k) ? '[redacted]' : v;
  return out;
}

export function audit({ orgId = null, userId = null, action, target = null, detail = null, ip = null }) {
  const last = db.prepare('SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1').get();
  const prev = last?.hash || 'genesis';
  const at = now();
  const id = newId();
  const detailJson = detail ? JSON.stringify(scrub(detail)) : null;
  const ipHash = ip ? hmac(ip, 'ip').slice(0, 24) : null; // pseudonymised, not raw IP
  const hash = sha256([prev, id, orgId, userId, action, target, detailJson, ipHash, at].join('|'));
  db.prepare(`INSERT INTO audit_events (id, org_id, user_id, action, target, detail, ip_hash, at, prev_hash, hash)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, orgId, userId, action, target, detailJson, ipHash, at, prev, hash);
  return id;
}

export function verifyAuditChain() {
  let prev = 'genesis';
  for (const e of db.prepare('SELECT * FROM audit_events ORDER BY seq').iterate()) {
    const expected = sha256([prev, e.id, e.org_id, e.user_id, e.action, e.target, e.detail, e.ip_hash, e.at].join('|'));
    if (e.prev_hash !== prev || e.hash !== expected) return { ok: false, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true };
}

export function listAudit(orgId, limit = 200) {
  return db.prepare('SELECT * FROM audit_events WHERE org_id = ? ORDER BY seq DESC LIMIT ?').all(orgId, limit);
}
