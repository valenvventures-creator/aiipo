// Authentication routes. The flow mirrors the reference: separate Log in / Create account / Forgot
// password pages, "Keep me signed in", and a live demo entry - with added email verification,
// optional authenticator MFA, lockout, rate limits and enumeration-safe messages.
import { config } from '../config.js';
import { db, now } from '../db.js';
import { str, rateLimit, serializeCookie, appendCookie, SESSION_COOKIE, raw } from '../http.js';
import {
  checkCredentials, createSession, destroySession, destroyUserSessions, findUserByEmail, createUser, createOrg, addMembership,
  validateEmail, passwordProblems, issueToken, consumeToken, peekToken, setPassword, markVerified, verifyMfa, getUser, userProfile,
  membershipsFor, emailLookup,
} from '../security/auth.js';
import { audit } from '../security/audit.js';
import { sendMail, devOutbox } from '../mail.js';
import { sha256, randomToken, newId, encrypt, decrypt } from '../security/crypto.js';
import { createDemo, purgeExpiredDemos } from '../demo.js';
import * as V from '../views/auth.js';

const INVITE_COOKIE = config.secureCookies ? '__Host-ta_invite' : 'ta_invite';

function startSession(res, req, user, { remember = false, stage = 'full', hours } = {}) {
  const s = createSession(user.id, { remember, stage, ua: req.headers['user-agent'], hours });
  const maxAge = remember && stage === 'full' ? config.session.rememberDays * 86400 : undefined; // otherwise a browser-session cookie
  appendCookie(res, serializeCookie(SESSION_COOKIE, s.token, { maxAge }));
  return s;
}

async function sendVerification(user) {
  const token = issueToken(user.id, 'verify', config.auth.verifyTokenHours * 60);
  const p = userProfile(user);
  await sendMail({ kind: 'verify', to: p.email, subject: 'Verify your email - Thought Authorities A.I. IPO',
    text: `Hello ${p.firstName},\n\nConfirm your email to activate your account:\n${config.baseUrl}/verify-email?token=${token}\n\nThis link expires in ${config.auth.verifyTokenHours} hours. If you did not create an account, ignore this message.` });
}

function acceptPendingInvite(req, user) {
  const tok = req.cookies[INVITE_COOKIE];
  if (!tok) return null;
  const inv = db.prepare('SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?').get(sha256(tok), now());
  if (!inv || inv.email_lookup !== user.email_lookup) return null;
  if (!db.prepare('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?').get(inv.org_id, user.id)) addMembership(inv.org_id, user.id, inv.role);
  db.prepare('UPDATE invitations SET accepted_at = ? WHERE id = ?').run(now(), inv.id);
  audit({ orgId: inv.org_id, userId: user.id, action: 'invite.accept', target: inv.id });
  return inv.org_id;
}

