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

function loadMasterKey() {
  if (env.TA_MASTER_KEY) {
    const key = Buffer.from(env.TA_MASTER_KEY, 'base64');
    if (key.length !== 32) throw new Error('TA_MASTER_KEY must be 32 bytes, base64 encoded (run: npm run keygen)');
    return key;
  }
  if (IS_PROD) {
    throw new Error('TA_MASTER_KEY is required in production. Generate one with `npm run keygen` and store it in your secret manager.');
  }
  if (IS_TEST) return crypto.createHash('sha256').update('test-only-key').digest();
  // Development convenience: generate a local key file with owner-only permissions.
  const keyFile = path.join(ROOT, 'data', '.dev-master.key');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  if (!fs.existsSync(keyFile)) {
    fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
    console.warn('[security] Generated a development encryption key at data/.dev-master.key. Never use this file in production.');
  }
  return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'base64');
}

export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '127.0.0.1',
  // RENDER_EXTERNAL_URL is set automatically on Render.
  baseUrl: (env.BASE_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dbPath: env.DATABASE_PATH || (IS_TEST ? ':memory:' : path.join(ROOT, 'data', 'ta-ipo.sqlite')),
  uploadDir: env.UPLOAD_DIR || path.join(ROOT, 'data', 'objects'),
  masterKey: loadMasterKey(),
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
  uploads: { maxBytes: 15 * 1024 * 1024 },
  mail: {
    from: env.MAIL_FROM || 'Thought Authorities <no-reply@localhost>',
    // Optional HTTPS webhook to a transactional mail provider. Without it, mail goes to the dev outbox.
    webhookUrl: env.MAIL_WEBHOOK_URL || '',
    webhookToken: env.MAIL_WEBHOOK_TOKEN || '',
  },
  ai: {
    model: env.TA_AI_MODEL || 'claude-opus-5-5',
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
  },
  devOutbox: !IS_PROD,
};
