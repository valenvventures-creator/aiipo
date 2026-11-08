// Account, session and token services. Pages call these; nothing here renders HTML.
import { db, now, tx } from '../db.js';
import { config } from '../config.js';
import {
  hashPassword, verifyPassword, burnPasswordCheck, encrypt, decrypt, randomToken, sha256, hmac, newId,
} from './crypto.js';
import { verifyTotp, generateSecret } from './totp.js';

const COMMON = new Set(['password123', 'password1234', 'qwerty12345', '1234567890a', 'letmein1234', 'welcome1234',
  'iloveyou123', 'admin123456', 'abc123456789', 'passw0rd123', 'changeme123', 'football123', 'monkey12345']);

export const emailLookup = (email) => hmac(String(email).trim().toLowerCase(), 'email');

export function validateEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(email);
}

/** Mirrors the published rule ("At least 10 characters, including a letter and a number") plus extra checks. */
export function passwordProblems(password, email = '') {
  const p = [];
  if (typeof password !== 'string' || password.length < 10) p.push('Use at least 10 characters.');
  if (password && password.length > 128) p.push('Use at most 128 characters.');
  if (!/[A-Za-z]/.test(password || '') || !/\d/.test(password || '')) p.push('Include at least one letter and one number.');
  if (password && COMMON.has(password.toLowerCase())) p.push('That password is too common.');
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && password && password.toLowerCase().includes(local)) p.push('Do not include your email name in the password.');
  return p;
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email_lookup = ?').get(emailLookup(email));
}
export const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

export function userProfile(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: decrypt(u.email_enc, `user:${u.id}`),
    firstName: decrypt(u.first_name_enc, `user:${u.id}`) || '',
    lastName: decrypt(u.last_name_enc, `user:${u.id}`) || '',
    verified: Boolean(u.email_verified_at),
    mfa: Boolean(u.mfa_enabled),
    isDemo: Boolean(u.is_demo),
  };
}

export function createUser({ email, firstName, lastName, password, verified = false, isDemo = false }) {
  const id = newId();
  const t = now();
  db.prepare(`INSERT INTO users (id, email_lookup, email_enc, first_name_enc, last_name_enc, password_hash,
      email_verified_at, is_demo, password_changed_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, emailLookup(email), encrypt(email.trim(), `user:${id}`), encrypt(firstName, `user:${id}`), encrypt(lastName, `user:${id}`),
      hashPassword(password), verified ? t : null, isDemo ? 1 : 0, t, t, t);
  return getUser(id);
}

export function createOrg(name, { isDemo = false, demoExpiresAt = null } = {}) {
  const id = newId();
  db.prepare('INSERT INTO orgs (id, name_enc, is_demo, demo_expires_at, created_at) VALUES (?,?,?,?,?)')
    .run(id, encrypt(name, `org:${id}`), isDemo ? 1 : 0, demoExpiresAt, now());
  return id;
}
export const orgName = (org) => decrypt(org.name_enc, `org:${org.id}`);
export const getOrg = (id) => db.prepare('SELECT * FROM orgs WHERE id = ?').get(id);

export function addMembership(orgId, userId, role) {
  db.prepare('INSERT INTO memberships (id, org_id, user_id, role, created_at) VALUES (?,?,?,?,?)').run(newId(), orgId, userId, role, now());
}
export const membershipsFor = (userId) => db.prepare('SELECT m.*, o.name_enc, o.is_demo, o.require_mfa FROM memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? ORDER BY m.created_at').all(userId);
export const membership = (orgId, userId) => db.prepare('SELECT * FROM memberships WHERE org_id = ? AND user_id = ?').get(orgId, userId);

/**
 * Verify credentials. Returns { user } or { error }. Messages never reveal whether an email exists.
 * Accounts are temporarily locked after repeated failures.
 */
export function checkCredentials(email, password) {
  const generic = { error: 'Email or password is incorrect.' };
  const user = validateEmail(email) ? findUserByEmail(email) : null;
  if (!user) { burnPasswordCheck(password || 'x'); return generic; }
  if (user.locked_until && user.locked_until > now()) {
    burnPasswordCheck(password || 'x');
    return { error: 'Too many attempts. For your security this account is temporarily locked. Try again later or reset your password.' };
  }
  if (!verifyPassword(password || '', user.password_hash)) {
    const failed = user.failed_logins + 1;
    const lock = failed >= config.auth.maxFailedLogins ? new Date(Date.now() + config.auth.lockMinutes * 60000).toISOString() : null;
    db.prepare('UPDATE users SET failed_logins = ?, locked_until = COALESCE(?, locked_until) WHERE id = ?').run(lock ? 0 : failed, lock, user.id);
    return { ...generic, userId: user.id, locked: Boolean(lock) };
  }
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);
  return { user };
}

// ---------- Sessions ----------
export function createSession(userId, { remember = false, stage = 'full', orgId = null, ua = '', hours } = {}) {
  const token = randomToken(32);
  const t = new Date();
  const absMs = hours ? hours * 3600e3 : remember ? config.session.rememberDays * 86400e3 : config.session.absoluteHours * 3600e3;
  const expires = new Date(t.getTime() + (stage === 'mfa' ? 10 * 60e3 : absMs)).toISOString();
  const id = newId();
  db.prepare(`INSERT INTO sessions (id, token_hash, user_id, org_id, csrf, stage, remember, created_at, last_seen, expires_at, ua_hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, sha256(token), userId, orgId, randomToken(24), stage, remember ? 1 : 0, t.toISOString(), t.toISOString(), expires, sha256(ua || ''));
  return { token, id, expires, remember };
}

export function loadSession(token, ua = '') {
  if (!token || token.length > 100) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token));
  if (!s) return null;
  const t = Date.now();
  const idleMs = (s.remember ? 7 * 24 * 60 : config.session.idleMinutes) * 60e3;
  if (Date.parse(s.expires_at) < t || Date.parse(s.last_seen) + idleMs < t || s.ua_hash !== sha256(ua || '')) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(s.id);
    return null;
  }
  if (t - Date.parse(s.last_seen) > 60e3) db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(new Date(t).toISOString(), s.id);
  return s;
}

