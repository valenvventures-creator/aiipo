import { html, raw } from '../http.js';
import { appShell, statusBadge, classBadge, csrfField, srcLink } from './layout.js';
import { STAGES, CONTENT_STATUS, TASK_STATUSES, DONE } from '../domain/stages.js';
import { FORMS } from '../domain/forms.js';
import { SECTIONS, completion } from '../domain/onboarding.js';
import { SOURCES, GLOSSARY, LEARNING, CASES, ADVISORS, ADVISOR_LABELS, CSA_JURISDICTIONS, RESOURCES, INDUSTRIES, COVERAGE } from '../domain/content.js';
import { ROLES, CLASSIFICATIONS, canRead, can } from '../security/permissions.js';
import { pendingChanges } from '../domain/rules.js';
import { D } from '../domain/decimal.js';

const REVIEWER = { counsel: 'Securities counsel', accountant: 'Accounting advisor', auditor: 'Independent auditor', board: 'Board of directors', admin: 'Organization administrator', cfo: 'CFO', banker: 'Lead banker' };
const CONCLUSION = { likely: 'Likely', unlikely: 'Unlikely', undetermined: 'Undetermined', not_applicable: 'Not applicable', requires_counsel: 'Requires counsel', requires_individual_review: 'Requires individual review', non_accelerated_initially: 'Non-accelerated (initially)' };
const ROUTE_STATUS = { potential: 'Potential fit - pending review', requires_assessment: 'Assessment required', not_currently_indicated: 'Not currently indicated', not_applicable: 'Not applicable' };
const shell = (o) => appShell(o);
const fmtDate = (s) => (s ? String(s).slice(0, 10) : '');

function pageHead(title, intro, extra = '') {
  return html`<div class="page-head"><div><h1>${title}</h1>${intro ? html`<p class="lede-sm">${intro}</p>` : ''}</div>${extra}</div>`;
}

function noProject(ctx, nonce, active, title) {
  return shell({ ctx, nonce, active, title, body: html`${pageHead(title)}<div class="empty"><h2>Start with a project</h2><p>Create your IPO project to unlock this area.</p><a class="btn btn-gold" href="/app/onboarding">Create project</a></div>` });
}

// ---------- Dashboard ----------
// ---------- Dashboard ----------
// Status colours follow the validated status palette (good / warning / serious / critical) and always
// travel with an icon and a word, never colour alone. Gold is the brand accent for "where you are".
const ICON = {
  done: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>'),
  clock: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/></svg>'),
  alert: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v5"/><circle cx="8" cy="11.8" r=".6"/></svg>'),
  dot: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/></svg>'),
  ring: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5"/></svg>'),
  arrow: raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>'),
};
function taskState(status) {
  if (['Approved', 'Not applicable'].includes(status)) return ['good', 'done'];
  if (status === 'Waiting for review') return ['warning', 'clock'];
  if (status === 'Blocked') return ['critical', 'alert'];
  if (status === 'Changes requested' || status === 'Waiting for information') return ['serious', 'alert'];
  if (status === 'In progress') return ['accent', 'dot'];
  return ['neutral', 'ring'];
}
const pill = (status) => { const [tone, icon] = taskState(status); return html`<span class="db-pill db-${tone}">${ICON[icon]}${status}</span>`; };
const SEV = { Critical: ['critical', 'alert'], High: ['serious', 'alert'], Medium: ['warning', 'clock'], Low: ['neutral', 'ring'] };
const sevPill = (sev) => { const [tone, icon] = SEV[sev] || SEV.Low; return html`<span class="db-pill db-${tone}">${ICON[icon]}${sev || 'Unrated'}</span>`; };
// Bars drawn as SVG (presentation attributes are allowed by the CSP; inline styles are not).
const meter = (pct, label) => html`<svg class="db-meter" viewBox="0 0 100 6" preserveAspectRatio="none" role="img" aria-label="${label}"><rect class="db-meter-track" width="100" height="6" rx="3"/><rect class="db-meter-fill" width="${Math.max(0, Math.min(100, pct))}" height="6" rx="3"/></svg>`;
const STAGE_SHORT = ['Strategy', 'Team', 'Finance', 'Legal', 'Disclosure', 'Review', 'Marketing', 'Pricing', 'Closing', 'First 90 days', 'Public company'];

