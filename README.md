# Thought Authorities A.I. IPO

A guided workspace for preparing, executing and maintaining a Canadian and/or US IPO. It is a functional
pilot built from the *Canadian and US IPO SaaS Master Prompt*. Data is persistent, calculations are real
and the controls are enforced, but the regulatory content is still a **research draft pending licensed
legal and accounting review**.

> Preparation and coordination software. Not legal, tax, audit or investment advice. Not a dealer,
> exchange or regulator. The A.I. guide is an artificial-intelligence system.

## Quick start

Requires Node.js 22.13 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. In development:

- Data is stored in an embedded Postgres database (PGlite) in `data/pglite`; no database server is needed.
- Verification, reset and invitation emails appear at http://localhost:3000/dev/outbox (loopback only).
- A local encryption key is generated at `data/.dev-master.key`.

Run the tests (unit, end-to-end over HTTP, and the no-email configuration):

```bash
npm test
```

## Hosting on Netlify

The app is hosted the same way as the other Thought Authorities sites, entirely on Netlify:

| Piece | Netlify service |
| --- | --- |
| The app (pages, login, every workspace feature) | Netlify Functions (`netlify/functions/app.mjs`) |
| Accounts, projects, records, audit trail | Netlify Database (Postgres; Netlify provides `NETLIFY_DB_URL`) |
| Data-room documents (encrypted) | Netlify Blobs |
| CSS, scripts, logo images | Netlify CDN (`public/`) |
| Email (optional) | Resend, using `RESEND_API_KEY` and `EMAIL_FROM` |

**Set-up**
1. Connect this repository to a Netlify site (or keep your existing site linked to it). `netlify.toml`
   configures everything; leave the build command and publish directory in the Netlify UI empty.
2. Turn on **Netlify Database** for the site, as on your other sites. Netlify then provides
   `NETLIFY_DB_URL` automatically. The tables are created on first use.
3. Deploy. Every build runs the full test suite first, and a failing test stops the deploy.

Sign-up, login, MFA, the demo and every workspace feature then work on the site's own address.

**Optional environment variables** (Netlify → Site configuration → Environment variables):

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY`, `EMAIL_FROM` | Turns on verification, password-reset and invitation emails (same names as the other sites). `EMAIL_FROM` must use a domain verified in Resend. |
| `ANTHROPIC_API_KEY` | Turns on the Claude-powered A.I. guide (otherwise it runs in rule-based mode). |
| `TA_MASTER_KEY` | Your own 256-bit encryption key (`npm run keygen`). If unset, one is generated once and kept in a private Netlify Blobs store, separate from the database. **Never change it once data exists**, or encrypted data becomes unreadable. |

**Email.** Without Resend, sign-up activates accounts immediately without email verification, password-reset
emails are disabled, and invitations show the admin a private link to share. Adding `RESEND_API_KEY` and
`EMAIL_FROM` switches verification on automatically (`EMAIL_VERIFICATION=auto`; set it to `required` or
`off` to override).

**Limits.** Netlify Functions accept requests of up to 6 MB, so data-room uploads are limited to 4 MB per file.

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
| Hosting: Netlify Functions + Netlify Database + Netlify Blobs | **Working** (tested locally against PostgreSQL 16 through the bundled function) |
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
- An antivirus engine for uploads, a tested database restore runbook (Netlify Database backups), and a
  named owner for content updates.

## Project layout

```
netlify/functions/     Netlify Function that runs the app
netlify.toml           Netlify build, functions and headers
src/server.js          request handling, headers, CSRF and origin checks, errors
src/db.js              Postgres (Netlify Database in production, embedded PGlite locally)
src/objects.js         encrypted document storage (Netlify Blobs / local folder)
src/security/          crypto (scrypt, AES-256-GCM), TOTP, sessions/auth, RBAC, audit chain
src/domain/            decimal, finance, routing, rules, stages/SOPs, forms, content, onboarding
src/services.js        tenant-scoped projects, tasks, records, data room, plan
src/routes/            auth and workspace routes
src/views/             server-rendered, auto-escaped HTML
public/                CSS, JS, brand assets (served by Netlify's CDN)
test/                  unit and end-to-end tests
```
