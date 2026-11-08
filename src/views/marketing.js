import { html } from '../http.js';
import { marketingShell } from './layout.js';
import { STAGES } from '../domain/stages.js';

const FAQ = [
  ['Does the software decide whether we can go public?', 'No. It organizes facts, evidence and tasks, and gives provisional route comparisons. Securities counsel, auditors, underwriters, regulators and exchanges make their own determinations. A software match means "potential fit pending professional assessment".'],
  ['Which routes are supported?', 'The pilot covers a Canadian conventional IPO, a US domestic IPO, a foreign private issuer assessment for US routes, MJDS eligibility screening and concurrent Canada-US coordination. Specialist sectors enter a specialist assessment with named missing requirements.'],
  ['How is our data protected?', 'Sensitive fields and every uploaded file are encrypted with AES-256-GCM using per-tenant bound keys, sessions are short-lived and bound to the browser, MFA is available to every user and required for restricted, MNPI and privileged material, and every consequential action is written to a tamper-evident audit trail.'],
  ['What does the A.I. guide do?', 'It explains concepts, finds your next unblocked task, assembles questions for your advisors and drafts for review. It only sees what you are cleared to see, cites only registered sources and never issues legal, tax or audit conclusions.'],
  ['Is the financial math done by the A.I.?', 'No. Proceeds, dilution, ownership and runway are calculated by deterministic decimal engines with stated formulas and exportable assumptions. The A.I. can explain results; it never computes authoritative figures.'],
  ['Can we just look around first?', 'Yes. The live demo creates an isolated workspace for a clearly fictional company with seeded, labelled data. It is deleted automatically.'],
];