export function dashboard({ ctx, nonce, plan, project, flash }) {
  if (!project) return noProject(ctx, nonce, 'dashboard', 'Dashboard');
  const comp = completion(project.profile);
  const routes = project.assessment.routes || [];
  const active = plan.activeStage.n;
  const doneTasks = plan.readiness.reduce((a, r) => a + r.done, 0);
  const totalTasks = plan.readiness.reduce((a, r) => a + r.total, 0);
  return shell({
    ctx, nonce, flash, active: 'dashboard', title: 'Dashboard', extraCss: '/css/dashboard.css',
    body: html`
<div class="db" data-dash>
<section class="db-hero db-in d0">
  <div class="db-hero-glow" aria-hidden="true"></div>
  <div class="db-hero-main">
    <p class="db-eyebrow">IPO project · ${project.name}</p>
    <h1 class="db-h1">Welcome back${ctx.profile.firstName ? `, ${ctx.profile.firstName}` : ''}.</h1>
    <p class="db-hero-sub">You are working through <strong>Stage ${active}: ${plan.activeStage.name}</strong>. ${plan.next.length ? html`Your next step is <a href="/app/tasks/${plan.next[0].id}">${plan.next[0].title}</a>.` : 'No tasks are unblocked right now - check items waiting for review.'}</p>
    <div class="db-actions">
      <a class="db-btn db-btn-ink" href="/app/guide">Ask the A.I. guide ${ICON.arrow}</a>
      <a class="db-btn" href="/app/capital#proceeds">Proceeds calculator</a>
      <a class="db-btn" href="/app/dataroom">Upload a document</a>
      <a class="db-btn" href="/app/settings">Invite your team</a>
    </div>
  </div>
  <div class="db-hero-figure" aria-label="Current stage ${active} of 10">
    <p class="db-mono">Current stage</p>
    <p class="db-figure"><span data-count="${active}">${String(active).padStart(2, '0')}</span><span class="db-figure-of">/ 10</span></p>
    <p class="db-figure-name">${STAGE_SHORT[active]}</p>
  </div>
</section>

<section class="db-card db-journey db-in d1" aria-labelledby="journey-h">
  <div class="db-card-head"><h2 id="journey-h">Your route to market</h2><a class="db-link" href="/app/roadmap">Open roadmap ${ICON.arrow}</a></div>
  <div class="db-journey-scroll">
    <ol class="db-track" data-journey>
      <li class="db-track-line" aria-hidden="true"><svg viewBox="0 0 1100 4" preserveAspectRatio="none"><line class="db-line-track" x1="50" y1="2" x2="1050" y2="2"/><line class="db-line-fill" x1="50" y1="2" x2="${50 + active * 100}" y2="2"/></svg></li>
      ${plan.readiness.map((r) => {
    const state = r.ready ? 'done' : r.n === active ? 'active' : r.done ? 'part' : 'next';
    const label = { done: 'Gate ready', active: 'In progress', part: 'Started', next: 'Not started' }[state];
    return html`<li class="db-stop db-stop-${state}">
        <a href="/app/roadmap/${r.slug}" aria-label="Stage ${r.n}, ${r.name}: ${label}, ${r.done} of ${r.total} tasks complete">
          <span class="db-node">${state === 'done' ? ICON.done : html`<b>${String(r.n).padStart(2, '0')}</b>`}</span>
          <span class="db-stop-name">${STAGE_SHORT[r.n]}</span>
          <span class="db-stop-count">${r.total ? `${r.done}/${r.total}` : 'n/a'}</span>
          <span class="db-tip" role="tooltip"><strong>Stage ${r.n} · ${r.name}</strong>${label} · ${r.done} of ${r.total} tasks approved or not applicable</span>
        </a>
      </li>`;
  })}
    </ol>
  </div>
  <p class="db-fine">Gates open only when every applicable task is approved or justified as not applicable. There is deliberately no single readiness score.</p>
</section>

<section class="db-kpis db-in d2" aria-label="Key figures">
  <a class="db-kpi" href="/app/tasks"><p class="db-kpi-label">Unblocked tasks</p><p class="db-kpi-value" data-count="${plan.actionable.length}">${plan.actionable.length}</p><p class="db-kpi-note">ready to work on now</p></a>
  <a class="db-kpi ${plan.critical ? 'db-kpi-alert' : ''}" href="/app/legal#issue"><p class="db-kpi-label">Critical blockers</p><p class="db-kpi-value" data-count="${plan.critical}">${plan.critical}</p><p class="db-kpi-note">${plan.critical ? html`<span class="db-pill db-critical">${ICON.alert}Needs attention</span>` : html`<span class="db-pill db-good">${ICON.done}None open</span>`}</p></a>
  <a class="db-kpi" href="/app/tasks?status=Waiting%20for%20review"><p class="db-kpi-label">Waiting for review</p><p class="db-kpi-value" data-count="${plan.waitingReview.length}">${plan.waitingReview.length}</p><p class="db-kpi-note">with professional reviewers</p></a>
  <a class="db-kpi" href="/app/dataroom"><p class="db-kpi-label">Documents</p><p class="db-kpi-value" data-count="${plan.docs.total}">${plan.docs.total}</p><p class="db-kpi-note">${plan.docs.unreviewed} unreviewed</p></a>
  <a class="db-kpi" href="/app/tasks"><p class="db-kpi-label">Tasks complete</p><p class="db-kpi-value"><span data-count="${doneTasks}">${doneTasks}</span><span class="db-kpi-of"> / ${totalTasks}</span></p>
    ${meter(totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0, `${doneTasks} of ${totalTasks} tasks complete`)}</a>
</section>

<div class="db-grid">
  <section class="db-card db-in d3" aria-labelledby="next-h">
    <div class="db-card-head"><h2 id="next-h">Your next steps</h2><a class="db-link" href="/app/tasks">All tasks ${ICON.arrow}</a></div>
    ${plan.next.length ? html`<ol class="db-next">${plan.next.map((t, i) => html`<li>
      <a class="db-next-item" href="/app/tasks/${t.id}">
        <span class="db-next-n">${i + 1}</span>
        <span class="db-next-body"><span class="db-mono">Stage ${String(t.stage).padStart(2, '0')} · ${ROLES[t.owner_role] || t.owner_role}</span><span class="db-next-title">${t.title}</span>${pill(t.status)}</span>
        <span class="db-next-go">${ICON.arrow}</span>
      </a></li>`)}</ol>` : html`<div class="db-empty"><p>No unblocked tasks right now.</p><a class="db-link" href="/app/tasks?status=Waiting%20for%20review">See what is waiting for review ${ICON.arrow}</a></div>`}
  </section>

  <section class="db-card db-in d3" aria-labelledby="blk-h">
    <div class="db-card-head"><h2 id="blk-h">Open issues</h2><a class="db-link" href="/app/legal#issue">Issue register ${ICON.arrow}</a></div>
    ${plan.blockers.length ? html`<ul class="db-issues">${plan.blockers.map((b) => html`<li><a href="/app/records/${b.id}"><span class="db-issue-text">${String(b.data.finding).slice(0, 110)}</span>${sevPill(b.data.severity)}</a></li>`)}</ul>`
    : html`<div class="db-empty"><span class="db-pill db-good">${ICON.done}No open issues</span><p>Record readiness gaps as you find them so they get an owner and a reviewer.</p><a class="db-link" href="/app/records/new/issue">Log an issue ${ICON.arrow}</a></div>`}
  </section>
</div>

<div class="db-grid">
  <section class="db-card db-in d4" aria-labelledby="route-h">
    <div class="db-card-head"><h2 id="route-h">Provisional routes</h2><a class="db-link" href="/app/roadmap#routes">Classifications ${ICON.arrow}</a></div>
    <ul class="db-routes">${routes.map((r) => html`<li class="db-route db-route-${r.status}"><p class="db-route-name">${r.name}</p><span class="db-route-status">${ROUTE_STATUS[r.status] || r.status}</span><p class="db-route-why">${r.reasons[0]}</p></li>`)}</ul>
    ${plan.unknowns.length ? html`<p class="db-mono db-sub">Facts still to verify</p><div class="db-chips">${plan.unknowns.slice(0, 8).map((u) => html`<span class="db-chip">${u}</span>`)}</div>` : html`<p class="db-fine">No missing routing inputs. Counsel review is still required.</p>`}
  </section>

  <section class="db-card db-in d4" aria-labelledby="prof-h">
    <div class="db-card-head"><h2 id="prof-h">Company profile</h2><a class="db-link" href="/app/onboarding">Edit profile ${ICON.arrow}</a></div>
    <ul class="db-meters">${comp.map((c) => html`<li><a href="/app/onboarding?section=${c.key}"><span class="db-meter-name">${c.title}</span>${meter(Math.round((c.filled / c.total) * 100), `${c.filled} of ${c.total} answered`)}<span class="db-meter-fig">${c.filled}/${c.total}</span></a></li>`)}</ul>
    <p class="db-mono db-sub">Upcoming internal dates</p>
    ${plan.upcoming.length ? html`<ul class="db-dates">${plan.upcoming.map((t) => html`<li><span class="db-date">${t.due_date}</span><a href="/app/tasks/${t.id}">${t.title}</a></li>`)}</ul>` : html`<p class="db-fine">No internal targets set yet. Assign dates in <a href="/app/tasks">Tasks</a>. Internal targets are distinct from legal deadlines.</p>`}
  </section>
</div>

${pendingChanges().length ? html`<section class="db-card db-notice db-in d4"><div class="db-card-head"><h2>Rule changes requiring attention</h2></div><ul class="db-plain">${pendingChanges().map((r) => html`<li><strong>${r.key}</strong> (${r.version}) - adopted, effective ${r.effectiveFrom}. Not applied as current law before that date. ${srcLink(r.source, SOURCES)}</li>`)}</ul></section>` : ''}
</div>`,
  });
}

// ---------- Onboarding ----------
export function onboarding({ ctx, nonce, project, sectionKey, errors = {}, values }) {
  const sec = SECTIONS.find((s) => s.key === sectionKey) || SECTIONS[0];
  const profile = values || project?.profile || {};
  const restrictedBlocked = sec.restricted && !canRead(ctx, 'restricted_pii');
  const idx = SECTIONS.indexOf(sec);
  return shell({
    ctx, nonce, active: 'dashboard', title: 'Onboarding',
    body: html`
${pageHead(project ? 'Company profile' : 'Create your IPO project', 'Answer what you know. Leave anything blank if it is unknown or not yet available - it becomes a targeted question, not a guess. Progress saves per section.')}
<nav class="tabs" aria-label="Onboarding sections">${SECTIONS.map((s) => html`<a href="/app/onboarding?section=${s.key}" class="${s.key === sec.key ? 'active' : ''}" ${!project && s.key !== 'identity' ? raw('aria-disabled="true"') : ''}>${s.title}</a>`)}</nav>
${restrictedBlocked ? html`<div class="card notice"><h2>Restricted section</h2><p>Ownership details are restricted personal information. ${ctx.profile.mfa ? 'Your role is not cleared to view them.' : html`Turn on multi-factor authentication to access them. <a href="/app/settings#mfa">Set up MFA</a>`}</p></div>` : html`
<form method="post" action="/app/onboarding" class="card form-grid">
  ${csrfField(ctx)}<input type="hidden" name="section" value="${sec.key}">
  ${!project ? html`<label class="span-all">Project name<input name="projectName" required maxlength="120" value="${profile.projectName || ''}" placeholder="e.g. 2027 IPO readiness"></label>` : ''}
  ${errors._ ? html`<div class="form-error span-all">${errors._}</div>` : ''}
  ${sec.fields.map(([name, label, type, opts]) => field(name, label, type, opts, profile[name], errors[name]))}
  <div class="span-all form-actions">
    <button class="btn btn-gold" type="submit">${project ? 'Save section' : 'Create project'}</button>
    ${project && idx < SECTIONS.length - 1 ? html`<button class="btn btn-outline" type="submit" name="next" value="${SECTIONS[idx + 1].key}">Save and continue</button>` : ''}
  </div>
</form>`}`,
  });
}