export const destroySession = (id) => db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
export const destroyUserSessions = (userId, exceptId = '') => db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptId);
export const setSessionOrg = (id, orgId) => db.prepare('UPDATE sessions SET org_id = ? WHERE id = ?').run(orgId, id);

// ---------- One-time tokens (email verification, password reset) ----------
export function issueToken(userId, kind, minutes) {
  const token = randomToken(32);
  tx(() => {
    db.prepare('UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL').run(now(), userId, kind);
    db.prepare('INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)')
      .run(newId(), userId, kind, sha256(token), new Date(Date.now() + minutes * 60e3).toISOString(), now());
  });
  return token;
}

export function peekToken(token, kind) {
  if (!token || token.length > 100) return null;
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ? AND kind = ?').get(sha256(token), kind);
  if (!row || row.used_at || row.expires_at < now()) return null;
  return row;
}

export function consumeToken(token, kind) {
  const row = peekToken(token, kind);
  if (!row) return null;
  const r = db.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now(), row.id);
  return r.changes === 1 ? row : null;
}

export function setPassword(userId, password) {
  db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .run(hashPassword(password), now(), now(), userId);
}

export const markVerified = (userId) => db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(now(), userId);

// ---------- MFA ----------
export function beginMfaEnrollment(userId) {
  const secret = generateSecret();
  db.prepare('UPDATE users SET mfa_pending_secret_enc = ? WHERE id = ?').run(encrypt(secret, `mfa:${userId}`), userId);
  return secret;
}

export function confirmMfaEnrollment(userId, code) {
  const u = getUser(userId);
  const secret = decrypt(u.mfa_pending_secret_enc, `mfa:${userId}`);
  if (!secret) return null;
  const step = verifyTotp(secret, code);
  if (step === null) return null;
  const codes = Array.from({ length: 8 }, () => randomToken(6).replace(/[-_]/g, 'x').slice(0, 10));
  db.prepare(`UPDATE users SET mfa_enabled = 1, mfa_secret_enc = ?, mfa_pending_secret_enc = NULL, mfa_last_step = ?, recovery_codes = ?, updated_at = ? WHERE id = ?`)
    .run(encrypt(secret, `mfa:${userId}`), step, JSON.stringify(codes.map((c) => sha256(c))), now(), userId);
  return codes;
}

export function verifyMfa(userId, code) {
  const u = getUser(userId);
  if (!u?.mfa_enabled) return false;
  const clean = String(code || '').replace(/\s/g, '');
  const secret = decrypt(u.mfa_secret_enc, `mfa:${userId}`);
  const step = verifyTotp(secret, clean, { lastUsedStep: u.mfa_last_step });
  if (step !== null) {
    db.prepare('UPDATE users SET mfa_last_step = ? WHERE id = ?').run(step, userId);
    return true;
  }
  // Single-use recovery code
  const codes = JSON.parse(u.recovery_codes || '[]');
  const idx = codes.indexOf(sha256(clean));
  if (idx >= 0) {
    codes.splice(idx, 1);
    db.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(codes), userId);
    return true;
  }
  return false;
}

export function disableMfa(userId) {
  db.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret_enc = NULL, mfa_pending_secret_enc = NULL, recovery_codes = NULL, mfa_last_step = -1 WHERE id = ?').run(userId);
}
