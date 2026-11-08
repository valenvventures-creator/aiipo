// HTTP server: security headers, static assets, session loading, CSRF and origin checks, routing and
// safe error handling (no stack traces or internal messages leak to clients).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, ROOT, IS_PROD } from './config.js';
import {
  Router, securityHeaders, nonce as makeNonce, parseCookies, parseBody, clientIp, HttpError, SESSION_COOKIE, serializeCookie, appendCookie, html, toHtml,
} from './http.js';
import { loadSession } from './security/auth.js';
import { randomToken, safeEqual } from './security/crypto.js';
import { register as registerAuth } from './routes/auth.js';
import { register as registerApp, buildCtx } from './routes/app.js';
import { landing, securityPage, legalPage } from './views/marketing.js';
import { errorPage } from './views/app.js';
import { messagePage } from './views/auth.js';
import { purgeExpiredDemos } from './demo.js';

const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };
const ANON_CSRF = config.secureCookies ? '__Host-ta_csrf' : 'ta_csrf';
const allowedOrigin = new URL(config.baseUrl).origin;

const router = new Router();
router.get('/', (req) => ({ html: landing({ nonce: req.nonce, session: req.session?.stage === 'full' }) }));
router.get('/security', (req) => ({ html: securityPage({ nonce: req.nonce, session: req.session?.stage === 'full' }) }));
router.get('/legal/terms', (req) => ({ html: legalPage({ nonce: req.nonce, kind: 'terms', session: req.session?.stage === 'full' }) }));
router.get('/legal/privacy', (req) => ({ html: legalPage({ nonce: req.nonce, kind: 'privacy', session: req.session?.stage === 'full' }) }));
router.get('/healthz', () => ({ text: 'ok' }));
registerAuth(router);
registerApp(router);

function serveStatic(req, res, pathname) {
  if (!/^\/(css|js|brand)\/[\w.-]+$|^\/(favicon\.png|apple-touch-icon\.png|robots\.txt)$/.test(pathname)) return false;
  const file = path.join(PUBLIC, path.normalize(pathname));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file)) return false;
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', IS_PROD ? 'public, max-age=86400' : 'no-cache');
  res.writeHead(200);
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  return true;
}

function originOk(req) {
  const origin = req.headers.origin;
  // Behind a trusted reverse proxy (TRUST_PROXY=true) the public host arrives as X-Forwarded-Host.
  const fwd = config.trustProxy && req.headers['x-forwarded-host'];
  if (origin && fwd && origin === `https://${String(fwd).split(',')[0].trim()}`) return true;
  if (origin) return origin === allowedOrigin || origin === `http://${req.headers.host}` && !IS_PROD || origin === `https://${req.headers.host}`;
  const ref = req.headers.referer;
  if (ref) { try { const o = new URL(ref).origin; return o === allowedOrigin || o.endsWith(`//${req.headers.host}`); } catch { return false; } }
  return !IS_PROD; // non-browser clients in development (tests); browsers always send Origin on POST
}

function send(res, out) {
  const status = out.status || (out.redirect ? 303 : 200);
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  res.setHeader('Cache-Control', 'no-store');
  if (out.redirect) { res.setHeader('Location', out.redirect); res.writeHead(status); return res.end(); }
  if (out.json !== undefined) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(out.status || 200); return res.end(JSON.stringify(out.json)); }
  if (out.csv !== undefined) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.writeHead(200); return res.end('﻿' + out.csv);
  }
  if (out.file) {
    res.setHeader('Content-Type', out.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(out.filename).replace(/['()]/g, escape)}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.writeHead(200); return res.end(out.file);
  }
  if (out.text !== undefined) { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.writeHead(status); return res.end(out.text); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.writeHead(status);
  res.end(toHtml(out.html));
}

export async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const pathname = url.pathname;
  req.nonce = makeNonce();
  securityHeaders(res, req.nonce);
  if (pathname.length > 512 || /[\0]/.test(pathname)) { res.writeHead(400); return res.end(); }
  if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, pathname)) return;

  req.query = url.searchParams;
  req.ip = clientIp(req);
  req.cookies = parseCookies(req.headers.cookie);
  req.session = loadSession(req.cookies[SESSION_COOKIE], req.headers['user-agent']);
  // Double-submit CSRF token for anonymous forms (log in, sign up, reset).
  req.anonCsrf = req.cookies[ANON_CSRF];
  if (!req.anonCsrf || req.anonCsrf.length > 64) {
    req.anonCsrf = randomToken(24);
    appendCookie(res, serializeCookie(ANON_CSRF, req.anonCsrf, { sameSite: 'Strict' }));
  }

  try {
    const route = router.match(req.method, pathname);
    if (!route) throw new HttpError(req.method === 'GET' || req.method === 'HEAD' ? 404 : 405, req.method === 'GET' ? 'Page not found.' : 'Method not allowed.');
    req.params = route.params;
    if (req.method === 'POST') {
      if (!originOk(req)) throw new HttpError(403, 'Cross-site request blocked.');
      const limit = pathname === '/app/dataroom/upload' ? Math.ceil(config.uploads.maxBytes * 1.4) + 4096 : 256 * 1024;
      req.body = await parseBody(req, limit);
      const sent = req.headers['x-csrf-token'] || req.body._csrf;
      const expected = req.session ? req.session.csrf : req.anonCsrf;
      // Anonymous forms may be submitted while a stale session cookie exists; accept either valid token.
      const ok = (sent && expected && safeEqual(sent, expected)) || (sent && req.anonCsrf && !pathname.startsWith('/app') && safeEqual(sent, req.anonCsrf));
      if (!ok) throw new HttpError(403, 'Your form expired. Go back, refresh the page and try again.');
    } else req.body = {};
    const out = await route.handler(req, res);
    send(res, out);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[error]', req.method, pathname, e);
    const message = status >= 500 ? 'Something went wrong. Nothing was changed.' : e.message;
    if (res.headersSent) return res.end();
    if (pathname === '/app/dataroom/upload' || (req.method === 'POST' && pathname === '/app/guide')) return send(res, { status, json: { error: message } });
    const ctx = req.session?.stage === 'full' ? safeCtx(req) : null;
    const page = ctx ? errorPage({ ctx, nonce: req.nonce, status, message }) : messagePage({ nonce: req.nonce, title: 'Error', heading: message, text: `Error ${status}.`, link: ['/', 'Go to home page'] });
    send(res, { status, html: page });
  }
}

function safeCtx(req) { try { return buildCtx(req); } catch { return null; } }

export function start() {
  const server = http.createServer({ requestTimeout: 60_000, headersTimeout: 20_000, maxHeaderSize: 16 * 1024 }, handle);
  server.listen(config.port, config.host, () => {
    console.log(`Thought Authorities A.I. IPO listening on http://${config.host}:${config.port} (${IS_PROD ? 'production' : 'development'})`);
    if (!config.ai.enabled) console.log('[ai] No ANTHROPIC_API_KEY set - the guide runs in rule-based mode.');
    if (config.devOutbox) console.log(`[mail] Development outbox: ${config.baseUrl}/dev/outbox`);
  });
  setInterval(() => { try { purgeExpiredDemos(); } catch (e) { console.error('[demo purge]', e.message); } }, 10 * 60e3).unref();
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) start();
export { html };
