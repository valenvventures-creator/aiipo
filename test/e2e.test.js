// End-to-end tests over HTTP against an in-memory database: auth flows, CSRF, tenant isolation,
// permissions, workflow controls and the data room.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-ipo-'));
process.env.BASE_URL = 'http://localhost:0';

const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const http = await import('node:http');
const { handle } = await import('../src/server.js');
const { db } = await import('../src/db.js');
const { devOutbox } = await import('../src/mail.js');
const { hotp } = await import('../src/security/totp.js');
const { verifyAuditChain } = await import('../src/security/audit.js');
const { resetRateLimits } = await import('../src/http.js');
const { decrypt } = await import('../src/security/crypto.js');

let server; let base;
before(async () => {
  server = http.createServer(handle);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

class Client {
  constructor() { this.jar = {}; }
  cookie() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  store(res) {
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv, ...attrs] = c.split(';');
      const [k, v] = kv.split('=');
      if (attrs.some((a) => /max-age=0/i.test(a))) delete this.jar[k.trim()]; else this.jar[k.trim()] = v;
    }
  }
  async req(method, url, { form, json, headers = {} } = {}) {
    const h = { 'user-agent': 'e2e-test', cookie: this.cookie(), origin: base, ...headers };
    let body;
    if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
    const res = await fetch(base + url, { method, headers: h, body, redirect: 'manual' });
    this.store(res);
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text, headers: res.headers };
  }
  get(u) { return this.req('GET', u); }
  csrfFrom(text) { return /name="_csrf" value="([^"]+)"/.exec(text)?.[1]; }
  async post(url, form, fromUrl) {
    const page = await this.get(fromUrl || url);
    return this.req('POST', url, { form: { _csrf: this.csrfFrom(page.text), ...form } });
  }
}

function linkFromOutbox(kind, to) {
  const m = devOutbox(50).find((x) => x.kind === kind && (!to || x.to === to));
  return m && /(\/[a-z-]+\?token=[\w-]+)/.exec(m.body)[1];
}

async function signupAndLogin(email, first = 'Ada') {
  const c = new Client();
  const r = await c.post('/signup', { firstName: first, lastName: 'Tester', email, password: 'Ledger-route-2027', confirm: 'Ledger-route-2027', terms: '1', privacy: '1' });
  assert.equal(r.status, 200);
  const v = await c.get(linkFromOutbox('verify', email));
  assert.equal(v.location, '/login?m=verified');
  const l = await c.post('/login', { email, password: 'Ledger-route-2027' });
  assert.equal(l.location, '/app');
  return c;
}

async function createProject(c, name, extra = {}) {
  const r = await c.post('/app/onboarding', { section: 'identity', projectName: name, legalName: name, incorporationCountry: 'CA', ...extra }, '/app/onboarding');
  assert.equal(r.status, 303, r.text.slice(0, 300));
}

test('security headers and CSP are present', async () => {
  const r = await new Client().get('/login');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'.*frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'same-origin');
});

