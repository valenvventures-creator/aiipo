import { html, raw } from '../http.js';
import { authShell } from './layout.js';
import { DEMOS } from '../demo.js';

const err = (e) => (e ? html`<div class="form-error" role="alert">${e}</div>` : '');
const ok = (m) => (m ? html`<div class="form-ok" role="status">${m}</div>` : '');
const csrf = (t) => html`<input type="hidden" name="_csrf" value="${t}">`;

export function loginPage({ nonce, csrfToken, error, notice, email = '' }) {
  return authShell({
    nonce, title: 'Log in',
    body: html`
<div class="auth-card">
  <h1>Welcome back.</h1>
  <p class="muted">Log in to continue your IPO workspace.</p>
  ${err(error)}${ok(notice)}
  <form method="post" action="/login" class="stack" novalidate>
    ${csrf(csrfToken)}
    <label>Email<input type="email" name="email" autocomplete="username" required maxlength="254" value="${email}" autofocus></label>
    <label>Password<input type="password" name="password" autocomplete="current-password" required maxlength="128"></label>
    <div class="row-between">
      <label class="check"><input type="checkbox" name="remember" value="1"> Keep me signed in</label>
      <a href="/forgot-password">Forgot password?</a>
    </div>
    <button class="btn btn-gold btn-block" type="submit">Log in</button>
  </form>
  <div class="demo-box">
    <h2>Explore the Thought Authorities Demo</h2>
    <p>A simulated company with seeded data - clearly labelled, fictional, and never presented as legal conclusions or live A.I. output.</p>
    <a class="btn btn-outline btn-block" href="/login?demo=1">Enter the demo workspace</a>
  </div>
  <p class="auth-switch">New to Thought Authorities? <a href="/signup">Create an account</a></p>
</div>`,
  });
}

export function demoPage({ nonce, csrfToken, error }) {
  return authShell({
    nonce, title: 'Live demo',
    body: html`
<div class="auth-card">
  <h1>Choose a demo company.</h1>
  <p class="muted">Each demo is an isolated, fictional workspace that is deleted automatically within two hours.</p>
  ${err(error)}
  <form method="post" action="/demo" class="stack">
    ${csrf(csrfToken)}
    <fieldset class="demo-options"><legend class="sr-only">Demo company</legend>
      ${Object.entries(DEMOS).map(([k, d], i) => html`<label class="demo-option"><input type="radio" name="kind" value="${k}" ${i === 0 ? raw('checked') : ''}><span><strong>${d.label}</strong><small>${d.blurb}</small></span></label>`)}
    </fieldset>
    <button class="btn btn-gold btn-block" type="submit">Enter the demo workspace</button>
  </form>
  <p class="auth-switch"><a href="/login">Back to log in</a></p>
</div>`,
  });
}

export function signupPage({ nonce, csrfToken, errors = {}, values = {} }) {
  const fe = (k) => (errors[k] ? html`<span class="field-error">${errors[k]}</span>` : '');
  return authShell({
    nonce, title: 'Create your account',
    body: html`
<div class="auth-card">
  <p class="eyebrow">Start your IPO plan</p>
  <h1>Create your account.</h1>
  <p class="muted">Your route, your evidence, your professional team - in one place.</p>
  ${err(errors._)}
  <form method="post" action="/signup" class="stack" novalidate>
    ${csrf(csrfToken)}
    <div class="two">
      <label>First name<input name="firstName" autocomplete="given-name" required maxlength="60" value="${values.firstName || ''}">${fe('firstName')}</label>
      <label>Last name<input name="lastName" autocomplete="family-name" required maxlength="60" value="${values.lastName || ''}">${fe('lastName')}</label>
    </div>
    <label>Work email<input type="email" name="email" autocomplete="email" required maxlength="254" value="${values.email || ''}">${fe('email')}</label>
    <label>Password<input type="password" name="password" autocomplete="new-password" required minlength="10" maxlength="128" aria-describedby="pw-hint">${fe('password')}</label>
    <p class="hint" id="pw-hint">At least 10 characters, including a letter and a number.</p>
    <label>Confirm password<input type="password" name="confirm" autocomplete="new-password" required maxlength="128">${fe('confirm')}</label>
    <label class="check"><input type="checkbox" name="terms" value="1" required> I agree to the <a href="/legal/terms" target="_blank" rel="noopener">Terms of Service</a>.</label>${fe('terms')}
    <label class="check"><input type="checkbox" name="privacy" value="1" required> I acknowledge the <a href="/legal/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</label>${fe('privacy')}
    <button class="btn btn-gold btn-block" type="submit">Create account</button>
  </form>
  <p class="auth-switch">Already have an account? <a href="/login">Log in</a></p>
</div>`,
  });
}

