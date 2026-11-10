// Minimal HTTP toolkit: auto-escaping HTML templates, routing, body parsing with size limits,
// cookies, security headers and rate limiting. Kept dependency-free to reduce supply-chain risk.
import crypto from 'node:crypto';
import { config, IS_PROD } from './config.js';

// ---------- HTML templating (escape by default) ----------
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: String(s) });
export function esc(v) {
  return String(v ?? '').replace(/[&<>"'`=]/g, (c) => `&#${c.charCodeAt(0)};`);
}
function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && RAW in v) return v[RAW];
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return raw(out);
}

// ---------- Errors ----------
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- Cookies ----------
export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
  }
  return out;
}

export const SESSION_COOKIE = config.secureCookies ? '__Host-ta_sid' : 'ta_sid';

export function serializeCookie(name, value, { maxAge, httpOnly = true, sameSite = 'Lax' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=${sameSite}`;
  if (httpOnly) c += '; HttpOnly';
  if (config.secureCookies) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${Math.floor(maxAge)}`;
  return c;
}

// ---------- Security headers ----------
export function securityHeaders(res, nonce) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    ...(IS_PROD ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin'); // never leaks URLs (e.g. reset tokens) to other sites; keeps Origin on same-site POSTs
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (config.secureCookies && IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
}

// ---------- Body parsing ----------
export function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Request is too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function parseBody(req, limit) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim();
  const buf = await readBody(req, limit);
  if (type === 'application/json') {
    try { return JSON.parse(buf.toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Malformed JSON.'); }
  }
  if (type === 'application/x-www-form-urlencoded' || type === '') {
    const params = new URLSearchParams(buf.toString('utf8'));
    const out = {};
    for (const [k, v] of params) {
      if (k in out) out[k] = [].concat(out[k], v); else out[k] = v;
    }
    return out;
  }
  throw new HttpError(415, 'Unsupported content type.');
}

// ---------- Rate limiting (fixed window, stored in the database so every serverless instance shares it) ----------
export async function rateLimit(key, max, windowMs) {
  const { db } = await import('./db.js');
  const { hmac } = await import('./security/crypto.js');
  const t = Date.now();
  const k = hmac(key, 'ratelimit').slice(0, 40); // never store raw IPs or identifiers
  const row = await db.get(`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < ? THEN excluded.reset_at ELSE rate_limits.reset_at END
    RETURNING count, reset_at`, k, t + windowMs, t, t);
  if (Math.random() < 0.01) await db.run('DELETE FROM rate_limits WHERE reset_at < ?', t);
  return { ok: row.count <= max, retryAfter: Math.max(1, Math.ceil((Number(row.reset_at) - t) / 1000)) };
}
export async function resetRateLimits() {
  const { db } = await import('./db.js');
  await db.run('DELETE FROM rate_limits');
}

// ---------- Router ----------
export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([A-Za-z0-9_-]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler, opts });
  }
  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const m = r.re.exec(pathname);
      if (m) return { ...r, params: Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]])) };
    }
    return null;
  }
}

export const nonce = () => crypto.randomBytes(16).toString('base64');

export function clientIp(req) {
  if (config.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

export function str(v, max = 2000) {
  if (Array.isArray(v)) v = v[0];
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Append a Set-Cookie header without overwriting cookies set earlier in the same response. */
export function appendCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
}

/** Serialize a value produced by html`` (or a plain string) to a string. */
export const toHtml = (v) => (typeof v === 'string' ? v : v?.[RAW] ?? '');