export function landing({ nonce, session }) {
  return marketingShell({
    nonce, session, title: 'Your IPO, organized',
    body: html`
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">Thought Authorities · A.I. IPO</p>
      <h1>Go public with a plan you can <em>defend</em>.</h1>
      <p class="lede">One workspace for Canadian and US IPOs. Map your route, see the next required action, assemble the evidence, and move it through the right professional review - from first board discussion to your first year as a public company.</p>
      <div class="hero-actions">
        <a class="btn btn-gold btn-lg" href="/signup">Start your IPO plan</a>
        <a class="btn btn-outline btn-lg" href="/login?demo=1">Explore the live demo</a>
      </div>
      <p class="fine">Preparation software, not legal or investment advice. Every conclusion is routed to a qualified professional.</p>
    </div>
    <div class="hero-card" aria-label="Example route ledger (illustrative)">
      <div class="ledger-head"><span>Route ledger</span><span class="tag-illus">Illustrative example</span></div>
      <ol class="ledger">
        <li class="done"><span class="l-n">0</span><span>Strategic fit</span><span class="l-s">Board approved</span></li>
        <li class="done"><span class="l-n">1</span><span>Route &amp; team</span><span class="l-s">Counsel reviewed</span></li>
        <li class="now"><span class="l-n">2</span><span>Finance &amp; audit</span><span class="l-s">3 of 4 complete</span></li>
        <li class="block"><span class="l-n">3</span><span>Legal &amp; governance</span><span class="l-s">1 critical blocker</span></li>
        <li><span class="l-n">4</span><span>Disclosure</span><span class="l-s">Not started</span></li>
      </ol>
      <div class="ledger-foot"><strong>Next:</strong> Reconcile 2021 option grants to board approvals → <em>Counsel review</em></div>
    </div>
  </div>
</section>

<section class="strip" aria-label="Coverage">
  <div class="wrap strip-in">
    <span>TSX</span><span>TSX Venture</span><span>CSE</span><span>Cboe Canada</span><span>Nasdaq</span><span>NYSE</span><span>NYSE American</span>
  </div>
  <p class="wrap strip-note">Venue names are listed for comparison only. No affiliation, endorsement or approval is implied.</p>
</section>

<section class="section" id="route">
  <div class="wrap">
    <p class="eyebrow">The route</p>
    <h2>Eleven stages. Every gate explained.</h2>
    <p class="section-lede">Each stage has a populated procedure - owner, inputs, steps, evidence, reviewer and exit criteria. Gates stay closed until the evidence is there, and a material change reopens what it affects.</p>
    <ol class="stage-rail">
      ${STAGES.map((s) => html`<li><span class="rail-n">${s.n}</span><span class="rail-name">${s.name}</span><span class="rail-owner">${s.owner}</span></li>`)}
    </ol>
  </div>
</section>

<section class="section section-ink" id="routes">
  <div class="wrap">
    <p class="eyebrow eyebrow-gold">Jurisdiction routing</p>
    <h2>Incorporation is not destiny.</h2>
    <p class="section-lede">Where you are incorporated, where you are run from, where you offer and where you list are separate facts. The routing engine keeps them separate - and shows what it does not yet know.</p>
    <div class="route-cards">
      <article><h3>Canadian conventional IPO</h3><p>Provincial and territorial prospectus, exchange application, underwriting and continuous disclosure. Principal regulator confirmed with counsel.</p></article>
      <article><h3>US domestic IPO</h3><p>Registration statement, SEC review, FINRA where applicable, exchange listing and Exchange Act reporting - with EGC, SRC and filer status assessed separately.</p></article>
      <article><h3>Canadian company in the US</h3><p>A real foreign private issuer test, not an assumption. MJDS screened on its own conditions - a newly public company is not automatically eligible.</p></article>
      <article><h3>Concurrent Canada &amp; US</h3><p>Both sets of obligations, currencies, selling restrictions and settlement in one coordinated plan with a conflict log.</p></article>
    </div>
  </div>
</section>

<section class="section" id="workspace">
  <div class="wrap">
    <p class="eyebrow">The workspace</p>
    <h2>Real records, not a reading list.</h2>
    <div class="bento">
      <article class="b-wide"><h3>Your next three actions</h3><p>The dashboard shows the active stage, unblocked work, critical blockers, waiting reviews and what changed - without a misleading single readiness percentage.</p></article>
      <article><h3>Claims ledger</h3><p>Every material number in your disclosure is linked to its source. Change it, and every dependent approval reopens.</p></article>
      <article><h3>Communications clearance</h3><p>Retail promotion before filing is held for counsel automatically. Institutional testing-the-waters stays available where permitted.</p></article>
      <article><h3>Secure data room</h3><p>Folder classifications, encrypted versions, legal holds, access logs and content screening.</p></article>
      <article><h3>Advisor directory</h3><p>Verification routes to official registries. "Official source" is never confused with "credentials checked".</p></article>
      <article class="b-wide"><h3>Public company operations</h3><p>Closing the IPO project activates recurring obligations. They cannot be erased by marking a project complete.</p></article>
    </div>
  </div>
</section>

<section class="section section-parch" id="numbers">
  <div class="wrap numbers-grid">
    <div>
      <p class="eyebrow">Numbers you can defend</p>
      <h2>Company cash is not deal size.</h2>
      <p class="section-lede">Deterministic decimal engines separate primary and secondary shares, the over-allotment option and who bears which costs - with formulas and assumptions exported alongside every result.</p>
      <a class="btn btn-outline" href="/login?demo=1">Try the calculator in the demo</a>
    </div>
    <table class="calc-sample">
      <caption>Worked example (illustrative assumptions)</caption>
      <tbody>
        <tr><th scope="row">Pre-offering shares</th><td>10,000,000</td></tr>
        <tr><th scope="row">New company shares / selling-holder shares</th><td>2,000,000 / 1,000,000</td></tr>
        <tr><th scope="row">Price</th><td>$10.00</td></tr>
        <tr><th scope="row">Company gross proceeds</th><td>$20,000,000</td></tr>
        <tr><th scope="row">Selling-holder gross proceeds</th><td>$10,000,000 <span class="muted">(not company cash)</span></td></tr>
        <tr class="em"><th scope="row">Company net (6% discount, $1M expenses)</th><td>$17,800,000</td></tr>
        <tr><th scope="row">Post-offering shares</th><td>12,000,000</td></tr>
      </tbody>
    </table>
  </div>
</section>

<section class="section" id="security">
  <div class="wrap">
    <p class="eyebrow">Security</p>
    <h2>Built for material non-public information.</h2>
    <div class="sec-grid">
      <article><h3>Encrypted twice over</h3><p>TLS in transit. Sensitive fields and every file encrypted at rest with AES-256-GCM, bound to your organization.</p></article>
      <article><h3>Least privilege</h3><p>Twelve roles and seven information classifications. A PR guest cannot reach privileged material through pages, search, exports or the A.I. guide.</p></article>
      <article><h3>Strong sign-in</h3><p>scrypt password hashing, authenticator-app MFA, lockout after repeated failures, short browser-bound sessions.</p></article>
      <article><h3>Tamper-evident trail</h3><p>Hash-chained audit events and append-only approvals and versions. Approved history is never overwritten.</p></article>
    </div>
    <p><a class="link-arrow" href="/security">Read the security overview</a></p>
  </div>
</section>

<section class="section section-parch" id="faq">
  <div class="wrap narrow">
    <p class="eyebrow">Questions, answered</p>
    <h2>Before you begin</h2>
    ${FAQ.map(([q, a]) => html`<details class="faq"><summary>${q}</summary><p>${a}</p></details>`)}
  </div>
</section>

<section class="closing">
  <div class="wrap closing-in">
    <img src="/brand/crest-256.png" alt="" width="128" height="78">
    <h2>Your route to market starts with one honest plan.</h2>
    <a class="btn btn-gold btn-lg" href="/signup">Start your IPO plan</a>
  </div>
</section>`,
  });
}

