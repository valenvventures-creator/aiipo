// Outbound email. In development, messages are stored (encrypted) in a local outbox visible at
// /dev/outbox. In production configure MAIL_WEBHOOK_URL to a transactional mail provider endpoint.
import { db, now } from './db.js';
import { config } from './config.js';
import { encrypt, decrypt, newId } from './security/crypto.js';

export async function sendMail({ to, subject, text, kind }) {
  const id = newId();
  db.prepare('INSERT INTO outbox (id, kind, to_enc, subject, body_enc, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, kind, encrypt(to, 'outbox'), subject, encrypt(text, 'outbox'), now());
  if (config.mail.webhookUrl) {
    try {
      const res = await fetch(config.mail.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.mail.webhookToken}` },
        body: JSON.stringify({ from: config.mail.from, to, subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Mail provider returned ${res.status}`);
      db.prepare('UPDATE outbox SET sent_at = ?, body_enc = ? WHERE id = ?').run(now(), encrypt('[delivered - body discarded]', 'outbox'), id);
    } catch (e) {
      db.prepare('UPDATE outbox SET error = ? WHERE id = ?').run(String(e.message).slice(0, 200), id);
    }
  } else if (!config.devOutbox) {
    console.error('[mail] MAIL_WEBHOOK_URL is not configured; message was not delivered:', subject);
  }
  return id;
}

export function devOutbox(limit = 20) {
  return db.prepare('SELECT * FROM outbox ORDER BY created_at DESC LIMIT ?').all(limit).map((m) => ({
    ...m, to: decrypt(m.to_enc, 'outbox'), body: decrypt(m.body_enc, 'outbox'),
  }));
}
