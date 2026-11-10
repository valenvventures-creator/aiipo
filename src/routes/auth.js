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

async function startSession(res, req, user, { remember = false, stage = 'full', hours } = {}) {
  const s = await createSession(user.id, { remember, stage, ua: req.headers['user-agent'], hours });
  const maxAge = remember && stage === 'full' ? config.session.rememberDays * 86400 : undefined; // otherwise a browser-session cookie
  appendCookie(res, serializeCookie(SESSION_COOKIE, s.token, { maxAge }));
  return s;
}

async function sendVerification(user) {
  const token = await issueToken(user.id, 'verify', config.auth.verifyTokenHours * 60);
  const p = userProfile(user);
  await sendMail({ kind: 'verify', to: p.email, subject: 'Verify your email - Thought Authorities A.I. IPO',
    text: `Hello ${p.firstName},\n\nConfirm your email to activate your account:\n${config.baseUrl}/verify-email?token=${token}\n\nThis link expires in ${config.auth.verifyTokenHours} hours. If you did not create an account, ignore this message.` });
}

async function acceptPendingInvite(req, user) {
  const tok = req.cookies[INVITE_COOKIE];
  if (!tok) return null;
  const inv = await db.get('SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', sha256(tok), now());
  if (!inv || inv.email_lookup !== user.email_lookup) return null;
  if (!await db.get('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', inv.org_id, user.id)) await addMembership(inv.org_id, user.id, inv.role);
  await db.run('UPDATE invitations SET accepted_at = ? WHERE id = ?', now(), inv.id);
  await audit({ orgId: inv.org_id, userId: user.id, action: 'invite.accept', target: inv.id });
  return inv.org_id;
}