export function register(r) {
  r.get('/login', (req) => {
    if (req.query.get('demo')) return { html: V.demoPage({ nonce: req.nonce, csrfToken: req.anonCsrf }) };
    if (req.session?.stage === 'full') return { redirect: '/app' };
    const notice = { verified: 'Email verified. You can log in now.', reset: 'Password updated. Log in with your new password.', out: 'You have been logged out.', expired: 'Your session expired. Please log in again.' }[req.query.get('m')];
    return { html: V.loginPage({ nonce: req.nonce, csrfToken: req.anonCsrf, notice }) };
  });

  r.post('/login', async (req, res) => {
    const email = str(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password.slice(0, 128) : '';
    const view = (error, status = 400) => ({ status, html: V.loginPage({ nonce: req.nonce, csrfToken: req.anonCsrf, error, email }) });
    const ipLimit = rateLimit(`login-ip:${req.ip}`, 30, 15 * 60e3);
    const acctLimit = rateLimit(`login-acct:${emailLookup(email)}`, 10, 15 * 60e3);
    if (!ipLimit.ok || !acctLimit.ok) return { ...view('Too many attempts. Please wait a few minutes and try again.', 429), headers: { 'Retry-After': String(Math.max(ipLimit.retryAfter, acctLimit.retryAfter)) } };
    const result = checkCredentials(email, password);
    if (result.error) {
      audit({ userId: result.userId || null, action: result.locked ? 'auth.lockout' : 'auth.login.failed', ip: req.ip });
      return view(result.error, 401);
    }
    const user = result.user;
    if (user.is_demo) return view('Email or password is incorrect.', 401);
    if (!user.email_verified_at && config.requireEmailVerification) {
      if (rateLimit(`verify-resend:${user.id}`, 3, 60 * 60e3).ok) await sendVerification(user);
      return view('Please verify your email first. We have sent you a new verification link.', 403);
    }
    if (req.session) destroySession(req.session.id); // session fixation defence
    const remember = req.body.remember === '1';
    if (user.mfa_enabled) {
      startSession(res, req, user, { remember, stage: 'mfa' });
      return { redirect: '/login/mfa' };
    }
    startSession(res, req, user, { remember });
    acceptPendingInvite(req, user);
    audit({ userId: user.id, action: 'auth.login', ip: req.ip });
    return { redirect: '/app' };
  });

  r.get('/login/mfa', (req) => {
    if (req.session?.stage !== 'mfa') return { redirect: '/login' };
    return { html: V.mfaPage({ nonce: req.nonce, csrfToken: req.session.csrf }) };
  });

  r.post('/login/mfa', (req, res) => {
    if (req.session?.stage !== 'mfa') return { redirect: '/login' };
    const lim = rateLimit(`mfa:${req.session.user_id}`, 6, 10 * 60e3);
    if (!lim.ok) { destroySession(req.session.id); return { redirect: '/login?m=expired' }; }
    if (!verifyMfa(req.session.user_id, str(req.body.code, 20))) {
      audit({ userId: req.session.user_id, action: 'auth.mfa.failed', ip: req.ip });
      return { status: 401, html: V.mfaPage({ nonce: req.nonce, csrfToken: req.session.csrf, error: 'That code did not work. Check the time on your device and try again.' }) };
    }
    const user = getUser(req.session.user_id);
    destroySession(req.session.id);
    startSession(res, req, user, { remember: Boolean(req.session.remember) });
    acceptPendingInvite(req, user);
    audit({ userId: user.id, action: 'auth.login', detail: { mfa: true }, ip: req.ip });
    return { redirect: '/app' };
  });

  r.post('/demo', (req, res) => {
    const lim = rateLimit(`demo:${req.ip}`, 10, 60 * 60e3);
    if (!lim.ok) return { status: 429, html: V.demoPage({ nonce: req.nonce, csrfToken: req.anonCsrf, error: 'Demo limit reached for now. Please try again later.' }) };
    purgeExpiredDemos();
    const { user, orgId } = createDemo(str(req.body.kind, 40));
    if (req.session) destroySession(req.session.id);
    startSession(res, req, user, { hours: config.session.demoHours });
    audit({ orgId, userId: user.id, action: 'demo.create', ip: req.ip });
    return { redirect: '/app' };
  });

  r.get('/signup', (req) => (req.session?.stage === 'full' ? { redirect: '/app' } : { html: V.signupPage({ nonce: req.nonce, csrfToken: req.anonCsrf }) }));

  r.post('/signup', async (req, res) => {
    const values = { firstName: str(req.body.firstName, 60), lastName: str(req.body.lastName, 60), email: str(req.body.email, 254).toLowerCase() };
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const errors = {};
    if (!rateLimit(`signup:${req.ip}`, 10, 60 * 60e3).ok) errors._ = 'Too many sign-up attempts from this network. Please try again later.';
    if (!values.firstName) errors.firstName = 'Enter your first name.';
    if (!values.lastName) errors.lastName = 'Enter your last name.';
    if (!validateEmail(values.email)) errors.email = 'Enter a valid work email.';
    const pw = passwordProblems(password, values.email);
    if (pw.length) errors.password = pw.join(' ');
    if (password !== req.body.confirm) errors.confirm = 'Passwords do not match.';
    if (req.body.terms !== '1') errors.terms = 'You must agree to the Terms of Service.';
    if (req.body.privacy !== '1') errors.privacy = 'You must acknowledge the Privacy Policy.';
    if (Object.keys(errors).length) return { status: 400, html: V.signupPage({ nonce: req.nonce, csrfToken: req.anonCsrf, errors, values }) };

    const existing = findUserByEmail(values.email);
    if (!config.requireEmailVerification) {
      // No email delivery configured: activate the account immediately and sign the person in.
      if (existing) {
        return { status: 400, html: V.signupPage({ nonce: req.nonce, csrfToken: req.anonCsrf, values, errors: { _: 'We could not create an account with those details. If you already have an account, log in instead.' } }) };
      }
      const user = createUser({ ...values, password, verified: false });
      const orgId = createOrg(`${values.firstName} ${values.lastName}'s organization`);
      addMembership(orgId, user.id, 'founder');
      audit({ orgId, userId: user.id, action: 'auth.signup', detail: { emailVerification: 'not configured' }, ip: req.ip });
      if (req.session) destroySession(req.session.id);
      startSession(res, req, user);
      acceptPendingInvite(req, user);
      return { redirect: '/app/onboarding' };
    }
    if (existing) {
      // Do not reveal that the account exists; tell the owner instead.
      await sendMail({ kind: 'notice', to: values.email, subject: 'Sign-up attempt - Thought Authorities A.I. IPO',
        text: `Someone tried to create an account with this email. If it was you, log in or reset your password at ${config.baseUrl}/forgot-password. If not, you can ignore this message.` });
    } else {
      const user = createUser({ ...values, password });
      const orgId = createOrg(`${values.firstName} ${values.lastName}'s organization`);
      addMembership(orgId, user.id, 'founder');
      audit({ orgId, userId: user.id, action: 'auth.signup', ip: req.ip });
      await sendVerification(user);
    }
    return { html: V.checkEmailPage({ nonce: req.nonce, title: 'Verify your email', heading: 'Confirm your email to continue.', text: `If ${values.email} can be registered, we've sent a verification link. It expires in ${config.auth.verifyTokenHours} hours.` }) };
  });

  r.get('/verify-email', (req) => {
    const row = consumeToken(str(req.query.get('token'), 100), 'verify');
    if (!row) return { status: 400, html: V.messagePage({ nonce: req.nonce, title: 'Link expired', heading: 'This verification link is invalid or has expired.', text: 'Log in with your email and password and we will send a new link.' }) };
    markVerified(row.user_id);
    audit({ userId: row.user_id, action: 'auth.email.verified' });
    return { redirect: '/login?m=verified' };
  });

  r.get('/forgot-password', (req) => ({ html: V.forgotPage({ nonce: req.nonce, csrfToken: req.anonCsrf }) }));

  r.post('/forgot-password', async (req) => {
    const email = str(req.body.email, 254).toLowerCase();
    if (!rateLimit(`forgot-ip:${req.ip}`, 10, 60 * 60e3).ok || !rateLimit(`forgot:${emailLookup(email)}`, 3, 60 * 60e3).ok) {
      return { status: 429, html: V.forgotPage({ nonce: req.nonce, csrfToken: req.anonCsrf, error: 'Too many requests. Please try again later.' }) };
    }
    if (!config.mailAvailable) {
      return { html: V.forgotPage({ nonce: req.nonce, csrfToken: req.anonCsrf, error: 'Password reset by email is not enabled on this site yet. Please contact the site administrator.' }) };
    }
    const user = validateEmail(email) ? findUserByEmail(email) : null;
    if (user && !user.is_demo) {
      const token = issueToken(user.id, 'reset', config.auth.resetTokenMinutes);
      await sendMail({ kind: 'reset', to: email, subject: 'Reset your password - Thought Authorities A.I. IPO',
        text: `A password reset was requested for your account.\n\nChoose a new password: ${config.baseUrl}/reset-password?token=${token}\n\nThis secure link expires in ${config.auth.resetTokenMinutes} minutes and works once. If you did not request it, ignore this email - your password is unchanged.` });
      audit({ userId: user.id, action: 'auth.reset.requested', ip: req.ip });
    }
    return { html: V.forgotPage({ nonce: req.nonce, csrfToken: req.anonCsrf, sent: true }) };
  });

  r.get('/reset-password', (req) => {
    const token = str(req.query.get('token'), 100);
    return { html: V.resetPage({ nonce: req.nonce, csrfToken: req.anonCsrf, token, invalid: !peekToken(token, 'reset') }) };
  });

  r.post('/reset-password', (req) => {
    const token = str(req.body.token, 100);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const row = peekToken(token, 'reset');
    if (!row) return { status: 400, html: V.resetPage({ nonce: req.nonce, csrfToken: req.anonCsrf, invalid: true }) };
    const user = getUser(row.user_id);
    const errors = {};
    const pw = passwordProblems(password, userProfile(user).email);
    if (pw.length) errors.password = pw.join(' ');
    if (password !== req.body.confirm) errors.confirm = 'Passwords do not match.';
    if (Object.keys(errors).length) return { status: 400, html: V.resetPage({ nonce: req.nonce, csrfToken: req.anonCsrf, token, errors }) };
    if (!consumeToken(token, 'reset')) return { status: 400, html: V.resetPage({ nonce: req.nonce, csrfToken: req.anonCsrf, invalid: true }) };
    setPassword(user.id, password);
    markVerified(user.id); // receiving the reset email proves control of the address
    destroyUserSessions(user.id);
    audit({ userId: user.id, action: 'auth.reset.completed', ip: req.ip });
    return { redirect: '/login?m=reset' };
  });

  r.post('/logout', (req, res) => {
    if (req.session) { audit({ userId: req.session.user_id, action: 'auth.logout' }); destroySession(req.session.id); }
    appendCookie(res, serializeCookie(SESSION_COOKIE, '', { maxAge: 0 }));
    return { redirect: '/login?m=out' };
  });

  r.get('/invite', (req, res) => {
    const token = str(req.query.get('token'), 100);
    const inv = db.prepare('SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?').get(sha256(token), now());
    if (!inv) return { status: 400, html: V.messagePage({ nonce: req.nonce, title: 'Invitation', heading: 'This invitation is invalid or has expired.', text: 'Ask your administrator to send a new invitation.' }) };
    appendCookie(res, serializeCookie(INVITE_COOKIE, token, { maxAge: 7 * 86400, sameSite: 'Lax' }));
    const email = decrypt(inv.email_enc, `invite:${inv.org_id}`);
    if (req.session?.stage === 'full') {
      const u = getUser(req.session.user_id);
      if (acceptPendingInvite({ cookies: { [INVITE_COOKIE]: token } }, u)) return { redirect: '/app' };
    }
    return { html: V.messagePage({ nonce: req.nonce, title: 'Invitation', heading: 'You have been invited to an IPO workspace.', text: `Log in or create an account with ${email} to accept. The invitation is applied automatically after you sign in.`, link: ['/login', 'Log in to accept'] }) };
  });

  if (config.devOutbox) {
    r.get('/dev/outbox', (req) => {
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (!loopback) return { status: 404, text: 'Not found' };
      return { html: V.outboxPage({ nonce: req.nonce, messages: devOutbox() }) };
    });
  }
}

export function createInvitation(ctx, email, role) {
  const token = randomToken(32);
  const id = newId();
  db.prepare('INSERT INTO invitations (id, org_id, email_lookup, email_enc, role, token_hash, expires_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, ctx.orgId, emailLookup(email), encrypt(email, `invite:${ctx.orgId}`), role, sha256(token), new Date(Date.now() + 7 * 86400e3).toISOString(), ctx.userId, now());
  return { id, token };
}

export function pendingInvites(ctx) {
  return db.prepare('SELECT * FROM invitations WHERE org_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?').all(ctx.orgId, now())
    .map((i) => ({ ...i, email: decrypt(i.email_enc, `invite:${ctx.orgId}`) }));
}

export { membershipsFor, raw };
