// Cryptographic primitives: password hashing (scrypt), envelope-style field encryption
// (AES-256-GCM with per-purpose derived keys), token generation and constant-time compare.
import crypto from 'node:crypto';
import { config } from '../config.js';

const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, N, r, p, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(actual, expected);
}

// A fixed dummy hash lets login spend the same time whether or not the account exists.
let dummyHash;
export function burnPasswordCheck(password) {
  dummyHash ??= hashPassword(crypto.randomBytes(12).toString('hex'));
  verifyPassword(password, dummyHash);
}

const keyCache = new Map();
function subkey(purpose) {
  if (!config.masterKey) throw new Error('Encryption key not loaded (call ensureMasterKey first).');
  if (!keyCache.has(purpose)) {
    keyCache.set(purpose, Buffer.from(crypto.hkdfSync('sha256', config.masterKey, Buffer.alloc(0), `ta-ipo:${purpose}`, 32)));
  }
  return keyCache.get(purpose);
}

// Ciphertext format: v1.<iv>.<tag>.<data> (base64url). Associated data binds the value to its context
// (e.g. org id + table) so a ciphertext copied into another tenant's row fails to decrypt.
export function encrypt(plain, aad = '', purpose = 'field') {
  if (plain === null || plain === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', subkey(purpose), iv);
  cipher.setAAD(Buffer.from(String(aad)));
  const data = Buffer.concat([cipher.update(Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain), 'utf8')), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

export function decryptBuffer(token, aad = '', purpose = 'field') {
  if (!token) return null;
  const [v, iv, tag, data] = String(token).split('.');
  if (v !== 'v1') throw new Error('Unsupported ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', subkey(purpose), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(String(aad)));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
}

export function decrypt(token, aad = '', purpose = 'field') {
  const buf = decryptBuffer(token, aad, purpose);
  return buf === null ? null : buf.toString('utf8');
}

export const encryptJson = (obj, aad, purpose) => encrypt(JSON.stringify(obj ?? {}), aad, purpose);
export const decryptJson = (tok, aad, purpose) => (tok ? JSON.parse(decrypt(tok, aad, purpose)) : {});

// Binary objects (data room files) are encrypted whole with a random per-file key wrapped by the master-derived key.
export function encryptObject(buffer, aad) {
  const fileKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const wrapped = encrypt(fileKey, aad, 'object-key');
  return { body: Buffer.concat([iv, cipher.getAuthTag(), body]), wrappedKey: wrapped };
}

export function decryptObject(stored, wrappedKey, aad) {
  const fileKey = decryptBuffer(wrappedKey, aad, 'object-key');
  const iv = stored.subarray(0, 12);
  const tag = stored.subarray(12, 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
export const hmac = (v, purpose = 'lookup') => crypto.createHmac('sha256', subkey(purpose)).update(String(v)).digest('hex');
export const newId = () => crypto.randomUUID();

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
