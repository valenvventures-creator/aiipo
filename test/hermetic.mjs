// Loaded before every test file (node --import). Tests must never touch real services, even when they run
// inside a Netlify build where the site's database, Blobs, email and AI settings are present.
const CLEAR = [
  'NETLIFY', 'NETLIFY_DEV', 'NETLIFY_DB_URL', 'NETLIFY_DB_DRIVER', 'DATABASE_URL', 'NETLIFY_BLOBS_CONTEXT', 'USE_NETLIFY_BLOBS',
  'URL', 'DEPLOY_URL', 'DEPLOY_PRIME_URL', 'BASE_URL', 'ALLOWED_ORIGINS',
  'RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'MAIL_WEBHOOK_URL', 'MAIL_WEBHOOK_TOKEN', 'MAIL_FROM', 'EMAIL_VERIFICATION',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'TA_MASTER_KEY', 'TA_MAX_UPLOAD_MB', 'PGLITE_DIR', 'UPLOAD_DIR',
  'ALLOW_EMBEDDED_DB', 'COOKIE_SECURE', 'TRUST_PROXY',
];
for (const k of CLEAR) delete process.env[k];
process.env.NODE_ENV = 'test';
if (process.env.TA_TEST_EMAIL_VERIFICATION) process.env.EMAIL_VERIFICATION = process.env.TA_TEST_EMAIL_VERIFICATION;
