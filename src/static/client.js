// Browser entry for the static (single index.html) edition. Marketing and auth pages are pre-rendered
// from the server views at build time; the demo runs entirely in the browser on fictional data using the
// same domain engines as the server. Nothing is stored or transmitted. Accounts require the server edition.
import { STAGES, CONTENT_STATUS } from '../domain/stages.js';
import { routeSummary } from '../domain/routing.js';
import { offeringProceeds, runway, ntbvDilution, ownership } from '../domain/finance.js';
import { statusGuards, FORMS } from '../domain/forms.js';
import { GLOSSARY, LEARNING, CASES, ADVISORS, CSA_JURISDICTIONS, SOURCES, INDUSTRIES } from '../domain/content.js';
import { pendingChanges } from '../domain/rules.js';
import { DEMOS } from '../domain/demos.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"'`=]/g, (c) => `&#${c.charCodeAt(0)};`);
const ROLES = { founder: 'Founder / CEO', cfo: 'CFO / Controller', legal: 'In-house legal', external_counsel: 'External securities counsel', auditor: 'Independent auditor', banker: 'Investment banker', ir_pr: 'IR / PR' };
const REVIEWER = { counsel: 'Securities counsel', accountant: 'Accounting advisor', auditor: 'Independent auditor', board: 'Board of directors', admin: 'Organization administrator' };
const CONCL = { likely: 'Likely', unlikely: 'Unlikely', undetermined: 'Undetermined', not_applicable: 'Not applicable', requires_counsel: 'Requires counsel', requires_individual_review: 'Requires individual review', non_accelerated_initially: 'Non-accelerated (initially)' };
const RSTAT = { potential: 'Potential fit - pending review', requires_assessment: 'Assessment required', not_currently_indicated: 'Not currently indicated' };
const src = (id) => (SOURCES[id] ? `<a class="src" href="${esc(SOURCES[id][2])}" target="_blank" rel="noopener noreferrer" title="${esc(SOURCES[id][0] + ' - ' + SOURCES[id][1])}">${esc(id)}</a>` : '');
const badge = (s) => `<span class="badge badge-${esc(String(s).toLowerCase().replace(/[^a-z]+/g, '-'))}">${esc(s)}</span>`;

let state = { kind: null, profile: null, statuses: {} };

// Images are embedded once in a JSON block and attached to <img data-img> after each render.
let IMAGES = null;
function fillImages() {
  IMAGES ??= JSON.parse(document.getElementById('img-data')?.textContent || '{}');
  for (const img of document.querySelectorAll('#root img[data-img]')) if (!img.src) img.src = IMAGES[img.dataset.img] || '';
}

// ---------- Router ----------
const PAGES = ['landing', 'login', 'signup', 'forgot', 'security', 'terms', 'privacy', 'demo'];
function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const seg = path.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (seg[0] === 'app') {
    if (!state.kind) { location.hash = '#/demo'; return; }
    renderApp(seg.slice(1), params);
  } else {
    const page = PAGES.includes(seg[0]) ? seg[0] : 'landing';
    document.body.className = $(`#page-${page}`).dataset.bodyClass || '';
    $('#root').innerHTML = $(`#page-${page}`).innerHTML;
    document.title = `${$(`#page-${page}`).dataset.title} · Thought Authorities A.I. IPO`;
    fillImages();
    if (page === 'demo') wireDemoPicker();
    if (['login', 'signup', 'forgot'].includes(page)) wireAuthNotice();
    const s = params.get('s');
    if (s) setTimeout(() => document.getElementById(s)?.scrollIntoView(), 0);
  }
}
window.addEventListener('hashchange', route);

function wireAuthNotice() {
  for (const form of document.querySelectorAll('#root form')) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let n = form.parentElement.querySelector('.static-note');
      if (!n) { n = document.createElement('div'); n.className = 'form-error static-note'; n.setAttribute('role', 'alert'); form.before(n); }
      n.innerHTML = 'Accounts are not available in this static preview. Secure sign-in, encrypted storage and MFA need the server edition of Thought Authorities A.I. IPO. <a href="#/demo">Explore the demo instead</a>.';
    });
  }
}