export function register(r) {
  r.get('/login', async (req) => {
    if (req.query.get('demo')) return { html: V.demoPage({ nonce: req.nonce, csrfToken: req.anonCsrf }) };
    if (req.session?.stage === 'full') return { redirect: '/app' };
    const notice = { verified: 'Email verified. You can log in now.', reset: 'Password updated. Log in with your new password.', out: 'You have been logged out.', expired: 'Your session expired. Please log in again.' }[req.query.get('m')];
    return { html: V.loginPage({ nonce: req.nonce, csrfToken: req.anonCsrf, notice }) };
  });

  r.post('/login', async (req, res) => {
    const email = str(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password.slice(0, 128) : '';
    const view = (error, status = 400) => ({ status, html: V.loginPage({ nonce: req.nonce, csrfToken: req.anonCsrf, error, email }) });
    const ipLimit = await rateLimit(`login-ip:${req.ip}`, 30, 15 * 60e3);
    const acctLimit = await rateLimit(`login-acct:${emailLookup(email)}`, 10, 15 * 60e3);
    if (!ipLimit.ok || !acctLimit.ok) return { ...view('Too many attempts. Please wait a few minutes and try again.', 429), headers: { 'Retry-After': String(Math.max(ipLimit.retryAfter, acctLimit.retryAfter)) } };
    const result = await checkCredentials(email, password);
    if (result.error) {
      await audit({ userId: result.userId || null, action: result.locked ? 'auth.lockout' : 'auth.login.failed', ip: req.ip });
      return view(result.error, 401);
    }
    const user = result.user;
    if (user.is_demo) return view('Email or password is incorrect.', 401);
    if (!user.email_verified_at && config.requireEmailVerification) {
      if ((await rateLimit(`verify-resend:${user.id}`, 3, 60 * 60e3)).ok) await sendVerification(user);
      return view('Please verify your email first. We have sent you a new verification link.', 403);
    }
    if (req.session) await destroySession(req.session.id); // session fixation defence
    const remember = req.body.remember === '1';
    if (user.mfa_enabled) {
      await startSession(res, req, user, { remember, stage: 'mfa' });
      return { redirect: '/login/mfa' };
    }
    await startSession(res, req, user, { remember });
    await acceptPendingInvite(req, user);
    await audit({ userId: user.id, action: 'auth.login', ip: req.ip });
    return { redirect: '/app' };
  });

  r.get('/login/mfa', async (req) => {
    if (req.session?.stage !== 'mfa') return { redirect: '/login' };
    return { html: V.mfaPage({ nonce: req.nonce, csrfToken: req.session.csrf }) };
  });

  r.post('/login/mfa', async (req, res) => {
    if (req.session?.stage !== 'mfa') return { redirect: '/login' };
    const lim = await rateLimit(`mfa:${req.session.user_id}`, 6, 10 * 60e3);
    if (!lim.ok) { await destroySession(req.session.id); return { redirect: '/login?m=expired' }; }
    if (!await verifyMfa(req.session.user_id, str(req.body.code, 20))) {
      await audit({ userId: req.session.user_id, action: 'auth.mfa.failed', ip: req.ip });
      return { status: 401, html: V.mfaPage({ nonce: req.nonce, csrfToken: req.session.csrf, error: 'That code did not work. Check the time on your device and try again.' }) };
    }
    const user = await getUser(req.session.user_id);
    await destroySession(req.session.id);
    await startSession(res, req, user, { remember: Boolean(req.session.remember) });
    await acceptPendingInvite(req, user);
    await audit({ userId: user.id, action: 'auth.login', detail: { mfa: true }, ip: req.ip });
    return { redirect: '/app' };
  });

  r.post('/demo', async (req, res) => {
    const lim = await rateLimit(`demo:${req.ip}`, 10, 60 * 60e3);
    if (!lim.ok) return { status: 429, html: V.demoPage({ nonce: req.nonce, csrfToken: req.anonCsrf, error: 'Demo limit reached for now. Please try again later.' }) };
    await purgeExpiredDemos();
    const { user, orgId } = await createDemo(str(req.body.kind, 40));
    if (req.session) await destroySession(req.session.id);
    await startSession(res, req, user, { hours: config.session.demoHours });
    await audit({ orgId, userId: user.id, action: 'demo.create', ip: req.ip });
    return { redirect: '/app' };
  });

  r.get('/signup', async (req) => (req.session?.stage === 'full' ? { redirect: '/app' } : { html: V.signupPage({ nonce: req.nonce, csrfToken: req.anonCsrf }) }));

  r.post('/signup', async (req, res) => {
    const values = { firstName: str(req.body.firstName, 60), lastName: str(req.body.lastName, 60), email: str(req.body.email, 254).toLowerCase() };
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const errors = {};
    if (!(await rateLimit(`signup:${req.ip}`, 10, 60 * 60e3)).ok) errors._ = 'Too many sign-up attempts from this network. Please try again later.';
    if (!values.firstName) errors.firstName = 'Enter your first name.';
    if (!values.lastName) errors.lastName = 'Enter your last name.';
    if (!validateEmail(values.email)) errors.email = 'Enter a valid work email.';
    const pw = passwordProblems(password, values.email);
    if (pw.length) errors.password = pw.join(' ');
    if (password !== req.body.confirm) errors.confirm = 'Passwords do not match.';
    if (req.body.terms !== '1') errors.terms = 'You must agree to the Terms of Service.';
    if (req.body.privacy !== '1') errors.privacy = 'You must acknowledge the Privacy Policy.';
    if (Object.keys(errors).length) return { status: 400, html: V.signupPage({ nonce: req.nonce, csrfToken: req.anonCsrf, errors, values }) };

    const existing = await findUserByEmail(values.email);
    if (!config.requireEmailVerification) {
      // No email delivery configured: activate the account immediately and sign the person in.
      if (existing) {
        return { status: 400, html: V.signupPage({ nonce: req.nonce, csrfToken: req.anonCsrf, values, errors: { _: 'We could not create an account with those details. If you already have an account, log in instead.' } }) };
      }
      const user = await createUser({ ...values, password, verified: false });
      const orgId = await createOrg(`${values.firstName} ${values.lastName}'s organization`);
      await addMembership(orgId, user.id, 'founder');
      await audit({ orgId, userId: user.id, action: 'auth.signup', detail: { emailVerification: 'not configured' }, ip: req.ip });
      if (req.session) await destroySession(req.session.id);
      await startSession(res, req, user);
      await acceptPendingInvite(req, user);
      return { redirect: '/app/onboarding' };
    }
    if (existing) {
      // Do not reveal that the account exists; tell the owner instead.
      await sendMail({ kind: 'notice', to: values.email, subject: 'Sign-up attempt - Thought Authorities A.I. IPO',
        text: `Someone tried to create an account with this email. If it was you, log in or reset your password at ${config.baseUrl}/forgot-password. If not, you can ignore this message.` });
    } else {
      const user = await createUser({ ...values, password });
      const orgId = await createOrg(`${values.firstName} ${values.lastName}'s organization`);
      await addMembership(orgId, user.id, 'founder');
      await audit({ orgId, userId: user.id, action: 'auth.signup', ip: req.ip });
      await sendVerification(user);
    }
    return { html: V.checkEmailPage({ nonce: req.nonce, title: 'Verify your email', heading: 'Confirm your email to continue.', text: `If ${values.email} can be registered, we've sent a verification link. It expires in ${config.auth.verifyTokenHours} hours.` }) };
  });

  r.get('/verify-email', async (req) => {
    const row = await consumeToken(str(req.query.get('token'), 100), 'verify');
    if (!row) return { status: 400, html: V.messagePage({ nonce: req.nonce, title: 'Link expired', heading: 'This verification link is invalid or has expired.', text: 'Log in with your email and password and we will send a new link.' }) };
    await markVerified(row.user_id);
    await audit({ userId: row.user_id, action: 'auth.email.verified' });
    return { redirect: '/login?m=verified' };
  });

  r.get('/forgot-password', async (req) => ({ html: V.forgotPage({ nonce: req.nonce, csrfToken: req.anonCsrf }) }));

  r.post('/forgot-password', async (req) => {
    const email = str(req.body.email, 254).toLowerCase();
    if (!(await rateLimit(`forgot-ip:${req.ip}`, 10, 60 * 60e3)).ok || !(await rateLimit(`forgot:${emailLookup(email)}`, 3, 60 * 60e3)).ok) {
      return { status: 429, html: V.forgotPage({ nonce: req.nonce, csrfToken: req.anonCsrf, error: 'Too many requests. Please try again later.' }) };
    }
    if (!config.mailAvailable) {
      return { html: V.forgotPage({ nonce: req.nonce, csrfToken: req.anonCsrf, error: 'Password reset by email is not enabled on this site yet. Please contact the site administrator.' }) };
    }
    const user = validateEmail(email) ? await findUserByEmail(email) : null;
    if (user && !user.is_demo) {
      const token = await issueToken(user.id, 'reset', config.auth.resetTokenMinutes);
      await sendMail({ kind: 'reset', to: email, subject: 'Reset your password - Thought Authorities A.I. IPO',
        text: `A password reset was requested for your account.\n\nChoose a new password: ${config.baseUrl}/reset-password?token=${token}\n\nThis secure link expires in ${config.auth.resetTokenMinutes} minutes and works once. If you did not request it, ignore this email - your password is unchanged.` });
      await audit({ userId: user.id, action: 'auth.reset.requested', ip: req.ip });
    }
    return { html: V.forgotPage({ nonce: req.nonce, csrfToken: req.anonCsrf, sent: true }) };
  });

  r.get('/reset-password', async (req) => {
    const token = str(req.query.get('token'), 100);
    return { html: V.resetPage({ nonce: req.nonce, csrfToken: req.anonCsrf, token, invalid: !await peekToken(token, 'reset') }) };
  });

  r.post('/reset-password', async (req) => {
    const token = str(req.body.token, 100);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const row = await peekToken(token, 'reset');
    if (!row) return { status: 400, html: V.resetPage({ nonce: req.nonce, csrfToken: req.anonCsrf, invalid: true }) };
    const user = await getUser(row.user_id);
    const errors = {};
    const pw = passwordProblems(password, userProfile(user).email);
    if (pw.length) errors.password = pw.join(' ');
    if (password !== req.body.confirm) errors.confirm = 'Passwords do not match.';
    if (Object.keys(errors).length) return { status: 400, html: V.resetPage({ nonce: req.nonce, csrfToken: req.anonCsrf, token, errors }) };
    if (!await consumeToken(token, 'reset')) return { status: 400, html: V.resetPage({ nonce: req.nonce, csrfToken: req.anonCsrf, invalid: true }) };
    await setPassword(user.id, password);
    await markVerified(user.id); // receiving the reset email proves control of the address
    await destroyUserSessions(user.id);
    await audit({ userId: user.id, action: 'auth.reset.completed', ip: req.ip });
    return { redirect: '/login?m=reset' };
  });

  r.post('/logout', async (req, res) => {
    if (req.session) { await audit({ userId: req.session.user_id, action: 'auth.logout' }); await destroySession(req.session.id); }
    appendCookie(res, serializeCookie(SESSION_COOKIE, '', { maxAge: 0 }));
    return { redirect: '/login?m=out' };
  });

  r.get('/invite', async (req, res) => {
    const token = str(req.query.get('token'), 100);
    const inv = await db.get('SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', sha256(token), now());
    if (!inv) return { status: 400, html: V.messagePage({ nonce: req.nonce, title: 'Invitation', heading: 'This invitation is invalid or has expired.', text: 'Ask your administrator to send a new invitation.' }) };
    appendCookie(res, serializeCookie(INVITE_COOKIE, token, { maxAge: 7 * 86400, sameSite: 'Lax' }));
    const email = decrypt(inv.email_enc, `invite:${inv.org_id}`);
    if (req.session?.stage === 'full') {
      const u = await getUser(req.session.user_id);
      if (await acceptPendingInvite({ cookies: { [INVITE_COOKIE]: token } }, u)) return { redirect: '/app' };
    }
    return { html: V.messagePage({ nonce: req.nonce, title: 'Invitation', heading: 'You have been invited to an IPO workspace.', text: `Log in or create an account with ${email} to accept. The invitation is applied automatically after you sign in.`, link: ['/login', 'Log in to accept'] }) };
  });

  if (config.devOutbox) {
    r.get('/dev/outbox', async (req) => {
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (!loopback) return { status: 404, text: 'Not found' };
      return { html: V.outboxPage({ nonce: req.nonce, messages: await devOutbox() }) };
    });
  }
}

export async function createInvitation(ctx, email, role) {
  const token = randomToken(32);
  const id = newId();
  await db.run('INSERT INTO invitations (id, org_id, email_lookup, email_enc, role, token_hash, expires_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)', id, ctx.orgId, emailLookup(email), encrypt(email, `invite:${ctx.orgId}`), role, sha256(token), new Date(Date.now() + 7 * 86400e3).toISOString(), ctx.userId, now());
  return { id, token };
}

export async function pendingInvites(ctx) {
  return (await db.all('SELECT * FROM invitations WHERE org_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', ctx.orgId, now()))
    .map((i) => ({ ...i, email: decrypt(i.email_enc, `invite:${ctx.orgId}`) }));
}

export { membershipsFor, raw };
