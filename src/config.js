// Central configuration. All secrets come from the environment; nothing secret is hard-coded.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const env = process.env;
export const IS_PROD = env.NODE_ENV === 'production';
export const IS_TEST = env.NODE_ENV === 'test';

function initialMasterKey() {
  if (env.TA_MASTER_KEY) {
    const key = Buffer.from(env.TA_MASTER_KEY.trim(), 'base64');
    if (key.length !== 32) throw new Error('TA_MASTER_KEY must be 32 bytes, base64 encoded (run: npm run keygen)');
    return key;
  }
  if (IS_TEST) return crypto.createHash('sha256').update('test-only-key').digest();
  if (IS_PROD) return null; // loaded by ensureMasterKey() from Netlify Blobs
  // Development convenience: generate a local key file with owner-only permissions.
  const keyFile = path.join(ROOT, 'data', '.dev-master.key');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  if (!fs.existsSync(keyFile)) {
    fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
    console.warn('[security] Generated a development encryption key at data/.dev-master.key. Never use this file in production.');
  }
  return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'base64');
}

/**
 * Production without TA_MASTER_KEY: a 256-bit key is generated once and kept in a dedicated Netlify Blobs
 * store - separate from the database, so a database copy alone cannot be decrypted. The conditional write
 * guarantees that concurrent cold starts all end up with the same key.
 */
export async function ensureMasterKey() {
  if (config.masterKey) return config.masterKey;
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: 'ta-ipo-keys', consistency: 'strong' });
  let stored = await store.get('master-key-v1');
  if (!stored) {
    await store.set('master-key-v1', crypto.randomBytes(32).toString('base64'), { onlyIfNew: true });
    stored = await store.get('master-key-v1');
  }
  const key = Buffer.from(String(stored).trim(), 'base64');
  if (key.length !== 32) throw new Error('Stored encryption key is invalid.');
  config.masterKey = key;
  return key;
}

// Email verification: 'required' needs a working mail transport. 'auto' (default) requires it only when
// email can actually be delivered (a mail provider is configured, or the development outbox is active).
// Resend uses the same variable names as the other Thought Authorities sites (RESEND_API_KEY, EMAIL_FROM).
const resend = !IS_TEST && Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
const mailAvailable = resend || (!IS_TEST && Boolean(env.MAIL_WEBHOOK_URL)) || !IS_PROD;
const verifyMode = (env.EMAIL_VERIFICATION || 'auto').toLowerCase();

export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '127.0.0.1',
  // Netlify sets URL to the site's primary address at runtime.
  baseUrl: (env.BASE_URL || env.URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  // Netlify Database connection (set by Netlify). Without it: embedded PGlite (memory in tests, folder in dev).
  // Tests always use their own throwaway embedded database, never a real one.
  databaseUrl: IS_TEST ? '' : (env.NETLIFY_DB_URL || env.DATABASE_URL || ''),
  pgliteDir: IS_TEST ? null : (env.PGLITE_DIR || path.join(ROOT, 'data', 'pglite')),
  allowEmbeddedDb: env.ALLOW_EMBEDDED_DB === 'true',
  // Data-room files: Netlify Blobs on Netlify, a local folder otherwise.
  // Set by the Netlify Function at runtime (not during builds, where Blobs is unavailable).
  useBlobs: !IS_TEST && env.USE_NETLIFY_BLOBS === 'true',
  uploadDir: env.UPLOAD_DIR || path.join(ROOT, 'data', 'objects'),
  masterKey: initialMasterKey(),
  // Secure cookies are on unless explicitly disabled for a non-localhost plain-HTTP dev host.
  secureCookies: env.COOKIE_SECURE !== 'false',
  trustProxy: env.TRUST_PROXY === 'true',
  session: {
    idleMinutes: Number(env.SESSION_IDLE_MINUTES || 30),
    absoluteHours: Number(env.SESSION_ABSOLUTE_HOURS || 12),
    rememberDays: Number(env.SESSION_REMEMBER_DAYS || 14),
    demoHours: 2,
  },
  auth: {
    maxFailedLogins: 8,
    lockMinutes: 15,
    resetTokenMinutes: 30,
    verifyTokenHours: 24,
  },
  // Netlify Functions accept requests up to 6 MB, so uploads (sent base64-encoded) are capped lower there.
  uploads: { maxBytes: Number(env.TA_MAX_UPLOAD_MB || 15) * 1024 * 1024 },
  mail: {
    from: env.EMAIL_FROM || env.MAIL_FROM || 'Thought Authorities <no-reply@localhost>',
    replyTo: env.EMAIL_REPLY_TO || '',
    // Resend (RESEND_API_KEY + EMAIL_FROM) or any HTTPS webhook that accepts {from,to,subject,text}.
    webhookUrl: resend ? 'https://api.resend.com/emails' : IS_TEST ? '' : (env.MAIL_WEBHOOK_URL || ''),
    webhookToken: resend ? env.RESEND_API_KEY.trim() : (env.MAIL_WEBHOOK_TOKEN || ''),
  },
  ai: {
    model: env.TA_AI_MODEL || 'claude-opus-5-5',
    enabled: !IS_TEST && Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
  },
  devOutbox: !IS_PROD,
  mailAvailable,
  requireEmailVerification: verifyMode === 'required' || (verifyMode === 'auto' && mailAvailable),
  // Extra site origins allowed to submit forms, e.g. a Netlify domain that forwards to this server.
  // Netlify deploy-preview and branch addresses are allowed automatically.
  allowedOrigins: [env.ALLOWED_ORIGINS, env.DEPLOY_PRIME_URL, env.DEPLOY_URL].filter(Boolean).join(',')
    .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
};