export function checkEmailPage({ nonce, title, heading, text }) {
  return authShell({
    nonce, title,
    body: html`<div class="auth-card"><p class="eyebrow">Check your inbox</p><h1>${heading}</h1><p class="muted">${text}</p>
      <p class="auth-switch"><a href="/login">Back to log in</a></p></div>`,
  });
}

export function forgotPage({ nonce, csrfToken, sent, error }) {
  return authShell({
    nonce, title: 'Reset your password',
    body: html`
<div class="auth-card">
  <p class="eyebrow">Account recovery</p>
  <h1>Forgot your password?</h1>
  ${sent ? ok('If an account exists for that email, a secure reset link is on its way. It expires in 30 minutes.') : html`<p class="muted">Enter your email and we'll send a secure link that expires in 30 minutes.</p>`}
  ${err(error)}
  <form method="post" action="/forgot-password" class="stack">
    ${csrf(csrfToken)}
    <label>Email<input type="email" name="email" autocomplete="email" required maxlength="254"></label>
    <button class="btn btn-gold btn-block" type="submit">Send reset link</button>
  </form>
  <p class="auth-switch"><a href="/login">Back to log in</a></p>
</div>`,
  });
}

export function resetPage({ nonce, csrfToken, token, errors = {}, invalid }) {
  return authShell({
    nonce, title: 'Choose a new password',
    body: html`
<div class="auth-card">
  <p class="eyebrow">Account recovery</p>
  <h1>Choose a new password.</h1>
  ${invalid ? html`${err('This reset link is invalid or has expired.')}<p><a class="btn btn-outline" href="/forgot-password">Request a new link</a></p>` : html`
  ${err(errors._)}
  <form method="post" action="/reset-password" class="stack">
    ${csrf(csrfToken)}<input type="hidden" name="token" value="${token}">
    <label>New password<input type="password" name="password" autocomplete="new-password" required minlength="10" maxlength="128">${errors.password ? html`<span class="field-error">${errors.password}</span>` : ''}</label>
    <p class="hint">At least 10 characters, including a letter and a number.</p>
    <label>Confirm password<input type="password" name="confirm" autocomplete="new-password" required maxlength="128">${errors.confirm ? html`<span class="field-error">${errors.confirm}</span>` : ''}</label>
    <button class="btn btn-gold btn-block" type="submit">Update password</button>
  </form>`}
</div>`,
  });
}

export function mfaPage({ nonce, csrfToken, error }) {
  return authShell({
    nonce, title: 'Two-step verification',
    body: html`
<div class="auth-card">
  <p class="eyebrow">Two-step verification</p>
  <h1>Enter your 6-digit code.</h1>
  <p class="muted">Open your authenticator app. You can also use one of your recovery codes.</p>
  ${err(error)}
  <form method="post" action="/login/mfa" class="stack">
    ${csrf(csrfToken)}
    <label>Verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="20" autofocus></label>
    <button class="btn btn-gold btn-block" type="submit">Verify</button>
  </form>
  <p class="auth-switch"><a href="/login">Use a different account</a></p>
</div>`,
  });
}

export function messagePage({ nonce, title, heading, text, link = ['/login', 'Go to log in'] }) {
  return authShell({ nonce, title, body: html`<div class="auth-card"><h1>${heading}</h1><p class="muted">${text}</p><p><a class="btn btn-gold" href="${link[0]}">${link[1]}</a></p></div>` });
}

export function outboxPage({ nonce, messages }) {
  return authShell({
    nonce, title: 'Development outbox',
    body: html`<div class="auth-card wide"><p class="eyebrow">Development only</p><h1>Email outbox</h1>
      <p class="muted">No mail provider is configured, so messages are stored here. This page does not exist in production.</p>
      ${messages.map((m) => html`<article class="outbox-item"><h2>${m.subject}</h2><p class="muted">To ${m.to} · ${m.created_at}</p><pre>${m.body}</pre></article>`)}
    </div>`,
  });
}
