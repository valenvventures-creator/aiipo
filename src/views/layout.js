import { html, raw } from '../http.js';
import { ROLES } from '../security/permissions.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap';

export function document({ title, body, nonce, bodyClass = '', description = 'Thought Authorities A.I. IPO - a guided workspace for Canadian and US IPO readiness, execution and public-company life.' }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Thought Authorities A.I. IPO</title>
<meta name="description" content="${description}">
<meta name="robots" content="${bodyClass.includes('app') ? 'noindex, nofollow' : 'index, follow'}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/css/site.css">
<script src="/js/app.js" defer nonce="${nonce}"></script>
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
${body}
</body>
</html>`;
}

/**
 * Brand lockup built from the original crest and wordmark artwork (unchanged).
 * layout 'h': crest | divider | wordmark over "A.I. IPO" (headers).
 * layout 'v': crest, wordmark and "A.I. IPO" stacked on one centre axis (sidebar, footer, sign-in panel).
 * size: 'sm' | 'md' | 'lg'. tone: 'light' (on ivory) or 'dark' (on navy).
 */
export const brandLockup = (href = '/', { layout = 'h', size = 'md', tone = 'light' } = {}) => html`<a class="lockup lockup-${layout} lockup-${size} lockup-${tone}" href="${href}" aria-label="Thought Authorities A.I. IPO - home">
  <img class="lk-crest" src="/brand/${size === 'lg' ? 'crest-600' : 'crest-256'}.png" alt="" width="256" height="156">
  ${layout === 'h' ? raw('<span class="lk-divider" aria-hidden="true"></span>') : ''}
  <span class="lk-text"><img class="lk-word" src="/brand/wordmark-600.png" alt="Thought Authorities" width="600" height="173"><span class="lk-sub"><span>A.I.&nbsp;IPO</span></span></span>
</a>`;

export function marketingShell({ body, nonce, title, session }) {
  return document({
    title, nonce, bodyClass: 'mkt',
    body: html`
<header class="mkt-header">
  <div class="wrap mkt-header-in">
    ${brandLockup('/', { layout: 'h', size: 'md', tone: 'light' })}
    <nav class="mkt-nav" aria-label="Primary">
      <a href="/#route">The route</a><a href="/#workspace">Workspace</a><a href="/#numbers">Numbers</a><a href="/#security">Security</a><a href="/#faq">FAQ</a>
    </nav>
    <div class="mkt-cta">
      ${session ? html`<a class="btn btn-gold" href="/app">Open workspace</a>` : html`<a class="link-quiet" href="/login">Sign in</a><a class="btn btn-gold" href="/signup">Start your IPO plan</a>`}
    </div>
  </div>
</header>
<main id="main">${body}</main>
<footer class="mkt-footer">
  <div class="wrap footer-grid">
    <div>
      ${brandLockup('/', { layout: 'v', size: 'md', tone: 'dark' })}
      <p class="muted">Your IPO, organized by A.I. and decided by professionals.</p>
    </div>
    <div><h3>Product</h3><a href="/#route">The route</a><a href="/#workspace">Workspace</a><a href="/#numbers">Financial tools</a><a href="/security">Security</a></div>
    <div><h3>Company</h3><a href="/legal/terms">Terms</a><a href="/legal/privacy">Privacy</a><a href="/#faq">FAQ</a></div>
    <div><h3>Get in</h3><a href="/signup">Create an account</a><a href="/login">Sign in</a><a href="/login?demo=1">Live demo</a></div>
  </div>
  <div class="wrap footer-legal">
    <p>© ${new Date().getFullYear()} Thought Authorities · A.I. IPO</p>
    <p>Thought Authorities A.I. IPO is preparation and coordination software. It is not a law firm, accounting firm, dealer or exchange, does not provide legal, tax, audit or investment advice, and does not sell securities. The A.I. guide is an artificial-intelligence system and never represents itself as a licensed professional.</p>
  </div>
</footer>`,
  });
}

export function authShell({ body, nonce, title }) {
  return document({
    title, nonce, bodyClass: 'auth',
    body: html`
<main id="main" class="auth-grid">
  <aside class="auth-panel" aria-hidden="false">
    ${brandLockup('/', { layout: 'v', size: 'lg', tone: 'dark' })}
    <p class="auth-tag">One route. Every requirement. Verified evidence.</p>
    <p class="auth-sub">Calm preparation. Professional judgment.</p>
    <ul class="auth-points">
      <li>Encrypted at rest and in transit</li><li>Multi-factor authentication</li><li>Tamper-evident audit trail</li>
    </ul>
  </aside>
  <section class="auth-main">${body}</section>
</main>`,
  });
}

export const NAV = [
  ['dashboard', 'Dashboard', '/app'],
  ['roadmap', 'IPO Roadmap', '/app/roadmap'],
  ['tasks', 'Tasks & Calendar', '/app/tasks'],
  ['finance', 'Financial Readiness', '/app/finance'],
  ['legal', 'Legal & Governance', '/app/legal'],
  ['disclosure', 'Disclosure Workspace', '/app/disclosure'],
  ['capital', 'Capital & Valuation', '/app/capital'],
  ['communications', 'Communications & IR', '/app/communications'],
  ['dataroom', 'Data Room', '/app/dataroom'],
  ['advisors', 'Advisors & Resources', '/app/advisors'],
  ['learn', 'Learning Centre', '/app/learn'],
  ['public', 'Public Company Ops', '/app/public-company'],
  ['settings', 'Settings', '/app/settings'],
];

export function appShell({ ctx, active, title, body, nonce, flash }) {
  const projects = ctx.projects || [];
  return document({
    title, nonce, bodyClass: 'app',
    body: html`
${ctx.isDemo ? html`<div class="demo-bar" role="status">Demo workspace · fictional company and illustrative data · not legal conclusions · deleted automatically within 2 hours. <a href="/signup">Create your own account</a></div>` : ''}
<div class="app-grid">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">${brandLockup('/app', { layout: 'v', size: 'sm', tone: 'dark' })}</div>
    <nav aria-label="Workspace">
      ${NAV.map(([k, label, href]) => html`<a href="${href}" class="${k === active ? 'active' : ''}" ${k === active ? raw('aria-current="page"') : ''}>${label}</a>`)}
    </nav>
    <div class="sidebar-foot">
      <a href="/app/guide" class="guide-link ${active === 'guide' ? 'active' : ''}">Ask the A.I. guide</a>
    </div>
  </aside>
  <div class="app-main">
    <header class="topbar">
      <button class="menu-btn" type="button" data-toggle="sidebar" aria-controls="sidebar" aria-expanded="false">Menu</button>
      ${projects.length ? html`<form method="post" action="/app/switch-project" class="project-switch">
        <input type="hidden" name="_csrf" value="${ctx.csrf}">
        <label for="proj" class="sr-only">Project</label>
        <select id="proj" name="projectId" data-autosubmit>${projects.map((p) => html`<option value="${p.id}" ${p.id === ctx.project?.id ? raw('selected') : ''}>${p.name}</option>`)}</select>
      </form>` : ''}
      <div class="topbar-right">
        <span class="role-chip" title="Your role in ${ctx.orgName}">${ROLES[ctx.role]}</span>
        ${ctx.profile.mfa || ctx.isDemo ? "" : html`<a class="chip-warn" href="/app/settings#mfa">Turn on MFA</a>`}
        <span class="user-name">${ctx.profile.firstName} ${ctx.profile.lastName}</span>
        <form method="post" action="/logout"><input type="hidden" name="_csrf" value="${ctx.csrf}"><button class="btn btn-ghost btn-sm" type="submit">Log out</button></form>
      </div>
    </header>
    <main id="main" class="content">
      ${flash ? html`<div class="flash flash-${flash.type || 'info'}" role="status">${flash.text}</div>` : ''}
      ${body}
    </main>
  </div>
</div>`,
  });
}

export const statusBadge = (s) => html`<span class="badge badge-${String(s).toLowerCase().replace(/[^a-z]+/g, '-')}">${s}</span>`;
export const classBadge = (c, label) => html`<span class="cls cls-${c}">${label}</span>`;
export const csrfField = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;
export const srcLink = (id, SOURCES) => SOURCES[id] ? html`<a class="src" href="${SOURCES[id][2]}" target="_blank" rel="noopener noreferrer" title="${SOURCES[id][0]} - ${SOURCES[id][1]}">${id}</a>` : html`<span class="src">${id}</span>`;
