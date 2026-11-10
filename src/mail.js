// Outbound email. In development, messages are stored (encrypted) in a local outbox visible at
// /dev/outbox. In production set RESEND_API_KEY and EMAIL_FROM (as on the other Thought Authorities
// sites), or MAIL_WEBHOOK_URL for another provider.
import { db, now } from './db.js';
import { config } from './config.js';
import { encrypt, decrypt, newId } from './security/crypto.js';

export async function sendMail({ to, subject, text, kind }) {
  const id = newId();
  await db.run('INSERT INTO outbox (id, kind, to_enc, subject, body_enc, created_at) VALUES (?,?,?,?,?,?)', id, kind, encrypt(to, 'outbox'), subject, encrypt(text, 'outbox'), now());
  if (config.mail.webhookUrl) {
    try {
      const res = await fetch(config.mail.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.mail.webhookToken}` },
        body: JSON.stringify({ from: config.mail.from, to, subject, text, ...(config.mail.replyTo ? { reply_to: config.mail.replyTo } : {}) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Mail provider returned ${res.status}`);
      await db.run('UPDATE outbox SET sent_at = ?, body_enc = ? WHERE id = ?', now(), encrypt('[delivered - body discarded]', 'outbox'), id);
    } catch (e) {
      await db.run('UPDATE outbox SET error = ? WHERE id = ?', String(e.message).slice(0, 200), id);
    }
  } else if (!config.devOutbox) {
    console.error('[mail] Email is not configured (RESEND_API_KEY + EMAIL_FROM); message was not delivered:', subject);
  }
  return id;
}

export async function devOutbox(limit = 20) {
  return (await db.all('SELECT * FROM outbox ORDER BY created_at DESC LIMIT ?', limit)).map((m) => ({
    ...m, to: decrypt(m.to_enc, 'outbox'), body: decrypt(m.body_enc, 'outbox'),
  }));
}
