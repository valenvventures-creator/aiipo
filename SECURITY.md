# Security design

This document describes the controls implemented in the code. It is not a certification. SOC 2, ISO 27001
or similar claims need separate audits.

## Protecting sensitive client information

| Threat | Control | Where |
| --- | --- | --- |
| Database or backup theft | Field-level AES-256-GCM on names, emails, company profiles, records, notes, file names and MFA secrets. Keys are HKDF-derived from `TA_MASTER_KEY`, which is held outside the database. Ciphertext is bound to its tenant and record (AAD), so copied rows fail to decrypt. | `src/security/crypto.js` |
| Storage theft of documents | Each file version has its own random data key, wrapped by the master-derived key. A SHA-256 integrity check runs on download. | `services.js uploadDocument` |
| Credential stuffing and brute force | scrypt (N=2^15, r=8). Per-IP and per-account rate limits. Account lockout after 8 failures. Dummy hashing for unknown emails. | `security/auth.js`, `routes/auth.js` |
| Account enumeration | Generic login errors. Signup, reset and verification never reveal whether an email exists. | `routes/auth.js` |
| Stolen password | Optional TOTP MFA (RFC 6238) with replay protection and single-use hashed recovery codes. MFA is required to view restricted PII, MNPI or privileged material. An org-wide "require MFA" flag is supported. | `security/totp.js`, `permissions.js` |
| Session hijacking | 256-bit random tokens, stored only as SHA-256 hashes. `__Host-` cookie with HttpOnly, Secure and SameSite=Lax. 30-minute idle and 12-hour absolute timeouts (14 days with "keep me signed in"). Sessions are bound to the browser user agent and rotated at login and MFA. Other sessions are revoked when the password changes or is reset. | `security/auth.js` |
| CSRF | A per-session synchronizer token (double-submit cookie for anonymous forms) plus Origin and Referer checks. | `server.js` |
| XSS and clickjacking | Auto-escaping templates. Strict CSP with no inline script, `frame-ancestors 'none'` and `object-src 'none'`. Model output is inserted with `textContent` only. | `http.js`, `public/js/app.js` |
| Cross-tenant access | Every query is scoped by the session's `org_id`. Records above a user's clearance return 404 (no existence oracle). | `services.js` |
| Over-broad internal access | 12 roles × 7 classifications, enforced identically in pages, exports, registers and A.I. retrieval. | `permissions.js`, `ai.js` |
| Tampering and repudiation | Hash-chained audit log. Database triggers make approvals, versions, task history, document versions and access logs append-only. Legal holds block deletion. | `db.js`, `security/audit.js` |
| Malicious uploads | Extension allow-list plus magic-byte verification. 15 MB limit. Blocks executables, the EICAR test signature, and flags active PDF content. Downloads are served as attachments with a sandbox CSP. | `services.js` |
| Spreadsheet formula injection | Cells beginning with `= + - @` (non-numeric) are prefixed on export. | `finance.js toCsv` |
| Prompt injection and data leakage via A.I. | Workspace data is wrapped as untrusted data. Only records the user can read are included. Citations are filtered to the registered source list. Interactions are logged encrypted. | `ai.js` |
| Secret leakage | No secrets in code. Production refuses to start without `TA_MASTER_KEY`. Audit details scrub keys named like secrets. Raw IPs are never stored (HMAC-pseudonymised). | `config.js`, `audit.js` |

## Operational requirements

- Terminate TLS in front of the app and set `TRUST_PROXY=true` and an `https://` `BASE_URL`.
- Store `TA_MASTER_KEY` in a KMS or secret manager. Rotate it by re-encrypting with a new key version (the `v1.` prefix supports versioning).
- Back up the database (`npm run backup`) and `UPLOAD_DIR` to separate, access-controlled storage, and test restores.
- Add an AV engine (for example ClamAV) behind `scan()` in `services.js`.
- Use a shared store (for example Redis) for rate limits when running more than one instance.
- Monitor `auth.lockout`, `auth.mfa.failed` and `document.blocked` audit events.

## Reporting a vulnerability

Email the security contact you designate before launch. Do not open public issues for vulnerabilities.
