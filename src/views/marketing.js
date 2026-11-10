import { html, raw } from '../http.js';
import { marketingShell, ARROW } from './layout.js';
import { STAGES } from '../domain/stages.js';

const FAQ = [
  ['Does the software decide whether we can go public?', 'No. It organizes facts, evidence and tasks, and gives provisional route comparisons. Securities counsel, auditors, underwriters, regulators and exchanges make their own determinations. A software match means "potential fit pending professional assessment".'],
  ['Which routes are supported?', 'The pilot covers a Canadian conventional IPO, a US domestic IPO, a foreign private issuer assessment for US routes, MJDS eligibility screening and concurrent Canada-US coordination. Specialist sectors enter a specialist assessment with named missing requirements.'],
  ['How is our data protected?', 'Sensitive fields and every uploaded file are encrypted with AES-256-GCM using per-tenant bound keys, sessions are short-lived and bound to the browser, MFA is available to every user and required for restricted, MNPI and privileged material, and every consequential action is written to a tamper-evident audit trail.'],
  ['What does the A.I. guide do?', 'It explains concepts, finds your next unblocked task, assembles questions for your advisors and drafts for review. It only sees what you are cleared to see, cites only registered sources and never issues legal, tax or audit conclusions.'],
  ['Is the financial math done by the A.I.?', 'No. Proceeds, dilution, ownership and runway are calculated by deterministic decimal engines with stated formulas and exportable assumptions. The A.I. can explain results; it never computes authoritative figures.'],
  ['Can we just look around first?', 'Yes. The live demo creates an isolated workspace for a clearly fictional company with seeded, labelled data. It is deleted automatically.'],
];

// ---------- Hero route chart (server-rendered SVG; animated with CSS and SMIL, no inline styles) ----------
const SHORT = ['Strategy', 'Team', 'Finance', 'Legal', 'Disclosure', 'Review', 'Marketing', 'Pricing', 'Closing', 'First 90 days', 'Public company'];
function routeChart() {
  const pts = SHORT.map((_, i) => {
    const t = i / (SHORT.length - 1);
    return [Math.round(70 + t * 470), Math.round(520 - (t ** 1.35) * 410 - Math.sin(t * Math.PI * 3) * 18)];
  });
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  const grid = [];
  for (let x = 40; x <= 600; x += 40) grid.push(html`<line x1="${x}" y1="40" x2="${x}" y2="560" />`);
  for (let y = 40; y <= 560; y += 40) grid.push(html`<line x1="40" y1="${y}" x2="600" y2="${y}" />`);
  return html`<svg class="rc" viewBox="0 0 640 600" role="img" aria-labelledby="rc-t">
  <title id="rc-t">Illustration: the eleven stages of an IPO route, from strategic fit to operating as a public company</title>
  <defs>
    <linearGradient id="rc-gold" x1="0" x2="1" y1="1" y2="0"><stop offset="0" stop-color="#a77d0a"/><stop offset=".55" stop-color="#e9b51f"/><stop offset="1" stop-color="#f6d77a"/></linearGradient>
    <radialGradient id="rc-glow"><stop offset="0" stop-color="#f2cf68" stop-opacity=".55"/><stop offset="1" stop-color="#f2cf68" stop-opacity="0"/></radialGradient>
  </defs>
  <g class="rc-grid">${grid}</g>
  <path class="rc-shadow" d="${d}" />
  <path id="rc-path" class="rc-path" d="${d}" pathLength="1000" />
  ${pts.map(([x, y], i) => html`<g class="rc-node n${i} ${i === 10 ? 'rc-end' : ''}" tabindex="0" aria-label="Stage ${i}: ${SHORT[i]}">
    ${i === 10 ? html`<circle class="rc-halo" cx="${x}" cy="${y}" r="46" fill="url(#rc-glow)" />` : ''}
    <circle class="rc-hit" cx="${x}" cy="${y}" r="18" />
    <circle class="rc-dot" cx="${x}" cy="${y}" r="${i === 10 ? 9 : 6}" />
    <text class="rc-num" x="${x}" y="${y - 16}" text-anchor="middle">${String(i).padStart(2, '0')}</text>
    <text class="rc-name" x="${i === 10 ? x + 10 : i > 6 ? x - 16 : x + 16}" y="${i === 10 ? y - 34 : y + 24}" text-anchor="${i > 6 ? 'end' : 'start'}">${SHORT[i].toUpperCase()}</text>
  </g>`)}
  <circle class="rc-pulse" r="5"><animateMotion dur="7s" repeatCount="indefinite" rotate="auto"><mpath href="#rc-path"/></animateMotion></circle>
  <g class="rc-badge"><rect x="430" y="548" width="170" height="30" rx="15"/><text x="515" y="568" text-anchor="middle">ILLUSTRATIVE ROUTE</text></g>
</svg>`;
}