function wireDemoPicker() {
  const form = $('#root form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const kind = new FormData(form).get('kind') || 'ca_industrial';
    state = { kind, profile: { ...DEMOS[kind].profile }, statuses: { 's0.objectives': 'In progress', 's0.readiness': 'Waiting for review' } };
    location.hash = '#/app';
  });
}

// ---------- App shell ----------
const NAV = [['', 'Dashboard'], ['roadmap', 'IPO Roadmap'], ['profile', 'Route assessment'], ['capital', 'Capital & Valuation'], ['communications', 'Communications check'], ['advisors', 'Advisors & Resources'], ['learn', 'Learning Centre']];
function shell(active, title, body) {
  document.body.className = 'app';
  document.title = `${title} · Thought Authorities A.I. IPO`;
  $('#root').innerHTML = `
<div class="demo-bar" role="status">Static demo · fictional company · runs only in your browser - nothing is saved or sent · not legal conclusions. <a href="#/">Leave demo</a></div>
<div class="app-grid">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">${$('#tpl-brand').innerHTML}</div>
    <nav aria-label="Workspace">${NAV.map(([k, l]) => `<a href="#/app/${k}" class="${k === active ? 'active' : ''}">${esc(l)}</a>`).join('')}</nav>
    <div class="sidebar-foot"><a class="guide-link" href="#/signup">Create a real account</a></div>
  </aside>
  <div class="app-main">
    <header class="topbar"><button class="menu-btn" type="button" data-toggle="sidebar" aria-controls="sidebar" aria-expanded="false">Menu</button>
      <strong>${esc(DEMOS[state.kind].label)}</strong>
      <div class="topbar-right"><span class="role-chip">${ROLES.founder}</span><a class="btn btn-ghost btn-sm" href="#/">Exit demo</a></div></header>
    <main id="main" class="content">${body}</main>
  </div>
</div>`;
  fillImages();
}
const head = (t, intro = '') => `<div class="page-head"><div><h1>${esc(t)}</h1>${intro ? `<p class="lede-sm">${intro}</p>` : ''}</div></div>`;

function tasks() {
  const sum = routeSummary(state.profile);
  const out = [];
  for (const s of STAGES) for (const t of s.tasks) {
    const r = t.routes;
    if (r.includes('all') || (r.includes('us') && sum.hasUS) || (r.includes('ca') && sum.hasCanadian)) out.push({ ...t, stage: s.n, status: state.statuses[t.key] || 'Not started' });
  }
  return out;
}
const DONE = new Set(['Approved', 'Not applicable']);

function renderApp(seg, params) {
  const view = seg[0] || '';
  if (view === 'roadmap' && seg[1]) return stagePage(seg[1]);
  if (view === 'task' && seg[1]) return taskPage(seg[1]);
  ({ '': dashboard, roadmap, profile, capital, communications, advisors, learn }[view] || dashboard)(params);
}