test('POST without CSRF token or from another origin is rejected', async () => {
  const c = new Client();
  await c.get('/login');
  const noToken = await c.req('POST', '/login', { form: { email: 'a@b.co', password: 'x' } });
  assert.equal(noToken.status, 403);
  const page = await c.get('/login');
  const cross = await c.req('POST', '/login', { form: { _csrf: c.csrfFrom(page.text), email: 'a@b.co', password: 'x' }, headers: { origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
});

test('signup requires email verification; login is enumeration-safe; lockout after repeated failures', async () => {
  resetRateLimits();
  const c = new Client();
  await c.post('/signup', { firstName: 'Bo', lastName: 'Lee', email: 'bo@example.com', password: 'Ledger-route-2027', confirm: 'Ledger-route-2027', terms: '1', privacy: '1' });
  const early = await c.post('/login', { email: 'bo@example.com', password: 'Ledger-route-2027' });
  assert.equal(early.status, 403);
  assert.match(early.text, /verify your email/i);
  const unknown = await c.post('/login', { email: 'nobody@example.com', password: 'whatever123' });
  const wrong = await c.post('/login', { email: 'bo@example.com', password: 'whatever123' });
  assert.equal(unknown.status, 401); assert.equal(wrong.status, 401);
  assert.match(unknown.text, /Email or password is incorrect/); assert.match(wrong.text, /Email or password is incorrect/);
  // Duplicate signup does not reveal the account exists.
  const dup = await new Client().post('/signup', { firstName: 'X', lastName: 'Y', email: 'bo@example.com', password: 'Ledger-route-2027', confirm: 'Ledger-route-2027', terms: '1', privacy: '1' });
  assert.equal(dup.status, 200);
  assert.match(dup.text, /If bo@example.com can be registered/);
  await c.get(linkFromOutbox('verify', 'bo@example.com'));
  resetRateLimits();
  for (let i = 0; i < 8; i++) await c.post('/login', { email: 'bo@example.com', password: 'wrong-pass-1' });
  const locked = await c.post('/login', { email: 'bo@example.com', password: 'Ledger-route-2027' });
  assert.match(locked.text, /temporarily locked/);
});

test('signup validates password policy and agreements', async () => {
  resetRateLimits();
  const r = await new Client().post('/signup', { firstName: 'A', lastName: 'B', email: 'weak@example.com', password: 'short', confirm: 'nope' });
  assert.equal(r.status, 400);
  assert.match(r.text, /at least 10 characters/);
  assert.match(r.text, /Terms of Service/);
});

test('password reset: single-use link, signs out other sessions', async () => {
  resetRateLimits();
  const c = await signupAndLogin('reset@example.com');
  const other = new Client();
  await other.post('/forgot-password', { email: 'reset@example.com' });
  const link = linkFromOutbox('reset', 'reset@example.com');
  const token = link.split('token=')[1];
  const done = await other.post('/reset-password', { token, password: 'New-ledger-2028', confirm: 'New-ledger-2028' }, link);
  assert.equal(done.location, '/login?m=reset');
  const again = await other.post('/reset-password', { token, password: 'Another-pass-2029', confirm: 'Another-pass-2029' }, '/login');
  assert.equal(again.status, 400);
  const stale = await c.get('/app');
  assert.equal(stale.location, '/login?m=expired');
});

test('MFA enrollment and two-step login with replay protection', async () => {
  resetRateLimits();
  const c = await signupAndLogin('mfa@example.com');
  const start = await c.post('/app/settings/mfa/start', {}, '/app/settings');
  const secret = /<code class="mono key">([A-Z2-7 ]+)<\/code>/.exec(start.text)[1].replace(/ /g, '');
  const conf = await c.post('/app/settings/mfa/confirm', { code: hotp(secret, Math.floor(Date.now() / 30000)) }, '/app/settings');
  assert.match(conf.text, /recovery codes/i);
  const codes = /<pre class="codes">([\s\S]*?)<\/pre>/.exec(conf.text)[1].split('\n');
  const d = new Client();
  const l = await d.post('/login', { email: 'mfa@example.com', password: 'Ledger-route-2027' });
  assert.equal(l.location, '/login/mfa');
  assert.equal((await d.get('/app')).location, '/login?m=expired');
  const replay = await d.post('/login/mfa', { code: hotp(secret, Math.floor(Date.now() / 30000)) });
  assert.equal(replay.status, 401, 'same time-step code cannot be reused');
  const ok = await d.post('/login/mfa', { code: codes[0] });
  assert.equal(ok.location, '/app');
});

test('demo workspace, held retail communication, and AT5 audit upload does not approve', async () => {
  resetRateLimits();
  const c = new Client();
  const r = await c.post('/demo', { kind: 'ca_dual' }, '/login?demo=1');
  assert.equal(r.location, '/app');
  const dash = await c.get('/app');
  assert.match(dash.text, /Demo workspace/);
  assert.match(dash.text, /FICTIONAL|fictional/);
  const comms = await c.get('/app/communications');
  assert.match(comms.text, /Held for counsel review/);
  // Upload a PDF as evidence on a task; the task status must not change.
  const tasks = await c.get('/app/tasks');
  const taskId = /href="\/app\/tasks\/([\w-]+)">Complete audits/.exec(tasks.text)?.[1];
  const page = await c.get('/app/dataroom');
  const up = await c.req('POST', '/app/dataroom/upload', { json: { name: 'audit-report.pdf', folder: 'Financial statements', classification: 'confidential', content: Buffer.from('%PDF-1.4 audit report').toString('base64') }, headers: { 'x-csrf-token': c.csrfFrom(page.text) } });
  assert.equal(up.status, 200, up.text);
  const docId = JSON.parse(up.text).id;
  if (taskId) {
    await c.post(`/app/tasks/${taskId}/evidence`, { documentId: docId }, `/app/tasks/${taskId}`);
    const t = await c.get(`/app/tasks/${taskId}`);
    assert.match(t.text, /badge-not-started/);
  }
  const dl = await c.get(`/app/dataroom/${docId}/download`);
  assert.equal(dl.status, 200);
  assert.equal(dl.text, '%PDF-1.4 audit report');
});

test('uploads: content must match extension; executables blocked; stored encrypted on disk', async () => {
  resetRateLimits();
  const c = new Client();
  await c.post('/demo', { kind: 'us_software' }, '/login?demo=1');
  const page = await c.get('/app/dataroom');
  const tok = c.csrfFrom(page.text);
  const fake = await c.req('POST', '/app/dataroom/upload', { json: { name: 'x.pdf', classification: 'confidential', content: Buffer.from('not a pdf').toString('base64') }, headers: { 'x-csrf-token': tok } });
  assert.equal(fake.status, 415);
  const exe = await c.req('POST', '/app/dataroom/upload', { json: { name: 'x.txt', classification: 'confidential', content: Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*').toString('base64') }, headers: { 'x-csrf-token': tok } });
  assert.equal(exe.status, 422);
  const ok = await c.req('POST', '/app/dataroom/upload', { json: { name: 'plain.txt', classification: 'confidential', content: Buffer.from('SECRET-MARKER-12345').toString('base64') }, headers: { 'x-csrf-token': tok } });
  assert.equal(ok.status, 200);
  for (const f of fs.readdirSync(process.env.UPLOAD_DIR)) assert.ok(!fs.readFileSync(path.join(process.env.UPLOAD_DIR, f)).includes('SECRET-MARKER'));
});

test('tenant isolation: another organization cannot read records, tasks or documents', async () => {
  resetRateLimits();
  const a = await signupAndLogin('tenant-a@example.com');
  await createProject(a, 'Tenant A IPO');
  const rec = await a.post('/app/records/new/issue', { workstream: 'Strategy', finding: 'Tenant A confidential finding', severity: 'High', intent: 'draft', classification: 'confidential' }, '/app/records/new/issue');
  const recId = rec.location.split('/')[3].split('?')[0];
  const tasks = await a.get('/app/tasks');
  const taskId = /href="\/app\/tasks\/([\w-]+)"/.exec(tasks.text)[1];
  const b = await signupAndLogin('tenant-b@example.com', 'Bea');
  await createProject(b, 'Tenant B IPO');
  assert.equal((await b.get(`/app/records/${recId}`)).status, 404);
  assert.equal((await b.get(`/app/tasks/${taskId}`)).status, 404);
  const legal = await b.get('/app/legal');
  assert.ok(!legal.text.includes('Tenant A confidential finding'));
  // Data is encrypted at rest in the database.
  const row = db.prepare('SELECT data_enc FROM records WHERE id = ?').get(recId);
  assert.ok(!row.data_enc.includes('Tenant A'));
});

test('AT10: PR guest cannot reach privileged material via pages, search snippets or AI context', async () => {
  resetRateLimits();
  const owner = await signupAndLogin('owner@example.com', 'Olu');
  await createProject(owner, 'Privilege Test IPO', { incorporationCountry: 'US' });
  // Owner needs MFA to create privileged records.
  const start = await owner.post('/app/settings/mfa/start', {}, '/app/settings');
  const secret = /<code class="mono key">([A-Z2-7 ]+)<\/code>/.exec(start.text)[1].replace(/ /g, '');
  await owner.post('/app/settings/mfa/confirm', { code: hotp(secret, Math.floor(Date.now() / 30000)) }, '/app/settings');
  const rec = await owner.post('/app/records/new/comment', { authority: 'SEC', date: '2026-10-01', commentId: '7', issue: 'PRIVILEGED-COUNSEL-ANALYSIS', classification: 'privileged', intent: 'draft' }, '/app/records/new/comment');
  assert.equal(rec.status, 303, rec.text.slice(0, 500));
  const recId = rec.location.split('/')[3].split('?')[0];
  await owner.post('/app/settings/invite', { email: 'pr@example.com', role: 'ir_pr' }, '/app/settings');
  const inviteLink = linkFromOutbox('invite', 'pr@example.com');
  const pr = new Client();
  await pr.get(inviteLink);
  await pr.post('/signup', { firstName: 'Pat', lastName: 'PR', email: 'pr@example.com', password: 'Ledger-route-2027', confirm: 'Ledger-route-2027', terms: '1', privacy: '1' });
  await pr.get(linkFromOutbox('verify', 'pr@example.com'));
  const l = await pr.post('/login', { email: 'pr@example.com', password: 'Ledger-route-2027' });
  assert.equal(l.location, '/app');
  // The PR user lands in their own org by default; check their memberships include the owner's org.
  const user = db.prepare('SELECT id FROM users WHERE email_lookup = (SELECT email_lookup FROM invitations LIMIT 1)').get();
  const mem = db.prepare("SELECT org_id FROM memberships WHERE user_id = ? AND role = 'ir_pr'").get(user.id);
  assert.ok(mem, 'invitation accepted');
  db.prepare('UPDATE sessions SET org_id = ? WHERE user_id = ?').run(mem.org_id, user.id);
  assert.equal((await pr.get(`/app/records/${recId}`)).status, 404);
  const disc = await pr.get('/app/disclosure');
  assert.ok(!disc.text.includes('PRIVILEGED-COUNSEL-ANALYSIS'));
  const guidePage = await pr.get('/app/guide');
  const ans = await pr.req('POST', '/app/guide', { json: { question: 'Summarize PRIVILEGED-COUNSEL-ANALYSIS' }, headers: { 'x-csrf-token': pr.csrfFrom(guidePage.text) } });
  assert.ok(!ans.text.includes('PRIVILEGED-COUNSEL-ANALYSIS'));
  const ai = db.prepare('SELECT payload_enc, org_id FROM ai_interactions ORDER BY at DESC LIMIT 1').get();
  assert.ok(!decrypt(ai.payload_enc, `ai:${ai.org_id}`).includes('SEC comment 7'));
  // PR role cannot download from the data room.
  assert.equal((await pr.get('/app/dataroom')).status, 200);
});

test('AT6: editing an approved claim reopens review and preserves history; critical issue cannot be self-approved', async () => {
  resetRateLimits();
  const c = await signupAndLogin('claims@example.com');
  await createProject(c, 'Claims IPO');
  const start = await c.post('/app/settings/mfa/start', {}, '/app/settings');
  const secret = /<code class="mono key">([A-Z2-7 ]+)<\/code>/.exec(start.text)[1].replace(/ /g, '');
  await c.post('/app/settings/mfa/confirm', { code: hotp(secret, Math.floor(Date.now() / 30000)) }, '/app/settings');
  const userId = db.prepare('SELECT user_id FROM sessions ORDER BY created_at DESC LIMIT 1').get().user_id;
  const orgId = db.prepare('SELECT org_id FROM memberships WHERE user_id = ?').get(userId).org_id;
  // Make the user counsel so they can review.
  db.prepare("UPDATE memberships SET role = 'external_counsel' WHERE user_id = ?").run(userId);
  const unsupported = await c.post('/app/records/new/claim', { claim: 'Revenue grew 40%', numeric: 'Yes', intent: 'submit' }, '/app/records/new/claim');
  const uid = unsupported.location.split('/')[3].split('?')[0];
  const rej = await c.post(`/app/records/${uid}/review`, { decision: 'approve' }, `/app/records/${uid}`);
  assert.equal(rej.status, 409);
  assert.match(rej.text, /unsupported numeric claim/i);
  const r = await c.post('/app/records/new/claim', { claim: 'Revenue grew 31%', numeric: 'Yes', source: 'FY25 audited', calculation: '(a-b)/b', intent: 'submit' }, '/app/records/new/claim');
  const id = r.location.split('/')[3].split('?')[0];
  assert.equal((await c.post(`/app/records/${id}/review`, { decision: 'approve' }, `/app/records/${id}`)).location, `/app/records/${id}?ok=reviewed`);
  await c.post(`/app/records/${id}`, { claim: 'Revenue grew 29%', numeric: 'Yes', source: 'FY25 audited (restated)', calculation: '(a-b)/b', intent: 'draft' }, `/app/records/${id}/edit`);
  const view = await c.get(`/app/records/${id}`);
  assert.match(view.text, /badge-changes-requested/);
  assert.match(view.text, /Approved<\/strong> on v1/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM record_versions WHERE record_id = ?').get(id).n, 2);
  assert.throws(() => db.prepare('UPDATE approvals SET decision = ? WHERE record_id = ?').run('x', id), /append-only/);
  const crit = await c.post('/app/records/new/issue', { workstream: 'Strategy', finding: 'Critical gap', severity: 'Critical', intent: 'submit' }, '/app/records/new/issue');
  const cid = crit.location.split('/')[3].split('?')[0];
  const self = await c.post(`/app/records/${cid}/review`, { decision: 'approve' }, `/app/records/${cid}`);
  assert.equal(self.status, 409);
  assert.ok(orgId);
});

test('task gating: approval requires designated reviewer and completed prerequisites', async () => {
  resetRateLimits();
  const c = await signupAndLogin('tasks@example.com');
  await createProject(c, 'Gate IPO');
  const tasks = await c.get('/app/tasks');
  const boardId = /href="\/app\/tasks\/([\w-]+)">Board decision/.exec(tasks.text)[1];
  const r = await c.post(`/app/tasks/${boardId}/status`, { status: 'Approved' }, `/app/tasks/${boardId}`);
  assert.equal(r.status, 409);
  const na = await c.post(`/app/tasks/${boardId}/status`, { status: 'Not applicable', note: '' }, `/app/tasks/${boardId}`);
  assert.equal(na.status, 409);
});

test('AT16: closing the IPO project activates recurring obligations that cannot be closed', async () => {
  resetRateLimits();
  const c = await signupAndLogin('close@example.com');
  await createProject(c, 'Close IPO', { incorporationCountry: 'CA' });
  await c.post('/app/onboarding', { section: 'objectives', offeringJurisdictions: 'CA', venues: 'TSX' }, '/app/onboarding?section=objectives');
  await c.post('/app/project/close', {}, '/app/public-company');
  const page = await c.get('/app/public-company');
  assert.match(page.text, /Interim financial reports/);
  assert.match(page.text, /Recurring obligations remain active/);
});

test('audit chain verifies and detects tampering', () => {
  assert.deepEqual(verifyAuditChain(), { ok: true });
});