export function securityPage({ nonce, session }) {
  const items = [
    ['Transport', 'HTTPS only in production with HSTS; strict Content Security Policy with no inline script; framing blocked; no referrer leakage.'],
    ['Authentication', 'Passwords hashed with scrypt (N=2^15). Generic sign-in errors, constant-time comparison and dummy hashing prevent account discovery. Accounts lock temporarily after repeated failures. Rate limits on sign-in, sign-up, reset and demo creation.'],
    ['Multi-factor authentication', 'RFC 6238 authenticator codes with replay protection and single-use recovery codes. Required before any restricted personal information, MNPI or privileged material is shown.'],
    ['Sessions', 'Random 256-bit tokens stored only as hashes, HttpOnly + Secure + SameSite cookies with the __Host- prefix, idle and absolute timeouts, browser binding, rotation at sign-in and revocation of other sessions after a password change.'],
    ['Encryption at rest', 'Names, emails, company profiles, records, notes and file names are encrypted field-by-field with AES-256-GCM using keys derived from a master key held outside the database. Every file has its own data key. Ciphertexts are bound to their tenant and record, so copied data fails to decrypt.'],
    ['Tenant isolation and least privilege', 'Every query is scoped to the signed-in organization. Twelve roles and seven classifications control pages, downloads, exports, notifications and A.I. retrieval alike. Records you cannot read return "not found".'],
    ['Integrity and audit', 'Hash-chained audit log; database triggers make approvals, versions, task history and access logs append-only. Legal holds block deletion.'],
    ['Uploads', 'Allow-listed types verified by content signature, size limits, executable and test-signature screening, SHA-256 integrity check on every download. Production deployments should add a full antivirus engine.'],
    ['Forms and requests', 'Per-session CSRF tokens plus origin checks, request size limits, strict input validation, output encoding by default and spreadsheet-formula injection guards on exports.'],
    ['A.I. safety', 'Workspace content is treated as untrusted data; the guide cannot follow instructions inside documents, cites only registered sources and never sees material above your clearance. Customer deal data is not used for training by this application.'],
  ];
  return marketingShell({
    nonce, session, title: 'Security',
    body: html`<section class="section"><div class="wrap narrow">
      <p class="eyebrow">Security overview</p><h1>How we protect sensitive client information</h1>
      <p class="section-lede">These controls are implemented in this software. Certifications (such as SOC 2) and formal penetration testing are separate work that must be completed before any compliance claim is made.</p>
      <dl class="sec-list">${items.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
    </div></section>`,
  });
}

export function legalPage({ nonce, session, kind }) {
  const terms = kind === 'terms';
  return marketingShell({
    nonce, session, title: terms ? 'Terms of Service' : 'Privacy Policy',
    body: html`<section class="section"><div class="wrap narrow prose">
      <p class="eyebrow">Draft - requires review by counsel before launch</p>
      <h1>${terms ? 'Terms of Service' : 'Privacy Policy'}</h1>
      ${terms ? html`
        <p>Thought Authorities A.I. IPO ("the Service") is preparation and coordination software. It does not provide legal, tax, accounting, audit or investment advice; does not act as a dealer, underwriter, exchange or regulator; and does not sell securities, hold investor funds or make allocation decisions.</p>
        <p>Management owns its representations. Licensed professionals own their professional work. Completing tasks in the Service does not make an offering lawful, and no regulator or exchange endorses any issuer through it.</p>
        <p>You are responsible for the accuracy of information you enter, for the access you grant to others, and for keeping your credentials and authenticator device secure.</p>
        <p>The A.I. guide is an artificial-intelligence system. Its output is a draft for professional review.</p>` : html`
        <p>We collect account details (name, work email), the company and project information you enter, uploaded documents and security logs. We use them to provide the Service, secure accounts and meet legal obligations.</p>
        <p>Sensitive fields and files are encrypted at rest. Access is limited by role and classification. IP addresses in the audit log are pseudonymised.</p>
        <p>If the A.I. provider is enabled, the minimum workspace context needed to answer a question is sent to that provider for processing. Customer deal data is not used to train models by this application. Cross-border processing, data residency options and provincial and state privacy requirements must be assessed before launch.</p>
        <p>You may request access, correction or deletion subject to legal holds and retention obligations.</p>`}
    </div></section>`,
  });
}