function field(name, label, type, opts, value, error) {
  const e = error ? html`<span class="field-error">${error}</span>` : '';
  if (type === 'select') return html`<label>${label}<select name="${name}">${opts.map(([v, l]) => html`<option value="${v}" ${String(value ?? '') === v ? raw('selected') : ''}>${l}</option>`)}</select>${e}</label>`;
  if (type === 'multi') {
    const vals = Array.isArray(value) ? value : [];
    return html`<fieldset class="multi"><legend>${label}</legend>${opts.map(([v, l]) => html`<label class="check"><input type="checkbox" name="${name}" value="${v}" ${vals.includes(v) ? raw('checked') : ''}> ${l}</label>`)}${e}</fieldset>`;
  }
  if (type === 'textarea') return html`<label class="span-all">${label}<textarea name="${name}" rows="3">${value || ''}</textarea>${e}</label>`;
  return html`<label>${label}<input name="${name}" type="${type === 'date' ? 'date' : 'text'}" ${type === 'decimal' ? raw('inputmode="decimal"') : ''} value="${value || ''}">${e}</label>`;
}

// ---------- Roadmap ----------
export function roadmap({ ctx, nonce, project, tasks, gates }) {
  if (!project) return noProject(ctx, nonce, 'roadmap', 'IPO Roadmap');
  const a = project.assessment;
  return shell({
    ctx, nonce, active: 'roadmap', title: 'IPO Roadmap',
    body: html`
${pageHead('IPO Roadmap', html`Stages run in parallel where possible; gates prevent a milestone from being shown as ready before its conditions are met. <span class="tag-draft">${CONTENT_STATUS}</span>`)}
<div class="stage-list">${STAGES.map((s) => { const g = gates[s.n]; return html`<a class="stage-row ${g.ready ? 'ready' : ''}" href="/app/roadmap/${s.slug}"><span class="sr-n">${s.n}</span><span class="sr-body"><strong>${s.name}</strong><span class="meta">Owner: ${s.owner}</span></span><span class="sr-gate">${g.total ? html`${g.done}/${g.total} ${g.ready ? 'Gate ready' : 'Gate closed'}` : 'No tasks for this route'}</span></a>`; })}</div>
<section class="card" id="routes">
  <h2>Route assessment <span class="fine">as of ${a.asOf}</span></h2>
  <p class="fine">Provisional and reviewable. A software match means potential fit pending advisor and exchange assessment. Counsel review task: <a href="/app/tasks?key=s1.route">Counsel review of provisional route</a>.</p>
  <ul class="routes">${(a.routes || []).map((r) => html`<li><strong>${r.name}</strong> <span class="route-status rs-${r.status}">${ROUTE_STATUS[r.status] || r.status}</span><ul>${r.reasons.map((x) => html`<li>${x}</li>`)}</ul><p class="meta">Workflow: ${r.workflow}</p></li>`)}</ul>
  <h3 class="h-sm">Issuer classifications</h3>
  <p class="fine">Each status is assessed separately; an issuer can hold several. A founder's checkbox is not a substitute for counsel's classification review.</p>
  <div class="table-wrap"><table class="tbl">
    <thead><tr><th>Assessment</th><th>Provisional</th><th>Calculation / basis</th><th>Missing inputs</th><th>Rule version</th><th>Reviewer</th></tr></thead>
    <tbody>${(a.classifications || []).map((c) => html`<tr><td>${c.label}</td><td><span class="concl c-${c.conclusion}">${CONCLUSION[c.conclusion] || c.conclusion}</span></td><td>${c.calc}${c.notes?.length ? html`<div class="fine">${c.notes.join(' ')}</div>` : ''}</td><td>${c.unknowns.length ? c.unknowns.map((u) => html`<a href="/app/onboarding?section=${['usHolderPct', 'execsUSMajority', 'assetsUSMajority', 'adminUS', 'canadianReportingMonths'].includes(u) ? 'ownership' : ['revenueUsd', 'expectedFloatUsd'].includes(u) ? 'financial' : 'objectives'}">${u}</a> `) : '-'}</td><td>${c.ruleVersion || '-'} ${c.source ? srcLink(c.source, SOURCES) : ''} ${c.ruleReview === 'unverified' ? html`<span class="tag-draft">threshold unverified</span>` : ''}</td><td>${REVIEWER[c.reviewer] || c.reviewer}</td></tr>`)}</tbody>
  </table></div>
</section>`,
  });
}

export function stageDetail({ ctx, nonce, stage, tasks }) {
  const sop = stage.sop;
  const mine = tasks.filter((t) => t.stage === stage.n && t.status !== 'Superseded');
  const r = sop.responsibility;
  return shell({
    ctx, nonce, active: 'roadmap', title: stage.name,
    body: html`
${pageHead(`Stage ${stage.n}: ${stage.name}`, html`Owner: ${stage.owner}${stage.support ? `, supported by ${stage.support}` : ''}. <span class="tag-draft">${CONTENT_STATUS}</span>`)}
<section class="card"><h2>Tasks</h2>${mine.length ? html`<ul class="task-list">${mine.map((t) => html`<li><a href="/app/tasks/${t.id}">${t.title}</a> ${statusBadge(t.status)} ${t.material ? html`<span class="tag-mat">Material</span>` : ''}</li>`)}</ul>` : html`<p>No tasks in this stage apply to your current route.</p>`}</section>
<section class="card sop">
  <h2>Standard operating procedure ${sop.id} v${sop.version}</h2>
  <dl class="sop-grid">
    <dt>Purpose</dt><dd>${sop.purpose}</dd>
    <dt>Trigger</dt><dd>${sop.trigger}</dd>
    <dt>Responsibility</dt><dd>Accountable: ${r.accountable}. Contributors: ${r.contributors.join(', ')}. Professional reviewer: ${r.reviewer}. Approval: ${r.approval}.</dd>
    <dt>Inputs</dt><dd><ul>${sop.inputs.map((x) => html`<li>${x}</li>`)}</ul></dd>
    <dt>Procedure</dt><dd><ol>${sop.procedure.map((x) => html`<li>${x}</li>`)}</ol></dd>
    <dt>Timing</dt><dd>${sop.timing}</dd>
    <dt>Outputs</dt><dd>${sop.outputs.join(', ')}</dd>
    <dt>Verification</dt><dd>${sop.verification}</dd>
    <dt>Escalation</dt><dd>${sop.escalation}</dd>
    <dt>Support</dt><dd>${sop.support}</dd>
    <dt>Exit evidence</dt><dd>${stage.exit}</dd>
  </dl>
</section>`,
  });
}

// ---------- Tasks ----------
export function tasksPage({ ctx, nonce, project, tasks, filter, members }) {
  if (!project) return noProject(ctx, nonce, 'tasks', 'Tasks & Calendar');
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  let shown = tasks.filter((t) => t.status !== 'Superseded');
  if (filter.status) shown = shown.filter((t) => t.status === filter.status);
  if (filter.key) shown = shown.filter((t) => t.key === filter.key);
  const names = Object.fromEntries(members.map((m) => [m.id, m.name || m.email]));
  return shell({
    ctx, nonce, active: 'tasks', title: 'Tasks & Calendar',
    body: html`
${pageHead('Tasks & Calendar', 'Every task shows who does the work, who reviews it, and what it is waiting on.')}
<form class="filters" method="get" action="/app/tasks"><label>Status<select name="status" data-autosubmit><option value="">All</option>${TASK_STATUSES.map((s) => html`<option ${filter.status === s ? raw('selected') : ''}>${s}</option>`)}</select></label></form>
<div class="table-wrap"><table class="tbl">
  <thead><tr><th>Stage</th><th>Task</th><th>Owner</th><th>Reviewer</th><th>Assignee</th><th>Target date</th><th>Status</th><th>Waiting on</th></tr></thead>
  <tbody>${shown.map((t) => { const wait = t.depends_on.map((k) => byKey.get(k)).filter((d) => d && !DONE.has(d.status)); return html`<tr>
    <td>${t.stage}</td><td><a href="/app/tasks/${t.id}">${t.title}</a>${t.material ? html` <span class="tag-mat">Material</span>` : ''}</td>
    <td>${ROLES[t.owner_role] || t.owner_role}</td><td>${REVIEWER[t.reviewer_role] || '-'}</td><td>${names[t.assignee_id] || '-'}</td><td>${t.due_date || '-'}</td><td>${statusBadge(t.status)}</td>
    <td>${wait.length ? wait.map((d) => html`<a href="/app/tasks/${d.id}" class="dep">${d.title}</a>`) : '-'}</td></tr>`; })}</tbody>
</table></div>`,
  });
}

