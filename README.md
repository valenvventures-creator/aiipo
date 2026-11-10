# Thought Authorities A.I. IPO

A guided workspace for preparing, executing and maintaining a Canadian and/or US IPO. It is a functional
pilot built from the *Canadian and US IPO SaaS Master Prompt*. Data is persistent, calculations are real
and the controls are enforced, but the regulatory content is still a **research draft pending licensed
legal and accounting review**.

> Preparation and coordination software. Not legal, tax, audit or investment advice. Not a dealer,
> exchange or regulator. The A.I. guide is an artificial-intelligence system.

## Quick start

Requires Node.js 22.13 or newer. The app has no runtime dependencies apart from the optional Anthropic SDK.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. In development:

- Verification, reset and invitation emails appear at http://localhost:3000/dev/outbox (loopback only).
- A local encryption key is generated at `data/.dev-master.key`.
- If you use a plain-HTTP host other than `localhost`, set `COOKIE_SECURE=false`.

Run the tests (23 unit tests and 14 end-to-end HTTP tests):

```bash
npm test
```

### Static edition (index.html, e.g. for Netlify)

`index.html` at the repository root is a single self-contained file: the full marketing site, the
login, sign-up and reset pages, and an interactive in-browser demo (dashboard, roadmap and SOPs, route
assessment, calculators, communications check, advisors, learning centre). It runs the same domain
engines as the server, on fictional data only. Nothing is saved or sent.

**It has no accounts and stores no client data.** A static file cannot securely verify passwords or
protect sensitive information, so its login and sign-up forms explain that accounts require the server
edition below.

- Netlify: connect the repository. `netlify.toml` publishes only `index.html` (never the source code)
  with a strict hash-based Content Security Policy.
- After changing the source, regenerate it:
  ```bash
  npm run build:static
  ```

### Deploying the full app (server edition)

Accounts, login, MFA, projects and every workspace feature need the Node server running on a host with
a persistent disk. Static hosts (Netlify alone, GitHub Pages) cannot run it.

**1. Run the server on Render** (blueprint included):
1. In Render, choose **New → Blueprint** and select this repository.
2. Approve the **Starter** plan; the persistent disk that keeps accounts and data needs a paid instance.
3. Leave the optional values blank for now and deploy. Render generates `TA_MASTER_KEY` automatically;
   copy it from the Environment tab and store it safely.
4. Open the `onrender.com` address: sign-up, login and the demo all work there.

**2. Optional: keep using your Netlify address.** In Netlify, go to **Site configuration → Environment
variables**, add `BACKEND_URL` = your `https://…onrender.com` address, and redeploy. Netlify then forwards
every request to the server. In Render, set both `BASE_URL` and `ALLOWED_ORIGINS` to your Netlify address
(for example `https://your-site.netlify.app`) and save.

**Email.** Without `MAIL_WEBHOOK_URL`, sign-up activates accounts immediately without email
verification, password-reset emails are disabled, and invitations show the admin a private link to share.
To turn email on, set `MAIL_WEBHOOK_URL=https://api.resend.com/emails`, set `MAIL_WEBHOOK_TOKEN` to a Resend
API key, and set `MAIL_FROM` to an address on your verified domain. Verification then switches on
automatically (`EMAIL_VERIFICATION=auto`; set it to `required` or `off` to override).

Any other Node or Docker host with a persistent volume also works (Railway, Fly.io, a VPS) using the
`Dockerfile` and the variables in `.env.example`.

### Production

1. Generate a master key, then store it in your secret manager (losing it makes encrypted data unrecoverable):
   ```bash
   npm run keygen
   ```
2. Set the variables in `.env.example`: `NODE_ENV=production`, `TA_MASTER_KEY`, `BASE_URL` (https),
   `MAIL_WEBHOOK_URL` and its token, and `TRUST_PROXY=true` behind a TLS-terminating proxy.
3. Run with the `Dockerfile` or `npm start`. Serve over HTTPS only.
4. Back up the database regularly with the command below. Also back up `UPLOAD_DIR` (encrypted objects), and keep the key separate.
   ```bash
   npm run backup
   ```
5. Optional: set `ANTHROPIC_API_KEY` to enable the Claude-powered guide (model `claude-opus-5-5`, with
   server-side refusal fallbacks enabled). Without it, the guide runs in a deterministic rule-based mode.