function dashboard() {
  const ts = tasks();
  const byKey = new Map(ts.map((t) => [t.key, t]));
  const next = ts.filter((t) => !DONE.has(t.status) && t.depends.every((k) => !byKey.has(k) || DONE.has(byKey.get(k).status))).slice(0, 3);
  const sum = routeSummary(state.profile);
  const issues = [['Most recent fiscal year statements are not yet audited by an appropriately registered firm.', 'Critical'], ['2021 option grants lack documented board approval.', 'High'], ['Board has one independent director.', 'Medium']];
  const unknowns = sum.classifications.flatMap((c) => c.unknowns.map((u) => `${c.label}: ${u}`));
  shell('', 'Dashboard', `${head(DEMOS[state.kind].label, 'Active stage: <strong>0. Assess strategic fit</strong>')}
<div class="grid-3"><section class="card span-2"><h2>Your next steps</h2><ol class="next-list">${next.map((t) => `<li><a href="#/app/task/${esc(t.key)}">${esc(t.title)}</a><span class="meta">Stage ${t.stage} · ${esc(ROLES[t.owner] || t.owner)} · ${badge(t.status)}</span></li>`).join('')}</ol></section>
<section class="card"><h2>Critical blockers</h2><p class="big-num warn">1</p><p>critical issue open</p><ul class="mini">${issues.map(([f, s]) => `<li>${esc(f)} ${badge(s)} <span class="tag-illus">Demo data</span></li>`).join('')}</ul></section></div>
<section class="card"><h2>Readiness by stage</h2><p class="fine">Shown per stage with evidence - never a single success percentage.</p><div class="stage-bars">${STAGES.map((s) => { const st = ts.filter((t) => t.stage === s.n); const d = st.filter((t) => DONE.has(t.status)).length; return `<a class="stage-bar" href="#/app/roadmap/${s.slug}"><span class="sb-n">${s.n}</span><span class="sb-name">${esc(s.name)}</span><span class="sb-count">${d}/${st.length}</span></a>`; }).join('')}</div></section>
<div class="grid-2"><section class="card"><h2>Provisional route comparison</h2><ul class="routes">${sum.routes.map((r) => `<li><strong>${esc(r.name)}</strong> <span class="route-status rs-${esc(r.status)}">${esc(RSTAT[r.status] || r.status)}</span><p>${esc(r.reasons[0])}</p></li>`).join('')}</ul><a class="link-arrow" href="#/app/profile">Edit facts and see classifications</a></section>
<section class="card"><h2>Facts still to verify</h2>${unknowns.length ? `<ul class="mini">${unknowns.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : '<p>No missing routing inputs. Counsel review is still required.</p>'}</section></div>
${pendingChanges().length ? `<section class="card notice"><h2>Rule changes requiring attention</h2><ul class="mini">${pendingChanges().map((r) => `<li><strong>${esc(r.key)}</strong> (${esc(r.version)}) - effective ${esc(r.effectiveFrom)}; not applied as current law before then. ${src(r.source)}</li>`).join('')}</ul></section>` : ''}`);
}

function roadmap() {
  const ts = tasks();
  shell('roadmap', 'IPO Roadmap', `${head('IPO Roadmap', `Gates stay closed until every applicable task is approved. <span class="tag-draft">${esc(CONTENT_STATUS)}</span>`)}
<div class="stage-list">${STAGES.map((s) => { const st = ts.filter((t) => t.stage === s.n); return `<a class="stage-row" href="#/app/roadmap/${s.slug}"><span class="sr-n">${s.n}</span><span class="sr-body"><strong>${esc(s.name)}</strong><span class="meta">Owner: ${esc(s.owner)}</span></span><span class="sr-gate">0/${st.length} Gate closed</span></a>`; }).join('')}</div>`);
}

function stagePage(slug) {
  const s = STAGES.find((x) => x.slug === slug) || STAGES[0];
  const sop = s.sop; const r = sop.responsibility;
  const ts = tasks().filter((t) => t.stage === s.n);
  const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join('');
  shell('roadmap', s.name, `${head(`Stage ${s.n}: ${s.name}`, `Owner: ${esc(s.owner)}. <span class="tag-draft">${esc(CONTENT_STATUS)}</span>`)}
<section class="card"><h2>Tasks</h2><ul class="task-list">${ts.map((t) => `<li><a href="#/app/task/${esc(t.key)}">${esc(t.title)}</a> ${badge(t.status)} ${t.material ? '<span class="tag-mat">Material</span>' : ''}</li>`).join('') || '<li>No tasks apply to this route.</li>'}</ul></section>
<section class="card sop"><h2>Standard operating procedure ${esc(sop.id)} v${esc(sop.version)}</h2><dl class="sop-grid">
<dt>Purpose</dt><dd>${esc(sop.purpose)}</dd><dt>Trigger</dt><dd>${esc(sop.trigger)}</dd>
<dt>Responsibility</dt><dd>Accountable: ${esc(r.accountable)}. Contributors: ${esc(r.contributors.join(', '))}. Reviewer: ${esc(r.reviewer)}. Approval: ${esc(r.approval)}.</dd>
<dt>Inputs</dt><dd><ul>${li(sop.inputs)}</ul></dd><dt>Procedure</dt><dd><ol>${li(sop.procedure)}</ol></dd><dt>Timing</dt><dd>${esc(sop.timing)}</dd>
<dt>Outputs</dt><dd>${esc(sop.outputs.join(', '))}</dd><dt>Verification</dt><dd>${esc(sop.verification)}</dd><dt>Escalation</dt><dd>${esc(sop.escalation)}</dd>
<dt>Support</dt><dd>${esc(sop.support)}</dd><dt>Exit evidence</dt><dd>${esc(s.exit)}</dd></dl></section>`);
}

function taskPage(key) {
  const t = tasks().find((x) => x.key === key);
  if (!t) return dashboard();
  const all = tasks(); const byKey = new Map(all.map((x) => [x.key, x]));
  const waiting = t.depends.map((k) => byKey.get(k)).filter((d) => d && !DONE.has(d.status));
  const li = (a) => (a || []).map((x) => `<li>${esc(x)}</li>`).join('');
  shell('roadmap', t.title, `${head(t.title, `Stage ${t.stage} · ${badge(t.status)} ${t.material ? '<span class="tag-mat">Material</span>' : ''}`)}
${waiting.length ? `<div class="card notice"><strong>Waiting on:</strong> ${waiting.map((d) => `<a href="#/app/task/${esc(d.key)}">${esc(d.title)}</a> (${esc(d.status)})`).join('; ')}</div>` : ''}
<div class="grid-2"><section class="card task-explain">
<h2>What this means</h2><p>${esc(t.what)}</p><h2>Why it matters</h2><p>${esc(t.why)}</p><h2>Information needed</h2><ul>${li(t.needs)}</ul>
<h2>Who does the work</h2><p>${esc(ROLES[t.owner] || t.owner)}; reviewed by ${esc(REVIEWER[t.reviewer] || 'the project lead')}.</p><h2>Steps</h2><ol>${li(t.steps)}</ol>
<h2>Example</h2><p class="example">${esc(t.example)} <span class="tag-illus">Illustrative</span></p><h2>How completion is checked</h2><p>${esc(t.check)}</p></section>
<section class="card"><h2>Update status (demo)</h2><form class="stack" id="status-form"><label>New status<select name="status">${['Not started', 'In progress', 'Waiting for information', 'Waiting for review', 'Changes requested', 'Approved', 'Blocked', 'Not applicable'].map((s) => `<option ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
<label>Note or rationale<textarea name="note" rows="2" placeholder="Required for Not applicable"></textarea></label><p class="fine">In the real workspace only the designated reviewer can approve, and uploading evidence never approves a task.</p><div class="status-msg"></div><button class="btn btn-gold btn-sm">Save status</button></form></section></div>`);
  $('#status-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target); const to = f.get('status'); const msg = $('.status-msg');
    if (to === 'Approved' && waiting.length) { msg.innerHTML = `<p class="form-error">Cannot approve: waiting on ${esc(waiting.map((d) => d.title).join('; '))}.</p>`; return; }
    if (to === 'Approved') { msg.innerHTML = `<p class="form-error">Only the designated reviewer (${esc(REVIEWER[t.reviewer] || 'reviewer')}) can approve. Founders cannot self-approve this task.</p>`; return; }
    if (to === 'Not applicable' && (!f.get('note') || t.material)) { msg.innerHTML = '<p class="form-error">"Not applicable" needs a rationale, and a material task also needs the designated reviewer.</p>'; return; }
    state.statuses[t.key] = to; taskPage(key);
  });
}

// ---------- Route assessment ----------
const PF = [
  ['incorporationCountry', 'Country of incorporation', [['CA', 'Canada'], ['US', 'United States'], ['OTHER', 'Other'], ['', 'Unknown']]],
  ['hqProvince', 'Head office province', [['', 'Not in Canada / unknown'], ...CSA_JURISDICTIONS.map(([j]) => [j, j])]],
  ['sector', 'Industry', Object.entries(INDUSTRIES).map(([k, [l]]) => [k, l])],
  ['revenueUsd', 'Last fiscal year revenue (USD)'], ['expectedFloatUsd', 'Estimated post-IPO public float (USD)'],
  ['usHolderPct', '% of voting securities held by US residents'],
  ['execsUSMajority', 'Majority of executives/directors US citizens or residents?', [['yes', 'Yes'], ['no', 'No'], ['', 'Unknown']]],
  ['assetsUSMajority', 'More than 50% of assets in the US?', [['yes', 'Yes'], ['no', 'No'], ['', 'Unknown']]],
  ['adminUS', 'Business administered principally in the US?', [['yes', 'Yes'], ['no', 'No'], ['', 'Unknown']]],
  ['canadianReportingMonths', 'Months as a Canadian reporting issuer'],
];
function profile() {
  const p = state.profile; const sum = routeSummary(p);
  const venues = [['TSX', 'TSX'], ['TSXV', 'TSX Venture'], ['CSE', 'CSE'], ['CBOE_CA', 'Cboe Canada'], ['NASDAQ', 'Nasdaq'], ['NYSE', 'NYSE'], ['NYSE_AMERICAN', 'NYSE American']];
  shell('profile', 'Route assessment', `${head('Route assessment', 'Change the facts and the provisional routes and classifications update instantly. A software match means potential fit pending counsel and exchange assessment.')}
<form class="card form-grid" id="pf">${PF.map(([n, l, o]) => o ? `<label>${esc(l)}<select name="${n}">${o.map(([v, t]) => `<option value="${esc(v)}" ${String(p[n] ?? '') === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : `<label>${esc(l)}<input name="${n}" inputmode="decimal" value="${esc(p[n] || '')}"></label>`).join('')}
<fieldset class="multi"><legend>Where securities would be offered</legend>${[['CA', 'Canada'], ['US', 'United States']].map(([v, l]) => `<label class="check"><input type="checkbox" name="offeringJurisdictions" value="${v}" ${(p.offeringJurisdictions || []).includes(v) ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
<fieldset class="multi"><legend>Candidate venues</legend>${venues.map(([v, l]) => `<label class="check"><input type="checkbox" name="venues" value="${v}" ${(p.venues || []).includes(v) ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
<div class="span-all form-actions"><button class="btn btn-gold">Update assessment</button></div></form>
<section class="card"><h2>Routes <span class="fine">as of ${esc(sum.asOf)}</span></h2><ul class="routes">${sum.routes.map((r) => `<li><strong>${esc(r.name)}</strong> <span class="route-status rs-${esc(r.status)}">${esc(RSTAT[r.status] || r.status)}</span><ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="meta">Workflow: ${esc(r.workflow)}</p></li>`).join('')}</ul></section>
<section class="card"><h2>Issuer classifications</h2><p class="fine">Each status is assessed separately and needs professional review.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Assessment</th><th>Provisional</th><th>Basis</th><th>Missing</th><th>Rule</th></tr></thead><tbody>
${sum.classifications.map((c) => `<tr><td>${esc(c.label)}</td><td><span class="concl c-${esc(c.conclusion)}">${esc(CONCL[c.conclusion] || c.conclusion)}</span></td><td>${esc(c.calc)}${c.notes?.length ? `<div class="fine">${esc(c.notes.join(' '))}</div>` : ''}</td><td>${esc(c.unknowns.join(', ') || '-')}</td><td>${esc(c.ruleVersion || '-')} ${c.source ? src(c.source) : ''} ${c.ruleReview === 'unverified' ? '<span class="tag-draft">threshold unverified</span>' : ''}</td></tr>`).join('')}</tbody></table></div></section>`);
  $('#pf').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const np = { ...state.profile };
    for (const [n] of PF) np[n] = String(f.get(n) ?? '').replace(/[,\s$]/g, '');
    np.offeringJurisdictions = f.getAll('offeringJurisdictions'); np.venues = f.getAll('venues');
    state.profile = np; profile();
  });
}

// ---------- Capital ----------
const num = (k, l, v) => `<label>${esc(l)}<input name="${k}" inputmode="decimal" value="${esc(v)}"></label>`;
const money = (d) => d.format(2); const pct = (d) => `${d.format(2)}%`;
function capital() {
  shell('capital', 'Capital & Valuation', `${head('Capital & Valuation', 'Exact decimal calculations with stated formulas and assumptions - the same engines as the server edition.')}
<section class="card"><h2>Offering proceeds</h2><form class="form-grid" data-calc="proceeds">
${num('preShares', 'Pre-offering shares', '10000000')}${num('primaryShares', 'New company shares (primary)', '2000000')}${num('secondaryShares', 'Selling-holder shares (secondary)', '1000000')}
${num('price', 'Price per share', '10')}${num('discountPct', 'Underwriting discount % (assumption)', '6')}${num('issuerExpenses', 'Company expenses', '1000000')}
${num('optionPrimary', 'Option: extra company shares', '300000')}${num('optionSecondary', 'Option: extra selling-holder shares', '150000')}
<div class="span-all form-actions"><button class="btn btn-gold">Calculate</button></div></form><div class="out"></div></section>
<section class="card"><h2>Ownership and voting</h2><form class="stack" data-calc="ownership"><p class="fine">One holder per line: name | class | shares | votes per share | shares sold</p>
<textarea name="holders" rows="4">Founder A | Class B multiple voting | 6000000 | 10 | 0\nVenture Fund | Common | 3000000 | 1 | 1000000\nEmployees | Common | 1000000 | 1 | 0</textarea>
<div class="two">${num('primaryShares', 'New company shares', '2000000')}${num('newVotes', 'Votes per new share', '1')}</div><div class="form-actions"><button class="btn btn-gold">Simulate</button></div></form><div class="out"></div></section>
<section class="card"><h2>NTBV dilution</h2><form class="form-grid" data-calc="ntbv">${num('preNtbv', 'Pre-offering NTBV', '15000000')}${num('preShares', 'Pre-offering shares', '10000000')}${num('newShares', 'New company shares', '2000000')}${num('price', 'Offering price', '10')}${num('netProceeds', 'Company net proceeds', '17800000')}
<div class="span-all form-actions"><button class="btn btn-gold">Calculate</button></div></form><div class="out"></div></section>
<section class="card"><h2>Cash runway under IPO scenarios</h2><form class="form-grid" data-calc="runway">${num('cash', 'Current cash', '9000000')}${num('burn', 'Monthly burn', '650000')}${num('readinessFeesMonthly', 'Readiness fees / month', '120000')}${num('monthsToIpo', 'Months to closing', '9')}${num('netProceeds', 'Company net proceeds', '17800000')}${num('publicCoAnnualCost', 'Public-company cost / year', '2500000')}${num('delayMonths', 'Delay: extra months', '6')}${num('downsizePct', 'Downsized: % of proceeds', '60')}${num('abandonmentCosts', 'Costs if abandoned', '900000')}
<div class="span-all form-actions"><button class="btn btn-gold">Forecast</button></div></form><div class="out"></div></section>`);
  document.querySelectorAll('form[data-calc]').forEach((form) => form.addEventListener('submit', (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(form)); const out = form.nextElementSibling;
    try { out.innerHTML = CALC[form.dataset.calc](b); } catch (err) { out.innerHTML = `<p class="form-error">${esc(err.fields ? Object.values(err.fields).join(' ') : err.message)}</p>`; }
  }));
}
const CALC = {
  proceeds(b) {
    const p = offeringProceeds(b); const row = (l, k, f = money) => `<tr><th>${l}</th><td>${f(p.base[k])}</td><td>${f(p.withOption[k])}</td></tr>`;
    const n0 = (d) => d.format(0);
    return `<div class="table-wrap"><table class="tbl num"><thead><tr><th>${p.currency}</th><th>Base offering</th><th>With option exercised</th></tr></thead><tbody>
${row('Company shares sold', 'primaryShares', n0)}${row('Selling-holder shares sold', 'secondaryShares', n0)}${row('Company gross proceeds', 'issuerGross')}${row('Underwriting discount (company)', 'issuerDiscount')}${row('Company expenses', 'issuerExpenses')}
<tr class="em"><th>Company net proceeds</th><td>${money(p.base.issuerNet)}</td><td>${money(p.withOption.issuerNet)}</td></tr>${row('Selling-holder gross (not company cash)', 'sellerGross')}${row('Total deal size', 'totalDealSize')}${row('Post-offering shares', 'postShares', n0)}
<tr><th>Retention for a non-participating holder</th><td>${pct(p.base.nonParticipatingRetention.mul(100))}</td><td>${pct(p.withOption.nonParticipatingRetention.mul(100))}</td></tr></tbody></table></div>
${p.warnings.map((w) => `<p class="form-error">${esc(w)}</p>`).join('')}<ul class="fine">${p.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`;
  },
  ownership(b) {
    const holders = String(b.holders).split('\n').map((l) => { const [name, cls, shares, votesPerShare, sold] = l.split('|').map((x) => x?.trim()); return { name, cls, shares: shares || '0', votesPerShare: votesPerShare || '1', sold: sold || '0' }; }).filter((h) => h.name);
    const o = ownership({ holders, primaryShares: b.primaryShares, newInvestorVotesPerShare: b.newVotes });
    return `<div class="table-wrap"><table class="tbl num"><thead><tr><th>Holder</th><th>Pre economic</th><th>Pre voting</th><th>Post economic</th><th>Post voting</th></tr></thead><tbody>${o.table.map((x) => `<tr><th>${esc(x.name)}</th><td>${pct(x.preEconomic)}</td><td>${pct(x.preVoting)}</td><td>${pct(x.postEconomic)}</td><td>${pct(x.postVoting)}</td></tr>`).join('')}</tbody></table></div><ul class="fine">${o.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  },
  ntbv(b) {
    const n = ntbvDilution(b);
    return `<dl class="kv"><dt>NTBV per share before</dt><dd>${n.preNtbvPs.format(4)}</dd><dt>NTBV per share after</dt><dd>${n.postNtbvPs.format(4)}</dd><dt>Increase to existing holders</dt><dd>${n.increaseToExisting.format(4)}</dd><dt>Dilution to new investors</dt><dd>${n.dilutionToNew.format(4)} (${pct(n.dilutionPct)})</dd></dl>`;
  },
  runway(b) {
    const r = runway(b);
    return `<div class="table-wrap"><table class="tbl num"><thead><tr><th>Scenario</th><th>Company proceeds</th><th>Cash after 36 months</th><th>Cash runs out</th></tr></thead><tbody>${Object.entries(r.scenarios).map(([k, s]) => `<tr><th>${k[0].toUpperCase() + k.slice(1)}</th><td>${s.proceeds ? money(s.proceeds) : 'None'}</td><td>${money(s.endCash)}</td><td class="${s.zeroMonth ? 'warn' : ''}">${s.zeroMonth ? `Month ${s.zeroMonth}` : 'Beyond 36 months'}</td></tr>`).join('')}</tbody></table></div><ul class="fine">${r.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  },
};

// ---------- Communications ----------
function communications() {
  const def = FORMS.communication; const fld = (n) => def.fields.find((x) => x.name === n);
  const sel = (n) => `<label>${esc(fld(n).label)}<select name="${n}">${fld(n).options.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>`;
  shell('communications', 'Communications check', `${head('Communications check', 'Every communication is classified in context. Retail or paid promotion during the offering process is held for counsel automatically.')}
<form class="card form-grid" id="cf"><label class="span-all">Content / description<textarea name="content" rows="2">Instagram ads inviting the public to invest before our IPO</textarea></label>${sel('stage')}${sel('audience')}${sel('type')}${sel('jurisdictions')}
<div class="span-all form-actions"><button class="btn btn-gold">Submit for review</button></div></form><div id="cf-out"></div>`);
  $('#cf').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = statusGuards('communication', Object.fromEntries(new FormData(e.target)), { action: 'submit' });
    $('#cf-out').innerHTML = r.status === 'Held for counsel review'
      ? `<div class="card notice"><h2>${badge(r.status)}</h2><p>${esc(r.note)}</p><p>Nothing is published or sent by the platform.</p></div>`
      : `<div class="card"><h2>${badge(r.status)}</h2><p>Routed to securities counsel, who determines the communication type, permitted audiences, legends and any filing requirements for this exact version.</p></div>`;
  });
}

// ---------- Advisors and learning ----------
function advisors() {
  shell('advisors', 'Advisors & Resources', `${head('Advisors & Resources', 'Starting points for evaluation - not recommendations or promised introductions. A website confirming a practice is not proof of licensing or fit.')}
<section class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Category</th><th>Coverage</th><th>Label</th><th>How to verify</th><th>Sources</th></tr></thead><tbody>${ADVISORS.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.category)}</td><td>${esc(a.geo)}</td><td><span class="label-src">${esc(a.label)}</span></td><td>${esc(a.verify)}</td><td>${a.src.map(src).join('') || '<span class="muted">Source pending</span>'}</td></tr>`).join('')}</tbody></table></div></section>
<section class="card"><h2>Canadian securities regulators (13 jurisdictions)</h2><p class="fine">Confirm current names in the official CSA directory ${src('R41')}.</p><div class="juris">${CSA_JURISDICTIONS.map(([j, r]) => `<div><strong>${esc(j)}</strong><span>${esc(r)}</span></div>`).join('')}</div></section>`);
}

function learn() {
  shell('learn', 'Learning Centre', `${head('Learning Centre', 'Plain-language units with a worked example and a quick check. Completion shows learning activity, not a professional qualification.')}
${LEARNING.map((u) => `<section class="card unit"><h2>${u.n}. ${esc(u.title)}</h2><p>${esc(u.text)}</p><p class="example"><strong>Example:</strong> ${esc(u.example)} <span class="tag-illus">Illustrative</span></p>
<form class="check-form" data-unit="${u.n}"><fieldset><legend>${esc(u.check.q)}</legend>${u.check.a.map((a, i) => `<label class="check"><input type="radio" name="answer" value="${i}" required> ${esc(a)}</label>`).join('')}</fieldset><button class="btn btn-outline btn-sm">Check</button><div class="res"></div></form></section>`).join('')}
<section class="card"><h2>Case library</h2><p class="fine">Lessons are product-design interpretations, not proof of causation or predictions of returns.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Case</th><th>Documented observation</th><th>Lesson (interpretation)</th><th>Sources</th></tr></thead><tbody>${CASES.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.obs)}</td><td>${esc(c.lesson)}</td><td>${c.src.map(src).join('')}</td></tr>`).join('')}</tbody></table></div></section>
<section class="card"><h2>Glossary</h2><dl class="glossary">${GLOSSARY.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl></section>`);
  document.querySelectorAll('form[data-unit]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = LEARNING.find((x) => x.n === Number(f.dataset.unit));
    const ok = Number(new FormData(f).get('answer')) === u.check.correct;
    f.querySelector('.res').innerHTML = `<p class="${ok ? 'form-ok' : 'form-error'}">${ok ? 'Correct.' : 'Not quite - re-read the explanation above.'}</p>`;
  }));
}

// ---------- Global UI ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle="sidebar"]');
  const sb = document.getElementById('sidebar');
  if (t && sb) { const open = sb.classList.toggle('open'); t.setAttribute('aria-expanded', String(open)); return; }
  if (sb && sb.classList.contains('open') && !e.target.closest('#sidebar')) sb.classList.remove('open');
});
route();
