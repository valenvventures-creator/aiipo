// Sign-up and login when no email provider is configured (EMAIL_VERIFICATION=off), reached from an
// extra allowed origin (e.g. a Netlify site forwarding to the server).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.COOKIE_SECURE = 'false';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-ipo-nomail-'));
process.env.ALLOWED_ORIGINS = 'https://my-site.netlify.app';

const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const http = await import('node:http');
const { handle } = await import('../src/server.js');
const { config } = await import('../src/config.js');

let server; let base; let jar = {};
before(async () => { server = http.createServer(handle); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

async function req(method, url, form, origin = 'https://my-site.netlify.app') {
  const headers = { 'user-agent': 'nomail-test', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), origin };
  let body;
  if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
  const res = await fetch(base + url, { method, headers, body, redirect: 'manual' });
  for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (/max-age=0/i.test(c)) delete jar[k]; else jar[k] = v; }
  return { status: res.status, location: res.headers.get('location'), text: await res.text() };
}
const csrf = (t) => /name="_csrf" value="([^"]+)"/.exec(t)[1];

test('verification is off when configured so', () => assert.equal(config.requireEmailVerification, false));

test('sign-up signs the person straight in; login works; duplicate sign-up is refused', async () => {
  const page = await req('GET', '/signup');
  const s = await req('POST', '/signup', { _csrf: csrf(page.text), firstName: 'Nia', lastName: 'Ng', email: 'nia@example.com', password: 'Ledger-route-2027', confirm: 'Ledger-route-2027', terms: '1', privacy: '1' });
  assert.equal(s.location, '/app/onboarding');
  assert.equal((await req('GET', '/app/onboarding')).status, 200);
  const app = await req('GET', '/app/onboarding');
  await req('POST', '/logout', { _csrf: csrf(app.text) });
  const lp = await req('GET', '/login');
  const l = await req('POST', '/login', { _csrf: csrf(lp.text), email: 'nia@example.com', password: 'Ledger-route-2027' });
  assert.equal(l.location, '/app');
  jar = {};
  const p2 = await req('GET', '/signup');
  const dup = await req('POST', '/signup', { _csrf: csrf(p2.text), firstName: 'X', lastName: 'Y', email: 'nia@example.com', password: 'Ledger-route-2027', confirm: 'Ledger-route-2027', terms: '1', privacy: '1' });
  assert.equal(dup.status, 400);
});

test('forms from an origin that is not allowed are still blocked', async () => {
  jar = {};
  const lp = await req('GET', '/login');
  const r = await req('POST', '/login', { _csrf: csrf(lp.text), email: 'nia@example.com', password: 'Ledger-route-2027' }, 'https://evil.example');
  assert.equal(r.status, 403);
});