export function taskDetail({ ctx, nonce, task, tpl, events, docs, blocking, members, error }) {
  return shell({
    ctx, nonce, active: 'tasks', title: task.title,
    body: html`
${pageHead(task.title, html`Stage ${task.stage}: ${tpl?.stage?.name || ''} · ${statusBadge(task.status)} ${task.material ? html`<span class="tag-mat">Material</span>` : ''}`)}
${error ? html`<div class="form-error" role="alert">${error}</div>` : ''}
${blocking.length ? html`<div class="card notice"><strong>Waiting on:</strong> ${blocking.map((d) => html`<a href="/app/tasks/${d.id}">${d.title}</a> (${d.status}) `)}<p class="fine">You can prepare in the meantime; approval opens when prerequisites are complete.</p></div>` : ''}
<div class="grid-2">
  <section class="card task-explain">
    ${tpl ? html`
    <h2>What this means</h2><p>${tpl.what}</p>
    <h2>Why it matters</h2><p>${tpl.why}</p>
    <h2>Information needed</h2><ul>${(tpl.needs || []).map((n) => html`<li>${n}</li>`)}</ul>
    <h2>Who does the work</h2><p>${ROLES[task.owner_role] || task.owner_role}; reviewed by ${REVIEWER[task.reviewer_role] || 'the project lead'}.</p>
    <h2>Steps</h2><ol>${(tpl.steps || []).map((n) => html`<li>${n}</li>`)}</ol>
    <h2>Example</h2><p class="example">${tpl.example} <span class="tag-illus">Illustrative</span></p>
    <h2>How completion is checked</h2><p>${tpl.check}</p>
    <h2>How to get help</h2><p><a href="/app/guide?task=${task.key}">Ask the A.I. guide to assemble questions for your advisor</a> or <a href="/app/advisors">find a professional</a>.</p>` : ''}
  </section>
  <section class="stack-gap">
    ${tpl?.form ? html`<div class="card"><h2>Form for this task</h2><p><a class="btn btn-outline btn-sm" href="${tpl.form === 'onboarding' ? '/app/onboarding?section=objectives' : `/app/records/new/${tpl.form}?task=${task.id}`}">${tpl.form === 'onboarding' ? 'Open IPO objectives' : `New ${FORMS[tpl.form].name}`}</a></p></div>` : ''}
    ${tpl?.tool ? html`<div class="card"><h2>Tool for this task</h2><p><a class="btn btn-outline btn-sm" href="/app/capital#${tpl.tool}">Open ${tpl.tool} tool</a></p></div>` : ''}
    <form class="card stack" method="post" action="/app/tasks/${task.id}/status">
      ${csrfField(ctx)}
      <h2>Update status</h2>
      <label>New status<select name="status">${TASK_STATUSES.filter((s) => s !== 'Superseded').map((s) => html`<option ${s === task.status ? raw('selected') : ''}>${s}</option>`)}</select></label>
      <label>Note or rationale<textarea name="note" rows="2" maxlength="2000" placeholder="Required for Not applicable"></textarea></label>
      <p class="fine">Only the designated reviewer can approve. Uploading evidence does not approve a task.</p>
      <button class="btn btn-gold btn-sm" type="submit">Save status</button>
    </form>
    <form class="card stack" method="post" action="/app/tasks/${task.id}/assign">
      ${csrfField(ctx)}<h2>Assignment</h2>
      <label>Assignee<select name="assignee"><option value="">Unassigned</option>${members.map((m) => html`<option value="${m.id}" ${task.assignee_id === m.id ? raw('selected') : ''}>${m.name || m.email} - ${ROLES[m.role]}</option>`)}</select></label>
      <label>Internal target date<input type="date" name="due" value="${task.due_date || ''}"></label>
      <button class="btn btn-outline btn-sm" type="submit">Save</button>
    </form>
    <form class="card stack" method="post" action="/app/tasks/${task.id}/evidence">
      ${csrfField(ctx)}<h2>Evidence</h2>
      ${task.evidence.length ? html`<ul class="mini">${task.evidence.map((id) => { const d = docs.find((x) => x.id === id); return html`<li>${d ? html`<a href="/app/dataroom/${d.id}">${d.name}</a> · ${d.review_status}` : 'Document not visible to your role'}</li>`; })}</ul>` : html`<p class="muted">No evidence linked yet.</p>`}
      ${docs.length ? html`<label>Link a data-room document<select name="documentId">${docs.map((d) => html`<option value="${d.id}">${d.folder} / ${d.name}</option>`)}</select></label><button class="btn btn-outline btn-sm" type="submit">Link evidence</button>` : html`<a href="/app/dataroom">Upload to the data room first</a>`}
    </form>
    <div class="card"><h2>History</h2>${events.length ? html`<ul class="timeline">${events.map((e) => html`<li><span class="meta">${fmtDate(e.at)}</span> ${e.from_status} → <strong>${e.to_status}</strong>${e.note ? html` - ${e.note}` : ''}</li>`)}</ul>` : html`<p class="muted">No changes yet.</p>`}</div>
  </section>
</div>`,
  });
}