## Brand and design

- The crest and wordmark are your supplied artwork, extracted with clean transparency (`public/brand/`).
  They are unchanged in design.
- The site uses its own visual system: ivory, ink and crest gold, Cormorant Garamond with Manrope, a split
  hero with a "route ledger", a stage rail and a bento workspace grid. Layouts, copy and components are
  original and not copied from thoughtauthorities.com.
- The login process mirrors the reference site:
  - Separate **Log in** page: Email, Password, *Keep me signed in*, *Forgot password?*, a demo block and *Create an account*.
  - Separate **Create account** page: first and last name, work email, password ("At least 10 characters,
    including a letter and a number"), confirm password, and Terms and Privacy checkboxes.
  - **Forgot password** page with a 30-minute reset link.
  - **Live demo** entry at `/login?demo=1`.

  It adds email verification, optional authenticator MFA, lockout and rate limits (see `SECURITY.md`).

## Feature status inventory (honest scope)

| Area | Status |
| --- | --- |
| Auth: signup, verification, login, remember-me, reset, TOTP MFA with recovery codes, invitations, 12 roles | **Working** |
| Onboarding (6 sections, save and resume, unknowns allowed, restricted ownership section) | **Working** |
| Jurisdiction routing and classification (FPI, EGC, SRC, filer, Section 16, venture, MJDS screen) with versioned rules | **Working, provisional.** Thresholds are marked *unverified* until counsel review |
| Stage library 0-10: a populated SOP per stage, 34 task templates, an acyclic dependency graph, gates, reviewer-only approval | **Working** |
| 12 structured forms with validation, immutable versions and approvals, reopen-on-change, held communications | **Working** |
| Deterministic finance: proceeds and over-allotment, ownership and voting, NTBV dilution, runway scenarios, CSV export | **Working** |
| Data room: encrypted versions, classifications, legal hold, access log, content screening | **Working.** A full antivirus engine is not included |
| Advisor directory, CSA 13-jurisdiction map, resource centre, curriculum (10 units), case library (9), glossary | **Working.** Seed content is from the spec's source register |
| A.I. guide (structured answers, permission-scoped context, source allow-list, interaction log) | **Working** (rule-based without an API key) |
| Public company operations: obligations activated on close and cannot be erased | **Working.** Due dates stay provisional |
| Demo workspaces (5 fictional companies, auto-purged after 2 hours) | **Working** |
| Valuation workspace (comps, DCF), banker proposal comparison, KPI dictionary, controls matrix UI | **Planned (phase two)** |
| Document generation (DOCX/PDF templates, closing binder), e-signature, EDGAR/SEDAR+ integrations | **Planned.** Filings are manual or professional-handled; no integration is claimed |
| French localization, SSO/SCIM, data-room watermarking | **Planned** |

## Acceptance tests covered (spec Section 26)

These are automated in `test/`: 1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14 and 16. Tests 15 (advisor labels)
and 18 (no referral sent without authorization) are enforced by design: there is no send path, and every
advisor carries only the "Official source" label. Tests 4, 11, 17, 19 and 20 need the phase-two financial
statement age service, external status records and restore drills.

## Before any production launch

- Licensed securities, accounting and tax review of every rule, threshold, SOP and template.
- Independent penetration test, accessibility audit (WCAG 2.2 AA target) and a privacy impact assessment
  (Canadian and US, including data residency and cross-border processing).
- Final Terms and Privacy Policy from counsel (the current pages are drafts).
- An antivirus engine for uploads, a shared rate-limit store if you run multiple instances, a tested
  restore runbook, and a named owner for content updates.

## Project layout

```
src/server.js          HTTP server, headers, CSRF and origin checks, errors
src/security/          crypto (scrypt, AES-256-GCM), TOTP, sessions/auth, RBAC, audit chain
src/domain/            decimal, finance, routing, rules, stages/SOPs, forms, content, onboarding
src/services.js        tenant-scoped projects, tasks, records, data room, plan
src/routes/            auth and workspace routes
src/views/             server-rendered, auto-escaped HTML
public/                CSS, JS, brand assets
test/                  unit and end-to-end tests
```