const MARQUEE = ['Route assessment', 'FPI test', 'EGC · SRC · filer status', 'Claims ledger', 'Proceeds calculator', 'Dilution & ownership', 'Cash runway', 'Comms clearance', 'Encrypted data room', 'Comment response matrix', 'Closing checklist', 'Recurring obligations', 'MFA', 'Tamper-evident audit'];

const BEFORE_AFTER = [
  ['The spreadsheet', 'Four hundred rows across inboxes. Nobody is sure what is actually done.', 'Every task has an owner, a reviewer and the evidence that closes it.'],
  ['The moving number', 'Revenue changes in the deck, and three other documents quietly disagree.', 'The claims ledger reopens every approval that relied on that number.'],
  ['The eager post', 'Someone promotes the raise on social media before anything is filed.', 'Retail-directed promotion is held for counsel review automatically.'],
  ['The day after', 'The deal closes and the reporting calendar arrives as a surprise.', 'Recurring obligations switch on the moment the IPO project closes.'],
];

function money(n) { return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

export function landing({ nonce, session }) {
  return marketingShell({
    nonce, session, title: 'Your IPO, organized',
    body: html`
<section class="lp-hero">
  <div class="lp-hero-glow" aria-hidden="true"></div>
  <div class="lp-wrap lp-hero-grid">
    <div class="lp-hero-copy">
      <p class="lp-eyebrow lp-in d0">Thought Authorities · A.I. IPO</p>
      <h1 class="lp-h1 lp-in d1">Go public<br>with a plan<br><span class="lp-accent">you can <span class="lp-underline">defend.</span></span></h1>
      <p class="lp-lede lp-in d2">One workspace for Canadian and US IPOs. Map your route, see the next required action, assemble the evidence and move it through the right professional review - from the first board discussion to your first year as a public company.</p>
      <div class="lp-actions lp-in d3">
        <a class="lp-btn lp-btn-ink lp-btn-lg" href="/signup">Start your IPO plan ${ARROW}</a>
        <a class="lp-btn lp-btn-ghost lp-btn-lg" href="/login?demo=1">Explore the live demo</a>
      </div>
      <p class="lp-meta lp-in d4"><span class="lp-dot"></span>Eleven stages · Two markets · Verified evidence</p>
    </div>
    <div class="lp-hero-art lp-in d2" data-parallax>${routeChart()}</div>
  </div>
  <a class="lp-scroll" href="#marquee" aria-label="Scroll to content"><span>Scroll</span><i></i></a>
</section>

<section class="lp-marquee" id="marquee" aria-label="Capabilities">
  <div class="lp-marquee-track">
    ${[0, 1].map((k) => html`<div class="lp-marquee-row" ${k ? raw('aria-hidden="true"') : ''}>${MARQUEE.map((m) => html`<span>${m}<i></i></span>`)}</div>`)}
  </div>
</section>

<section class="lp-section" id="problems">
  <div class="lp-wrap">
    <div data-reveal>
      <p class="lp-eyebrow">Where IPO preparation breaks</p>
      <h2 class="lp-h2">Things every founder <span class="lp-accent">learns the hard way</span></h2>
      <p class="lp-sub">And how A.I. IPO changes each one. Flip the switch.</p>
    </div>
    <div class="lp-toggle" data-reveal data-delay="100">
      <span class="lp-toggle-label" data-label-before>Without A.I. IPO</span>
      <button class="lp-switch" type="button" role="switch" aria-checked="true" aria-label="Show with A.I. IPO" data-ba-switch><span></span></button>
      <span class="lp-toggle-label is-on" data-label-after>With A.I. IPO</span>
    </div>
    <div class="lp-ba-grid is-after" data-ba-grid>
      ${BEFORE_AFTER.map(([t, before, after], i) => html`<article class="lp-ba" data-reveal data-delay="${i * 80}">
        <p class="lp-mono">0${i + 1} · ${t}</p>
        <p class="lp-ba-before">${before}</p>
        <p class="lp-ba-after">${after}</p>
      </article>`)}
    </div>
  </div>
</section>

<section class="lp-section lp-section-tint" id="route">
  <div class="lp-wrap">
    <div data-reveal>
      <p class="lp-eyebrow">The route</p>
      <h2 class="lp-h2">Eleven stages. <span class="lp-accent">Every gate explained.</span></h2>
      <p class="lp-sub">Each stage has a populated procedure - owner, inputs, steps, evidence, reviewer and exit criteria. Select a stage.</p>
    </div>
    <div class="lp-stages" data-stages data-reveal data-delay="120">
      <div class="lp-stage-tabs" role="tablist" aria-label="IPO stages">
        ${STAGES.map((s, i) => html`<button type="button" role="tab" id="st-tab-${i}" aria-controls="st-panel-${i}" aria-selected="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}" class="lp-stage-tab"><span class="lp-stage-n">${String(s.n).padStart(2, '0')}</span><span class="lp-stage-name">${SHORT[i]}</span></button>`)}
        <span class="lp-stage-bar" aria-hidden="true"><span data-stage-progress></span></span>
      </div>
      ${STAGES.map((s, i) => html`<div class="lp-stage-panel" role="tabpanel" id="st-panel-${i}" aria-labelledby="st-tab-${i}" ${i ? raw('hidden') : ''}>
        <div><p class="lp-mono">Stage ${String(s.n).padStart(2, '0')} · ${s.sop.id}</p><h3>${s.name}</h3><p>${s.sop.purpose}</p></div>
        <dl>
          <div><dt>Owner</dt><dd>${s.owner}</dd></div>
          <div><dt>Reviewer</dt><dd>${s.sop.responsibility.reviewer}</dd></div>
          <div><dt>Exit evidence</dt><dd>${s.exit}</dd></div>
        </dl>
      </div>`)}
    </div>
  </div>
</section>

<section class="lp-section" id="routes">
  <div class="lp-wrap">
    <div data-reveal>
      <p class="lp-eyebrow">Jurisdiction routing</p>
      <h2 class="lp-h2">Incorporation <span class="lp-accent">is not destiny</span></h2>
      <p class="lp-sub">Where you are incorporated, where you are run from, where you offer and where you list are separate facts. The routing engine keeps them separate - and shows what it does not yet know.</p>
    </div>
    <div class="lp-cards lp-cards-4">
      ${[
    ['CA', 'Canadian conventional IPO', 'Provincial and territorial prospectus, exchange application, underwriting and continuous disclosure.'],
    ['US', 'US domestic IPO', 'Registration statement, SEC review, FINRA where applicable - with EGC, SRC and filer status assessed separately.'],
    ['FPI', 'Canadian company in the US', 'A real foreign private issuer test, not an assumption. MJDS screened on its own conditions.'],
    ['CA + US', 'Concurrent Canada & US', 'Both sets of obligations, currencies, selling restrictions and settlement in one coordinated plan.'],
  ].map(([tag, t, d], i) => html`<article class="lp-card" data-reveal data-delay="${i * 80}"><span class="lp-card-glow" aria-hidden="true"></span><p class="lp-tag">${tag}</p><h3>${t}</h3><p>${d}</p></article>`)}
    </div>
  </div>
</section>

<section class="lp-section lp-section-tint" id="numbers">
  <div class="lp-wrap lp-calc-grid">
    <div data-reveal>
      <p class="lp-eyebrow">Live calculator</p>
      <h2 class="lp-h2">Company cash <span class="lp-accent">is not deal size</span></h2>
      <p class="lp-sub">Move the sliders. New shares bring cash to the company; shares sold by existing holders do not. The workspace runs the full calculators on exact decimal engines, with formulas and exports.</p>
      <a class="lp-btn lp-btn-ink" href="/login?demo=1">Open the full calculators ${ARROW}</a>
    </div>
    <form class="lp-calc" data-calc data-reveal data-delay="120" aria-label="Offering proceeds calculator (illustrative)">
      <div class="lp-calc-inputs">
        ${[
    ['pre', 'Pre-offering shares', 1_000_000, 50_000_000, 500_000, 10_000_000, 'shares'],
    ['primary', 'New company shares', 0, 20_000_000, 250_000, 2_000_000, 'shares'],
    ['secondary', 'Shares sold by existing holders', 0, 10_000_000, 250_000, 1_000_000, 'shares'],
    ['price', 'Price per share', 1, 50, 0.5, 10, 'usd'],
    ['discount', 'Underwriting discount', 0, 10, 0.25, 6, 'pct'],
    ['expenses', 'Company offering expenses', 0, 5_000_000, 100_000, 1_000_000, 'usd0'],
  ].map(([k, l, min, max, step, v, unit]) => html`<label class="lp-range"><span class="lp-range-top"><span>${l}</span><output data-out="${k}" data-unit="${unit}">${unit === 'usd' ? '$' + Number(v).toFixed(2) : unit === 'pct' ? v + '%' : unit === 'usd0' ? money(v) : Number(v).toLocaleString('en-US')}</output></span>
          <input type="range" name="${k}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`)}
      </div>
      <div class="lp-calc-results" aria-live="polite">
        <div class="lp-result lp-result-main"><p class="lp-mono">Company net proceeds</p><p class="lp-big" data-res="net">$17,800,000</p></div>
        <div class="lp-result"><p class="lp-mono">Company gross</p><p data-res="gross">$20,000,000</p></div>
        <div class="lp-result"><p class="lp-mono">To selling holders (not company cash)</p><p data-res="seller">$10,000,000</p></div>
        <div class="lp-result"><p class="lp-mono">Post-offering shares</p><p data-res="post">12,000,000</p></div>
        <div class="lp-result"><p class="lp-mono">A non-participating holder keeps</p><p data-res="keep">83.33% of their stake</p></div>
        <p class="lp-fine">Illustrative assumptions. Discount and expenses are inputs, not fee recommendations. Excludes taxes, the over-allotment option and currency effects.</p>
      </div>
    </form>
  </div>
</section>

<section class="lp-section" id="workspace">
  <div class="lp-wrap">
    <div data-reveal>
      <p class="lp-eyebrow">The workspace</p>
      <h2 class="lp-h2">Real records, <span class="lp-accent">not a reading list</span></h2>
    </div>
    <div class="lp-bento">
      ${[
    ['wide', 'Your next three actions', 'The dashboard shows the active stage, unblocked work, critical blockers and waiting reviews - without a misleading single readiness percentage.'],
    ['', 'Claims ledger', 'Every material number in your disclosure is linked to its source. Change it, and every dependent approval reopens.'],
    ['', 'Communications clearance', 'Retail promotion before filing is held for counsel. Institutional testing-the-waters stays available where permitted.'],
    ['', 'Encrypted data room', 'Classifications, immutable versions, legal holds, access logs and content screening.'],
    ['', 'Advisor directory', 'Verification routes to official registries. "Official source" is never confused with "credentials checked".'],
    ['wide', 'Public company operations', 'Closing the IPO project activates recurring obligations. They cannot be erased by marking a project complete.'],
  ].map(([w, t, d], i) => html`<article class="lp-card ${w ? 'lp-wide' : ''}" data-reveal data-delay="${(i % 3) * 80}"><span class="lp-card-glow" aria-hidden="true"></span><p class="lp-mono">0${i + 1}</p><h3>${t}</h3><p>${d}</p></article>`)}
    </div>
  </div>
</section>

<section class="lp-section lp-section-tint" id="security">
  <div class="lp-wrap">
    <div data-reveal>
      <p class="lp-eyebrow">Private by architecture</p>
      <h2 class="lp-h2">Built for <span class="lp-accent">material non-public</span> information</h2>
    </div>
    <div class="lp-cards lp-cards-4">
      ${[
    ['M12 3 4 6v6c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V6l-8-3Z', 'Encrypted twice over', 'TLS in transit. Sensitive fields and every file encrypted at rest with AES-256-GCM, bound to your organization.'],
    ['M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z', 'Strong sign-in', 'scrypt password hashing, authenticator-app MFA, lockout after repeated failures, short browser-bound sessions.'],
    ['M4 6h16M4 12h16M4 18h10', 'Least privilege', 'Twelve roles and seven classifications. A PR guest cannot reach privileged material through pages, exports or the A.I. guide.'],
    ['M9 12l2 2 4-4M4 4h16v16H4z', 'Tamper-evident trail', 'Hash-chained audit events and append-only approvals and versions. Approved history is never overwritten.'],
  ].map(([d, t, b], i) => html`<article class="lp-card" data-reveal data-delay="${i * 80}"><span class="lp-card-glow" aria-hidden="true"></span><svg class="lp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><h3>${t}</h3><p>${b}</p></article>`)}
    </div>
    <p data-reveal><a class="lp-link" href="/security">Read the security overview ${ARROW}</a></p>
  </div>
</section>

<section class="lp-section" id="faq">
  <div class="lp-wrap lp-narrow">
    <h2 class="lp-h2 lp-center" data-reveal>Questions, <span class="lp-accent">answered</span></h2>
    <div class="lp-faq">
      ${FAQ.map(([q, a], i) => html`<details class="lp-faq-item" data-reveal data-delay="${i * 50}"><summary>${q}<span class="lp-plus" aria-hidden="true">+</span></summary><p>${a}</p></details>`)}
    </div>
  </div>
</section>

<section class="lp-closing">
  <div class="lp-wrap lp-center" data-reveal>
    <h2 class="lp-h1">Your route to market<br><span class="lp-accent">starts here</span></h2>
    <p class="lp-sub lp-center-sub">One plan. Every requirement. Verified evidence.</p>
    <div class="lp-actions lp-actions-center">
      <a class="lp-btn lp-btn-ink lp-btn-lg" href="/signup">Start your IPO plan ${ARROW}</a>
      <a class="lp-btn lp-btn-ghost lp-btn-lg" href="/login?demo=1">Explore the live demo</a>
    </div>
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