// ---------- Records (generic register pages) ----------
export function registerPage({ ctx, nonce, project, active, title, intro, forms, records, hidden, extra = '' }) {
  if (!project) return noProject(ctx, nonce, active, title);
  return shell({
    ctx, nonce, active, title,
    body: html`
${pageHead(title, intro)}
${extra}
${forms.map((key) => { const def = FORMS[key]; const list = records.filter((r) => r.form === key); return html`
<section class="card" id="${key}">
  <div class="card-head"><h2>${def.name}</h2>${can(ctx, 'record.create') ? html`<a class="btn btn-gold btn-sm" href="/app/records/new/${key}">New ${def.name.toLowerCase()}</a>` : ''}</div>
  <p class="fine">Default classification: ${CLASSIFICATIONS[def.classification]} · Reviewer: ${REVIEWER[def.reviewer]}</p>
  ${list.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Record</th><th>Status</th><th>Version</th><th>Classification</th><th>Updated</th></tr></thead><tbody>
    ${list.map((r) => html`<tr><td><a href="/app/records/${r.id}">${String(def.title(r.data) || def.name).slice(0, 110)}</a></td><td>${statusBadge(r.status)}</td><td>v${r.version}</td><td>${classBadge(r.classification, CLASSIFICATIONS[r.classification])}</td><td>${fmtDate(r.updated_at)}</td></tr>`)}
  </tbody></table></div>` : html`<p class="muted">No records yet. ${can(ctx, 'record.create') ? 'Create the first one to start the workflow.' : 'Ask a team member with edit access to create one.'}</p>`}
  ${hidden[key] ? html`<p class="fine">${hidden[key]} record(s) are above your clearance${ctx.profile.mfa ? '' : ' or need MFA'} and are not shown.</p>` : ''}
</section>`; })}`,
  });
}

export function recordForm({ ctx, nonce, form, record, errors = {}, values, taskId }) {
  const def = FORMS[form];
  const data = values || record?.data || {};
  return shell({
    ctx, nonce, active: areaNav(def.area), title: def.name,
    body: html`
${pageHead(record ? `Edit ${def.name.toLowerCase()}` : `New ${def.name.toLowerCase()}`, html`Unknown values may be left blank while drafting; required fields must be resolved before approval.${record?.status === 'Approved' ? html` <strong>Editing an approved record creates a new version and reopens review.</strong>` : ''}`)}
<form method="post" action="${record ? `/app/records/${record.id}` : `/app/records/new/${form}`}" class="card form-grid">
  ${csrfField(ctx)}${taskId ? html`<input type="hidden" name="taskId" value="${taskId}">` : ''}
  ${errors._ ? html`<div class="form-error span-all" role="alert">${errors._}</div>` : ''}
  ${def.fields.map((fl) => {
    const e = errors[fl.name] ? html`<span class="field-error">${errors[fl.name]}</span>` : '';
    const req = fl.required ? html` <span class="req" title="Required before approval">*</span>` : '';
    if (fl.type === 'select') return html`<label>${fl.label}${req}<select name="${fl.name}"><option value="">Unknown / not yet available</option>${fl.options.map((o) => html`<option ${data[fl.name] === o ? raw('selected') : ''}>${o}</option>`)}</select>${e}</label>`;
    if (fl.type === 'textarea') return html`<label class="span-all">${fl.label}${req}<textarea name="${fl.name}" rows="4">${data[fl.name] || ''}</textarea>${e}</label>`;
    return html`<label>${fl.label}${req}<input name="${fl.name}" type="${fl.type === 'date' ? 'date' : 'text'}" ${fl.type === 'decimal' ? raw('inputmode="decimal"') : ''} value="${data[fl.name] || ''}">${e}</label>`;
  })}
  <label>Classification<select name="classification">${Object.entries(CLASSIFICATIONS).filter(([k]) => canRead(ctx, k)).map(([k, v]) => html`<option value="${k}" ${(record?.classification || def.classification) === k ? raw('selected') : ''}>${v}</option>`)}</select></label>
  <div class="span-all form-actions">
    <button class="btn btn-outline" type="submit" name="intent" value="draft">Save draft</button>
    <button class="btn btn-gold" type="submit" name="intent" value="submit">Submit for review</button>
  </div>
</form>`,
  });
}

function areaNav(area) {
  return { legal: 'legal', finance: 'finance', capital: 'capital', advisors: 'advisors', disclosure: 'disclosure', communications: 'communications', closing: 'tasks', public: 'public' }[area] || 'dashboard';
}

export function recordView({ ctx, nonce, record, history, canReviewIt, flash, error }) {
  const def = FORMS[record.form];
  return shell({
    ctx, nonce, flash, active: areaNav(def.area), title: def.name,
    body: html`
${pageHead(def.name, html`${statusBadge(record.status)} v${record.version} · ${classBadge(record.classification, CLASSIFICATIONS[record.classification])}`, can(ctx, 'record.create') ? html`<a class="btn btn-outline btn-sm" href="/app/records/${record.id}/edit">Edit</a>` : '')}
${error ? html`<div class="form-error" role="alert">${error}</div>` : ''}
${record.status === 'Held for counsel review' ? html`<div class="card notice"><strong>Held for counsel review.</strong> Retail-directed or paid communications during the offering process need a specific counsel determination. Nothing is published or sent by the platform. An institutional testing-the-waters request remains a separate workflow where permitted.</div>` : ''}
<div class="grid-2">
  <section class="card"><dl class="kv">${def.fields.map((f) => html`<dt>${f.label}</dt><dd>${record.data[f.name] || html`<span class="muted">Unknown</span>`}</dd>`)}</dl></section>
  <section class="stack-gap">
    ${canReviewIt ? html`<form class="card stack" method="post" action="/app/records/${record.id}/review">
      ${csrfField(ctx)}<h2>Professional review</h2>
      <p class="fine">Your decision is recorded against version ${record.version} and cannot be altered later.</p>
      <label>Note<textarea name="note" rows="2" maxlength="2000"></textarea></label>
      <div class="form-actions"><button class="btn btn-gold btn-sm" name="decision" value="approve">Approve v${record.version}</button><button class="btn btn-outline btn-sm" name="decision" value="changes">Request changes</button>${record.form === 'issue' ? html`<button class="btn btn-ghost btn-sm" name="decision" value="close">Close issue</button>` : ''}</div>
    </form>` : html`<div class="card"><h2>Review</h2><p>Reviewer: ${REVIEWER[def.reviewer]}. ${record.status === 'Approved' ? 'Approved.' : 'Waiting for the designated reviewer.'}</p></div>`}
    <div class="card"><h2>Approvals (immutable)</h2>${history.approvals.length ? html`<ul class="timeline">${history.approvals.map((a) => html`<li><span class="meta">${fmtDate(a.at)}</span> <strong>${a.decision}</strong> on v${a.record_version} by ${ROLES[a.role]}${a.note ? html` - ${a.note}` : ''}</li>`)}</ul>` : html`<p class="muted">None yet.</p>`}</div>
    <div class="card"><h2>Version history</h2><ul class="timeline">${history.versions.map((v) => html`<li><span class="meta">${fmtDate(v.at)}</span> v${v.version} · ${v.status}</li>`)}</ul></div>
  </section>
</div>`,
  });
}

// ---------- Capital & valuation ----------
const money = (d) => (d ? d.format(2) : '-');
const pct = (d) => (d ? `${d.format(2)}%` : '-');
export function capital({ ctx, nonce, project, inputs = {}, results = {}, errors = {} }) {
  if (!project) return noProject(ctx, nonce, 'capital', 'Capital & Valuation');
  const p = results.proceeds;
  const r = results.runway;
  const n = results.ntbv;
  const o = results.ownership;
  const v = (k, def = '') => inputs[k] ?? def;
  const fe = (k) => (errors[k] ? html`<span class="field-error">${errors[k]}</span>` : '');
  const num = (k, label, def) => html`<label>${label}<input name="${k}" inputmode="decimal" value="${v(k, def)}">${fe(k)}</label>`;
  return shell({
    ctx, nonce, active: 'capital', title: 'Capital & Valuation',
    body: html`
${pageHead('Capital & Valuation', 'Deterministic decimal calculations with stated formulas and assumptions. The A.I. may explain results but never produces authoritative figures.')}
<section class="card" id="proceeds">
  <h2>Offering proceeds</h2>
  <form method="post" action="/app/capital/proceeds" class="form-grid">
    ${csrfField(ctx)}
    ${num('preShares', 'Pre-offering shares outstanding', '10000000')}${num('primaryShares', 'New company shares (primary)', '2000000')}${num('secondaryShares', 'Selling-holder shares (secondary)', '1000000')}
    ${num('price', 'Price per share', '10')}${num('discountPct', 'Underwriting discount % (assumption)', '6')}${num('issuerExpenses', 'Company offering expenses', '1000000')}
    ${num('sellerExpenses', 'Selling-holder expenses', '0')}${num('optionPrimary', 'Option: additional company shares', '300000')}${num('optionSecondary', 'Option: additional selling-holder shares', '150000')}
    <label>Who bears selling-holder expenses?<select name="sellerExpensesBorneBy"><option value="sellers">Selling holders</option><option value="issuer" ${v('sellerExpensesBorneBy') === 'issuer' ? raw('selected') : ''}>Company</option></select></label>
    <label>Over-allotment option exercised in selected scenario?<select name="optionExercised"><option value="no">No</option><option value="yes" ${v('optionExercised') === 'yes' ? raw('selected') : ''}>Yes</option></select></label>
    <label>Currency<select name="currency"><option>USD</option><option ${v('currency') === 'CAD' ? raw('selected') : ''}>CAD</option></select></label>
    <div class="span-all form-actions"><button class="btn btn-gold" type="submit">Calculate</button>${p ? html`<button class="btn btn-outline" type="submit" formaction="/app/capital/proceeds.csv">Export CSV</button>` : ''}</div>
  </form>
  ${p ? html`
  <div class="table-wrap"><table class="tbl num">
    <thead><tr><th>${p.currency}</th><th>Base offering</th><th>With option exercised</th></tr></thead>
    <tbody>
      <tr><th>Company shares sold</th><td>${p.base.primaryShares.format(0)}</td><td>${p.withOption.primaryShares.format(0)}</td></tr>
      <tr><th>Selling-holder shares sold</th><td>${p.base.secondaryShares.format(0)}</td><td>${p.withOption.secondaryShares.format(0)}</td></tr>
      <tr><th>Company gross proceeds</th><td>${money(p.base.issuerGross)}</td><td>${money(p.withOption.issuerGross)}</td></tr>
      <tr><th>Underwriting discount on company shares</th><td>${money(p.base.issuerDiscount)}</td><td>${money(p.withOption.issuerDiscount)}</td></tr>
      <tr><th>Company expenses</th><td>${money(p.base.issuerExpenses)}</td><td>${money(p.withOption.issuerExpenses)}</td></tr>
      <tr class="em"><th>Company net proceeds</th><td>${money(p.base.issuerNet)}</td><td>${money(p.withOption.issuerNet)}</td></tr>
      <tr><th>Selling-holder gross (not company cash)</th><td>${money(p.base.sellerGross)}</td><td>${money(p.withOption.sellerGross)}</td></tr>
      <tr><th>Selling-holder net</th><td>${money(p.base.sellerNet)}</td><td>${money(p.withOption.sellerNet)}</td></tr>
      <tr><th>Total deal size</th><td>${money(p.base.totalDealSize)}</td><td>${money(p.withOption.totalDealSize)}</td></tr>
      <tr><th>Post-offering shares outstanding</th><td>${p.base.postShares.format(0)}</td><td>${p.withOption.postShares.format(0)}</td></tr>
      <tr><th>Retention for a holder who neither buys nor sells</th><td>${pct(p.base.nonParticipatingRetention.mul(100))}</td><td>${pct(p.withOption.nonParticipatingRetention.mul(100))}</td></tr>
    </tbody></table></div>
  ${p.warnings.map((w) => html`<p class="form-error">${w}</p>`)}
  <details><summary>Formulas and assumptions</summary><ul>${Object.entries(p.formulas).map(([k, f]) => html`<li><strong>${k}</strong>: ${f}</li>`)}${p.assumptions.map((a) => html`<li>${a}</li>`)}</ul><p class="fine">${p.modelVersion} · calculated ${p.calculatedAt}</p></details>` : ''}
</section>

<section class="card" id="banker"><h2>Ownership and voting</h2>
  <form method="post" action="/app/capital/ownership" class="stack">
    ${csrfField(ctx)}
    <p class="fine">One holder per line: name | class | shares | votes per share | shares sold in the offering</p>
    <textarea name="holders" rows="5">${v('holders', 'Founder A | Class B multiple voting | 6000000 | 10 | 0\nVenture Fund | Common | 3000000 | 1 | 1000000\nEmployees | Common | 1000000 | 1 | 0')}</textarea>
    <div class="two">${num('primaryShares2', 'New company shares', '2000000')}${num('newVotes', 'Votes per new share', '1')}</div>
    <div class="form-actions"><button class="btn btn-gold" type="submit">Simulate</button></div>
  </form>
  ${errors.holders ? html`<p class="form-error">${errors.holders}</p>` : ''}
  ${o ? html`<div class="table-wrap"><table class="tbl num"><thead><tr><th>Holder</th><th>Class</th><th>Pre shares</th><th>Pre economic</th><th>Pre voting</th><th>Post shares</th><th>Post economic</th><th>Post voting</th></tr></thead><tbody>
    ${o.table.map((x) => html`<tr><th>${x.name}</th><td>${x.cls}</td><td>${x.preShares.format(0)}</td><td>${pct(x.preEconomic)}</td><td>${pct(x.preVoting)}</td><td>${x.postShares.format(0)}</td><td>${pct(x.postEconomic)}</td><td>${pct(x.postVoting)}</td></tr>`)}
  </tbody></table></div><ul class="fine">${o.notes.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
</section>

<section class="card" id="ntbv"><h2>Net tangible book value dilution</h2>
  <form method="post" action="/app/capital/ntbv" class="form-grid">
    ${csrfField(ctx)}${num('preNtbv', 'Pre-offering NTBV', '15000000')}${num('ntbvPreShares', 'Pre-offering shares', '10000000')}${num('newShares', 'New company shares', '2000000')}${num('ntbvPrice', 'Offering price', '10')}${num('netProceeds', 'Company net proceeds', '17800000')}
    <div class="span-all form-actions"><button class="btn btn-gold" type="submit">Calculate</button></div>
  </form>
  ${n ? html`<dl class="kv"><dt>NTBV per share before</dt><dd>${n.preNtbvPs.format(4)}</dd><dt>NTBV per share after</dt><dd>${n.postNtbvPs.format(4)}</dd><dt>Increase to existing holders</dt><dd>${n.increaseToExisting.format(4)}</dd><dt>Dilution per share to new investors</dt><dd>${n.dilutionToNew.format(4)} (${pct(n.dilutionPct)})</dd></dl><ul class="fine">${n.notes.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
</section>

<section class="card" id="runway"><h2>Cash runway under IPO scenarios</h2>
  <form method="post" action="/app/capital/runway" class="form-grid">
    ${csrfField(ctx)}${num('cash', 'Current cash', '9000000')}${num('burn', 'Monthly operating burn', '650000')}${num('readinessFeesMonthly', 'Readiness professional fees / month', '120000')}
    ${num('monthsToIpo', 'Months to expected closing', '9')}${num('netProceeds2', 'Expected company net proceeds', '17800000')}${num('publicCoAnnualCost', 'Incremental public-company cost / year', '2500000')}
    ${num('delayMonths', 'Delay scenario: extra months', '6')}${num('downsizePct', 'Downsized: % of base proceeds', '60')}${num('abandonmentCosts', 'Costs if abandoned', '900000')}
    <div class="span-all form-actions"><button class="btn btn-gold" type="submit">Forecast</button>${r ? html`<button class="btn btn-outline" type="submit" formaction="/app/capital/runway.csv">Export CSV</button>` : ''}</div>
  </form>
  ${r ? html`<div class="table-wrap"><table class="tbl num"><thead><tr><th>Scenario</th><th>Closing month</th><th>Company proceeds</th><th>Cash after 36 months</th><th>Cash runs out</th></tr></thead><tbody>
    ${Object.entries(r.scenarios).map(([k, s]) => html`<tr><th>${k[0].toUpperCase() + k.slice(1)}</th><td>${s.proceeds ? s.closeMonth : '-'}</td><td>${s.proceeds ? money(s.proceeds) : 'None'}</td><td>${money(s.endCash)}</td><td class="${s.zeroMonth ? 'warn' : ''}">${s.zeroMonth ? `Month ${s.zeroMonth}` : 'Beyond 36 months'}</td></tr>`)}
  </tbody></table></div><ul class="fine">${r.notes.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
</section>
<p class="fine">Valuation workspace (comparables, precedents, DCF) and banker proposal comparison: planned for phase two. Record proposals today via an <a href="/app/records/new/rfp">Advisor RFP</a>.</p>`,
  });
}

// ---------- Data room ----------
export function dataroom({ ctx, nonce, project, docs, flash, maxMb = 15 }) {
  if (!project) return noProject(ctx, nonce, 'dataroom', 'Data Room');
  const folders = [...new Set(docs.map((d) => d.folder))];
  return shell({
    ctx, nonce, flash, active: 'dataroom', title: 'Data Room',
    body: html`
${pageHead('Data Room', 'Every file is encrypted with its own key, versioned immutably and access-logged. Watermarking and download controls reduce, but never eliminate, leakage risk.')}
${can(ctx, 'document.upload') ? html`<form class="card form-grid" id="upload-form" data-upload data-max-mb="${maxMb}" action="/app/dataroom/upload" method="post">
  ${csrfField(ctx)}
  <label>File (PDF, DOCX, XLSX, PPTX, PNG, JPG, CSV, TXT · max ${maxMb} MB)<input type="file" name="file" required></label>
  <label>Folder<input name="folder" value="General" maxlength="80" list="folders"><datalist id="folders">${['Corporate records', 'Financial statements', 'Material contracts', 'IP', 'Governance', 'Offering documents', 'Correspondence', ...folders].map((f) => html`<option value="${f}">`)}</datalist></label>
  <label>Classification<select name="classification">${Object.entries(CLASSIFICATIONS).filter(([k]) => canRead(ctx, k)).map(([k, v]) => html`<option value="${k}" ${k === 'confidential' ? raw('selected') : ''}>${v}</option>`)}</select></label>
  <div class="span-all form-actions"><button class="btn btn-gold" type="submit">Upload securely</button><span class="upload-status" aria-live="polite"></span></div>
</form>` : ''}
${folders.length ? folders.map((f) => html`<section class="card"><h2>${f}</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Classification</th><th>Review</th><th>Latest version</th><th>Screening</th><th>Hold</th></tr></thead><tbody>
  ${docs.filter((d) => d.folder === f).map((d) => html`<tr><td><a href="/app/dataroom/${d.id}">${d.name}</a></td><td>${classBadge(d.classification, CLASSIFICATIONS[d.classification])}</td><td>${d.review_status}</td><td>v${d.versions[0]?.version} · ${Math.ceil((d.versions[0]?.size || 0) / 1024)} KB</td><td>${d.versions[0]?.scan_status}</td><td>${d.legal_hold ? 'Legal hold' : '-'}</td></tr>`)}
</tbody></table></div></section>`) : html`<div class="empty"><h2>No documents yet</h2><p>Upload corporate records, financial statements and contracts. Uploads change evidence availability - not professional approval.</p></div>`}`,
  });
}

export function documentView({ ctx, nonce, doc, versions, log, flash, maxMb = 15 }) {
  return shell({
    ctx, nonce, flash, active: 'dataroom', title: doc.name,
    body: html`
${pageHead(doc.name, html`${doc.folder} · ${classBadge(doc.classification, CLASSIFICATIONS[doc.classification])} · ${doc.review_status}${doc.legal_hold ? html` · <strong>Legal hold</strong>` : ''}`)}
<div class="grid-2">
  <section class="card"><h2>Versions (immutable)</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Version</th><th>Uploaded</th><th>Size</th><th>SHA-256</th><th></th></tr></thead><tbody>
    ${versions.map((v) => html`<tr><td>v${v.version}</td><td>${fmtDate(v.at)}</td><td>${Math.ceil(v.size / 1024)} KB</td><td class="mono">${v.sha256.slice(0, 16)}…</td><td>${can(ctx, 'document.download') ? html`<a href="/app/dataroom/${doc.id}/download?v=${v.version}">Download</a>` : html`<span class="muted">View only</span>`}</td></tr>`)}
  </tbody></table></div>
  ${can(ctx, 'document.upload') ? html`<form class="stack" data-upload data-max-mb="${maxMb}" action="/app/dataroom/upload" method="post">${csrfField(ctx)}<input type="hidden" name="documentId" value="${doc.id}"><input type="hidden" name="classification" value="${doc.classification}"><input type="hidden" name="folder" value="${doc.folder}"><label>Upload new version<input type="file" name="file" required></label><button class="btn btn-outline btn-sm" type="submit">Upload version</button><span class="upload-status" aria-live="polite"></span></form>` : ''}
  </section>
  <section class="stack-gap">
    <form class="card stack" method="post" action="/app/dataroom/${doc.id}/manage">${csrfField(ctx)}<h2>Controls</h2>
      ${can(ctx, 'record.review') ? html`<label>Review status<select name="review"><option ${doc.review_status === 'Unreviewed' ? raw('selected') : ''}>Unreviewed</option><option ${doc.review_status === 'Reviewed' ? raw('selected') : ''}>Reviewed</option><option ${doc.review_status === 'Approved for specified use' ? raw('selected') : ''}>Approved for specified use</option></select></label><button class="btn btn-outline btn-sm" name="action" value="review">Save review status</button>` : ''}
      ${can(ctx, 'document.hold') ? html`<button class="btn btn-outline btn-sm" name="action" value="${doc.legal_hold ? 'unhold' : 'hold'}">${doc.legal_hold ? 'Release legal hold' : 'Place legal hold'}</button>` : ''}
      ${can(ctx, 'document.delete') ? html`<button class="btn btn-ghost btn-sm" name="action" value="delete" data-confirm="Delete this document? Versions remain in the immutable archive.">Delete</button>` : ''}
      <p class="fine">Access labels and restrictions do not by themselves establish legal privilege.</p>
    </form>
    <div class="card"><h2>Access log</h2><ul class="timeline">${log.map((l) => html`<li><span class="meta">${fmtDate(l.at)} ${String(l.at).slice(11, 16)}</span> ${l.action} v${l.version || ''}</li>`)}</ul></div>
  </section>
</div>`,
  });
}

// ---------- Advisors & resources ----------
export function advisors({ ctx, nonce, q = '', category = '' }) {
  const cats = [...new Set(ADVISORS.map((a) => a.category))];
  const list = ADVISORS.filter((a) => (!category || a.category === category) && (!q || `${a.name} ${a.category} ${a.geo}`.toLowerCase().includes(q.toLowerCase())));
  return shell({
    ctx, nonce, active: 'advisors', title: 'Advisors & Resources',
    body: html`
${pageHead('Advisors & Resources', 'Starting points for evaluation, not recommendations or promised introductions. Nothing is sent and no company information is disclosed until an authorized user approves the recipient and content.')}
<form class="filters" method="get"><label>Search<input name="q" value="${q}" maxlength="80"></label><label>Category<select name="category" data-autosubmit><option value="">All</option>${cats.map((c) => html`<option ${c === category ? raw('selected') : ''}>${c}</option>`)}</select></label><button class="btn btn-outline btn-sm">Filter</button></form>
<section class="card"><p class="fine">Verification labels, in order: ${ADVISOR_LABELS.join(' → ')}. A website confirming a practice is not proof of licensing, capacity or fit.</p>
<div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Category</th><th>Coverage</th><th>Label</th><th>How to verify</th><th>Sources</th></tr></thead><tbody>
${list.map((a) => html`<tr><td>${a.name}</td><td>${a.category}</td><td>${a.geo}</td><td><span class="label-src">${a.label}</span></td><td>${a.verify}</td><td>${a.src.length ? a.src.map((s) => srcLink(s, SOURCES)) : html`<span class="muted">Source pending</span>`}</td></tr>`)}
</tbody></table></div>
<p><a class="btn btn-gold btn-sm" href="/app/records/new/rfp">Draft an advisor RFP</a></p></section>
<section class="card"><h2>Canadian securities regulators (13 jurisdictions)</h2><p class="fine">The CSA coordinates its members; it is not a single federal approval authority. Confirm current names and contacts in the official CSA directory ${srcLink('R41', SOURCES)} before relying on them.</p>
<div class="juris">${CSA_JURISDICTIONS.map(([j, r]) => html`<div><strong>${j}</strong><span>${r}</span></div>`)}</div></section>
<section class="card"><h2>Resource centre</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Resource</th><th>Who uses it</th><th>When</th><th>Prepare</th><th>Produces</th><th>Source</th></tr></thead><tbody>
${RESOURCES.map((r) => html`<tr><td>${r.title}</td><td>${r.who}</td><td>${r.when}</td><td>${r.prepare}</td><td>${r.produces}</td><td>${srcLink(r.src, SOURCES)}</td></tr>`)}</tbody></table></div></section>
<section class="card"><h2>Coverage</h2><p><strong>Supported in pilot:</strong> ${COVERAGE.supported.join('; ')}.</p><p><strong>Partial:</strong> ${COVERAGE.partial.join('; ')}.</p><p><strong>Not covered:</strong> ${COVERAGE.notCovered.join('; ')}.</p>
<h3 class="h-sm">Sector modules</h3><ul class="mini">${Object.values(INDUSTRIES).map(([n, d]) => html`<li><strong>${n}:</strong> ${d}</li>`)}</ul></section>`,
  });
}

// ---------- Learning centre ----------
export function learn({ ctx, nonce, answers = {} }) {
  return shell({
    ctx, nonce, active: 'learn', title: 'Learning Centre',
    body: html`
${pageHead('Learning Centre', 'Each unit has a plain-language explanation, a worked example, a quick check and an action that advances your own project. Completion shows learning activity - not a professional qualification.')}
${LEARNING.map((u) => html`<section class="card unit" id="u${u.n}"><h2>${u.n}. ${u.title}</h2><p>${u.text}</p><p class="example"><strong>Example:</strong> ${u.example} <span class="tag-illus">Illustrative</span></p>
<form method="post" action="/app/learn#u${u.n}" class="check-form">${csrfField(ctx)}<input type="hidden" name="unit" value="${u.n}"><fieldset><legend>${u.check.q}</legend>${u.check.a.map((a, i) => html`<label class="check"><input type="radio" name="answer" value="${i}" required> ${a}</label>`)}</fieldset><button class="btn btn-outline btn-sm">Check</button>
${answers[u.n] !== undefined ? html`<p class="${answers[u.n] ? 'form-ok' : 'form-error'}">${answers[u.n] ? 'Correct.' : 'Not quite - re-read the explanation above.'}</p>` : ''}</form>
<a class="link-arrow" href="${u.action[1]}">${u.action[0]}</a></section>`)}
<section class="card" id="cases"><h2>Case library</h2><p class="fine">Documented observations are separated from the product team's lesson. Lessons are design inferences, not proof of causation or predictions of returns. Industrial, resource and financial-services cases have not yet been added - coverage is incomplete.</p>
<div class="table-wrap"><table class="tbl"><thead><tr><th>Case</th><th>Documented observation</th><th>Product lesson (interpretation)</th><th>Tool</th><th>Sources</th></tr></thead><tbody>
${CASES.map((c) => html`<tr><td>${c.name}</td><td>${c.obs}</td><td>${c.lesson}</td><td>${c.tool}</td><td>${c.src.map((s) => srcLink(s, SOURCES))}</td></tr>`)}</tbody></table></div></section>
<section class="card" id="glossary"><h2>Glossary</h2><dl class="glossary">${GLOSSARY.map(([t, d]) => html`<dt>${t}</dt><dd>${d}</dd>`)}</dl></section>`,
  });
}

// ---------- Guide ----------
export function guide({ ctx, nonce, aiEnabled, prefill = '' }) {
  return shell({
    ctx, nonce, active: 'guide', title: 'A.I. guide',
    body: html`
${pageHead('A.I. guide', aiEnabled ? 'Answers use only workspace information you are cleared to see and registered sources. Drafts for professional review - never legal, tax or audit conclusions.' : 'No A.I. provider is configured, so the guide runs in rule-based mode: glossary definitions and your next unblocked task.')}
<form class="card stack" id="guide-form" data-guide action="/app/guide" method="post">
  ${csrfField(ctx)}
  <label>Your question<textarea name="question" rows="3" maxlength="2000" required placeholder="e.g. What should we do next, and what should we ask our auditor?">${prefill}</textarea></label>
  <div class="form-actions"><button class="btn btn-gold" type="submit">Ask</button><span class="upload-status" aria-live="polite"></span></div>
</form>
<section class="card answer" id="guide-answer" hidden aria-live="polite"></section>
<p class="fine">The A.I. guide is an artificial-intelligence system. It does not represent itself as a licensed professional. Interactions are logged with the model version for review.</p>`,
  });
}

// ---------- Public company ----------
export function publicCompany({ ctx, nonce, project, records, hidden }) {
  if (!project) return noProject(ctx, nonce, 'public', 'Public Company Operations');
  const extra = html`<section class="card"><h2>Reporting route differences</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Reporting route</th><th>Documents and processes to assess</th></tr></thead><tbody>
    <tr><td>US domestic reporting company</td><td>Forms 10-K, 10-Q, 8-K; proxy; ownership and insider reports; certifications; exchange notices</td></tr>
    <tr><td>US FPI (foreign regime)</td><td>Form 20-F and 6-K; home-country and exchange requirements; current HFIA director and officer reporting analysis</td></tr>
    <tr><td>Eligible Canadian MJDS issuer</td><td>Form 40-F and 6-K where applicable; underlying Canadian filings; continuing MJDS and FPI eligibility</td></tr>
    <tr><td>Canadian reporting issuer</td><td>Annual and interim statements and MD&A; NI 52-109 certifications; material change reports; AIF where required; circular; insider reporting and early warning</td></tr>
  </tbody></table></div><p class="fine">Route checklists, not a determination that each document is due for every company.</p>
  ${project.status === 'closed' ? html`<p><strong>IPO project closed ${fmtDate(project.closed_at)}.</strong> Recurring obligations remain active.</p>` : can(ctx, 'project.close') ? html`<form method="post" action="/app/project/close">${csrfField(ctx)}<button class="btn btn-outline btn-sm" data-confirm="Mark the IPO transaction project complete? Recurring public-company obligations will be activated and cannot be removed.">Mark IPO transaction complete</button></form>` : ''}</section>`;
  return registerPage({ ctx, nonce, project, active: 'public', title: 'Public Company Operations', intro: 'Stage 10 recurs indefinitely. Due dates appear only after the issuer classification and applicable exceptions are reviewed; unverified rules stay provisional.', forms: ['obligation'], records, hidden, extra });
}

// ---------- Settings ----------
export function settings({ ctx, nonce, members, auditEvents, mfaSetup, recoveryCodes, flash, error, invites }) {
  return shell({
    ctx, nonce, flash, active: 'settings', title: 'Settings',
    body: html`
${pageHead('Settings', `${ctx.orgName} · signed in as ${ctx.profile.email}`)}
${error ? html`<div class="form-error" role="alert">${error}</div>` : ''}
<section class="card" id="mfa"><h2>Multi-factor authentication</h2>
  ${recoveryCodes ? html`<div class="notice"><p><strong>Save these recovery codes now.</strong> Each works once. They will not be shown again.</p><pre class="codes">${recoveryCodes.join('\n')}</pre></div>` : ''}
  ${ctx.profile.mfa ? html`<p>MFA is <strong>on</strong>. You will be asked for a code from your authenticator app at sign-in.</p>
    <form method="post" action="/app/settings/mfa/disable" class="inline-form">${csrfField(ctx)}<label>Current password<input type="password" name="password" required autocomplete="current-password"></label><label>Code<input name="code" required inputmode="numeric" autocomplete="one-time-code"></label><button class="btn btn-ghost btn-sm">Turn off MFA</button></form>`
    : mfaSetup ? html`<ol><li>Open an authenticator app (e.g. 1Password, Google Authenticator, Microsoft Authenticator).</li><li>Add an account using this setup key: <code class="mono key">${mfaSetup.secret.replace(/(.{4})/g, '$1 ').trim()}</code><br><span class="fine">Or open: <a href="${mfaSetup.uri}">${'otpauth link'}</a></span></li><li>Enter the 6-digit code to confirm.</li></ol>
      <form method="post" action="/app/settings/mfa/confirm" class="inline-form">${csrfField(ctx)}<label>Code<input name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label><button class="btn btn-gold btn-sm">Confirm and turn on</button></form>`
    : html`<p>MFA is <strong>off</strong>. It is required to view restricted personal information, MNPI and privileged material.</p><form method="post" action="/app/settings/mfa/start">${csrfField(ctx)}<button class="btn btn-gold btn-sm">Set up MFA</button></form>`}
</section>
<section class="card"><h2>Password</h2>
  <form method="post" action="/app/settings/password" class="form-grid">${csrfField(ctx)}
    <label>Current password<input type="password" name="current" required autocomplete="current-password"></label>
    <label>New password<input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
    <label>Confirm new password<input type="password" name="confirm" required autocomplete="new-password"></label>
    <div class="span-all form-actions"><button class="btn btn-outline btn-sm">Change password</button><span class="fine">Other sessions are signed out.</span></div>
  </form>
</section>
<section class="card"><h2>Team and roles</h2>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>MFA</th></tr></thead><tbody>${members.map((m) => html`<tr><td>${m.name}</td><td>${m.email}</td><td>${ROLES[m.role]}</td><td>${m.mfa ? 'On' : 'Off'}</td></tr>`)}</tbody></table></div>
  ${can(ctx, 'members.manage') && !ctx.isDemo ? html`<form method="post" action="/app/settings/invite" class="form-grid">${csrfField(ctx)}
    <label>Invite by email<input type="email" name="email" required maxlength="254"></label>
    <label>Role<select name="role">${Object.entries(ROLES).map(([k, v]) => html`<option value="${k}" ${k === 'guest' ? raw('selected') : ''}>${v}</option>`)}</select></label>
    <div class="span-all form-actions"><button class="btn btn-outline btn-sm">Send invitation</button><span class="fine">Invitations expire in 7 days. The platform never sends invitations without your action.</span></div></form>
    ${invites?.length ? html`<h3 class="h-sm">Pending invitations</h3><ul class="mini">${invites.map((i) => html`<li>${i.email} - ${ROLES[i.role]} · expires ${fmtDate(i.expires_at)}</li>`)}</ul>` : ''}` : ''}
</section>
${auditEvents ? html`<section class="card"><h2>Audit log</h2><p class="fine">Hash-chained and append-only. IP addresses are pseudonymised.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Time (UTC)</th><th>Action</th><th>Target</th><th>Integrity</th></tr></thead><tbody>
${auditEvents.map((e) => html`<tr><td>${String(e.at).replace('T', ' ').slice(0, 19)}</td><td>${e.action}</td><td class="mono">${(e.target || '').slice(0, 8)}</td><td class="mono">${e.hash.slice(0, 10)}…</td></tr>`)}</tbody></table></div></section>` : ''}`,
  });
}

export function errorPage({ ctx, nonce, status, message }) {
  const body = html`<div class="empty"><p class="eyebrow">Error ${status}</p><h1>${message}</h1><p><a class="btn btn-gold" href="${ctx ? '/app' : '/'}">Go back</a></p></div>`;
  return ctx ? shell({ ctx, nonce, active: '', title: 'Error', body }) : null;
}

export { D };
