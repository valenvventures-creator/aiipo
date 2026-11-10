// Authenticated workspace routes. await buildCtx() resolves the user, organization, role and project from
// the server-side session only; ids in URLs are always re-checked against ctx.orgId by the services.
import { db } from '../db.js';
import { str, HttpError, rateLimit } from '../http.js';
import { getUser, userProfile, membershipsFor, getOrg, orgName, beginMfaEnrollment, confirmMfaEnrollment, verifyMfa, disableMfa, passwordProblems, setPassword, destroyUserSessions, validateEmail } from '../security/auth.js';
import { verifyPassword } from '../security/crypto.js';
import { can, canRead, canReview, requirePerm, ROLES, Forbidden } from '../security/permissions.js';
import { audit, listAudit } from '../security/audit.js';
import { otpauthUri } from '../security/totp.js';
import { sendMail } from '../mail.js';
import { config } from '../config.js';
import * as S from '../services.js';
import * as V from '../views/app.js';
import { cleanSection, SECTIONS } from '../domain/onboarding.js';
import { STAGES, stageBySlug } from '../domain/stages.js';
import { FORMS } from '../domain/forms.js';
import { offeringProceeds, ownership, ntbvDilution, runway, toCsv } from '../domain/finance.js';
import { LEARNING } from '../domain/content.js';
import { askGuide } from '../ai.js';
import { createInvitation, pendingInvites } from './auth.js';


export async function buildCtx(req) {
  const s = req.session;
  if (!s || s.stage !== 'full') return null;
  const user = await getUser(s.user_id);
  if (!user) return null;
  const mems = await membershipsFor(user.id);
  if (!mems.length) return null;
  const m = mems.find((x) => x.org_id === s.org_id) || mems[0];
  const org = await getOrg(m.org_id);
  const ctx = {
    userId: user.id, orgId: org.id, role: m.role, orgName: orgName(org), isDemo: Boolean(org.is_demo),
    mfaSatisfied: Boolean(user.mfa_enabled) || Boolean(org.is_demo),
    profile: userProfile(user), csrf: s.csrf, sessionId: s.id, requireMfa: Boolean(org.require_mfa),
  };
  ctx.projects = await S.listProjects(ctx);
  ctx.project = ctx.projects.find((p) => p.id === s.project_id) || ctx.projects[0] || null;
  return ctx;
}

const flashOf = (req) => {
  const m = req.query.get('ok');
  const msgs = { saved: 'Saved.', submitted: 'Submitted for review.', held: 'Held for counsel review - nothing has been published or sent.', uploaded: 'Uploaded and encrypted.', reviewed: 'Decision recorded.', mfa: 'Multi-factor authentication is on.', pw: 'Password changed. Other sessions were signed out.', invited: 'Invitation sent.', closed: 'IPO project marked complete. Recurring obligations are active.' };
  return msgs[m] ? { type: 'ok', text: msgs[m] } : null;
};

export function register(r) {
  const page = (path, handler, method = 'get') => r[method](path, async (req, res) => {
    const ctx = await buildCtx(req);
    if (!ctx) return { redirect: '/login?m=expired' };
    if (ctx.requireMfa && !ctx.profile.mfa && !path.startsWith('/app/settings')) return { redirect: '/app/settings#mfa' };
    return handler(req, ctx, res);
  });

  page('/app', async (req, ctx) => {
    if (!ctx.project) return { redirect: '/app/onboarding' };
    return { html: V.dashboard({ ctx, nonce: req.nonce, project: ctx.project, plan: await S.plan(ctx, ctx.project), flash: flashOf(req) }) };
  });

  page('/app/switch-project', async (req, ctx) => {
    const id = str(req.body.projectId, 64);
    await S.getProject(ctx, id);
    await db.run('UPDATE sessions SET project_id = ? WHERE id = ?', id, ctx.sessionId);
    return { redirect: '/app' };
  }, 'post');

  // ----- Onboarding -----
  page('/app/onboarding', async (req, ctx) => ({ html: V.onboarding({ ctx, nonce: req.nonce, project: ctx.project, sectionKey: ctx.project ? req.query.get('section') : 'identity' }) }));
  page('/app/onboarding', async (req, ctx) => {
    const key = str(req.body.section, 30);
    const res = cleanSection(key, req.body);
    if (!res) throw new HttpError(400, 'Unknown section.');
    if (res.section.restricted && !canRead(ctx, 'restricted_pii')) throw new Forbidden('Ownership details require MFA and a cleared role.');
    if (Object.keys(res.errors).length) return { status: 400, html: V.onboarding({ ctx, nonce: req.nonce, project: ctx.project, sectionKey: key, errors: res.errors, values: { ...(ctx.project?.profile || {}), ...res.data } }) };
    if (!ctx.project) {
      requirePerm(ctx, 'project.edit');
      const name = str(req.body.projectName, 120) || 'IPO project';
      const id = await S.createProject(ctx, name, res.data);
      await db.run('UPDATE sessions SET project_id = ? WHERE id = ?', id, ctx.sessionId);
      return { redirect: '/app/onboarding?section=objectives' };
    }
    await S.saveProfile(ctx, ctx.project.id, res.data);
    const next = SECTIONS.find((s) => s.key === str(req.body.next, 30));
    return { redirect: next ? `/app/onboarding?section=${next.key}` : '/app?ok=saved' };
  }, 'post');

  // ----- Roadmap -----
  page('/app/roadmap', async (req, ctx) => {
    if (!ctx.project) return { html: V.roadmap({ ctx, nonce: req.nonce }) };
    const tasks = await S.listTasks(ctx, ctx.project.id);
    const gates = Object.fromEntries(STAGES.map((s) => [s.n, S.stageGate(tasks, s.n)]));
    return { html: V.roadmap({ ctx, nonce: req.nonce, project: ctx.project, tasks, gates }) };
  });
  page('/app/roadmap/:slug', async (req, ctx) => {
    const stage = stageBySlug(req.params.slug);
    if (!stage) throw new HttpError(404, 'Stage not found.');
    return { html: V.stageDetail({ ctx, nonce: req.nonce, stage, tasks: ctx.project ? await S.listTasks(ctx, ctx.project.id) : [] }) };
  });

  // ----- Tasks -----
  page('/app/tasks', async (req, ctx) => {
    if (!ctx.project) return { html: V.tasksPage({ ctx, nonce: req.nonce }) };
    return { html: V.tasksPage({ ctx, nonce: req.nonce, project: ctx.project, tasks: await S.listTasks(ctx, ctx.project.id), members: await S.members(ctx), filter: { status: req.query.get('status') || '', key: req.query.get('key') || '' } }) };
  });
  const taskView = async (req, ctx, task, error) => {
    const tasks = await S.listTasks(ctx, task.project_id);
    return { status: error ? 409 : 200, html: V.taskDetail({ ctx, nonce: req.nonce, task, tpl: S.taskTemplate(task.key), events: await S.taskEvents(ctx, task.id), docs: await S.listDocuments(ctx, task.project_id), blocking: S.blockers(tasks, task), members: await S.members(ctx), error }) };
  };
  page('/app/tasks/:id', async (req, ctx) => await taskView(req, ctx, await S.getTask(ctx, req.params.id)));
  page('/app/tasks/:id/status', async (req, ctx) => {
    try { await S.updateTaskStatus(ctx, req.params.id, str(req.body.status, 40), str(req.body.note, 2000)); } catch (e) {
      if (e.status === 409 || e.status === 400 || e.status === 403) return await taskView(req, ctx, await S.getTask(ctx, req.params.id), e.message);
      throw e;
    }
    return { redirect: `/app/tasks/${req.params.id}` };
  }, 'post');
  page('/app/tasks/:id/assign', async (req, ctx) => { await S.assignTask(ctx, req.params.id, str(req.body.assignee, 64), str(req.body.due, 10)); return { redirect: `/app/tasks/${req.params.id}` }; }, 'post');
  page('/app/tasks/:id/evidence', async (req, ctx) => { await S.linkEvidence(ctx, req.params.id, str(req.body.documentId, 64)); return { redirect: `/app/tasks/${req.params.id}` }; }, 'post');

  // ----- Registers -----
  const reg = (path, active, title, intro, forms) => page(path, async (req, ctx) => {
    if (!ctx.project) return { html: V.registerPage({ ctx, nonce: req.nonce, active, title }) };
    const records = (await S.listRecords(ctx, ctx.project.id)).filter((x) => forms.includes(x.form));
    const hidden = Object.fromEntries(await Promise.all(forms.map(async (f) => [f, await S.countHiddenRecords(ctx, ctx.project.id, f)])));
    return { html: V.registerPage({ ctx, nonce: req.nonce, project: ctx.project, active, title, intro, forms, records, hidden }) };
  });
  reg('/app/finance', 'finance', 'Financial Readiness', 'Financial periods, audit status and freshness. The CFO prepares management records; the independent auditor\'s work is kept separate. Software acceptance is not an audit opinion.', ['period', 'issue']);
  reg('/app/legal', 'legal', 'Legal & Governance', 'Capitalization, readiness issues and diligence. The A.I. never decides legal materiality or closes a material issue.', ['issue', 'capevent', 'diligence', 'rfp']);
  reg('/app/disclosure', 'disclosure', 'Disclosure Workspace', 'A verified claims ledger: when a claim changes, every dependent approval reopens and the old version is kept.', ['claim', 'comment', 'uop']);
  reg('/app/communications', 'communications', 'Communications & IR', 'Every communication is classified in context. Retail or paid promotion during the offering process is held for counsel automatically.', ['communication']);
  page('/app/public-company', async (req, ctx) => {
    if (!ctx.project) return { html: V.publicCompany({ ctx, nonce: req.nonce }) };
    return { html: V.publicCompany({ ctx, nonce: req.nonce, project: ctx.project, records: await S.listRecords(ctx, ctx.project.id, 'obligation'), hidden: { obligation: await S.countHiddenRecords(ctx, ctx.project.id, 'obligation') } }) };
  });
  page('/app/project/close', async (req, ctx) => { await S.closeProject(ctx, ctx.project.id); return { redirect: '/app/public-company?ok=closed' }; }, 'post');

  // ----- Records -----
  page('/app/records/new/:form', async (req, ctx) => {
    if (!FORMS[req.params.form]) throw new HttpError(404, 'Unknown form.');
    if (!ctx.project) return { redirect: '/app/onboarding' };
    requirePerm(ctx, 'record.create');
    return { html: V.recordForm({ ctx, nonce: req.nonce, form: req.params.form, taskId: req.query.get('task') }) };
  });
  const saveRec = async (req, ctx, form, id) => {
    const submit = req.body.intent === 'submit';
    const out = await S.saveRecord(ctx, ctx.project.id, form, req.body, { id, submit, classification: str(req.body.classification, 30) });
    if (out.errors) return { status: 400, html: V.recordForm({ ctx, nonce: req.nonce, form, record: id ? await S.getRecord(ctx, id) : null, errors: out.errors, values: out.data }) };
    return { redirect: `/app/records/${out.id}?ok=${out.status === 'Held for counsel review' ? 'held' : submit ? 'submitted' : 'saved'}` };
  };
  page('/app/records/new/:form', async (req, ctx) => {
    if (!FORMS[req.params.form]) throw new HttpError(404, 'Unknown form.');
    return await saveRec(req, ctx, req.params.form, null);
  }, 'post');
  page('/app/records/:id', async (req, ctx) => {
    const record = await S.getRecord(ctx, req.params.id);
    return { html: V.recordView({ ctx, nonce: req.nonce, record, history: await S.recordHistory(ctx, record.id), canReviewIt: canReview(ctx, FORMS[record.form].reviewer), flash: flashOf(req) }) };
  });
  page('/app/records/:id/edit', async (req, ctx) => {
    requirePerm(ctx, 'record.create');
    const record = await S.getRecord(ctx, req.params.id);
    return { html: V.recordForm({ ctx, nonce: req.nonce, form: record.form, record }) };
  });
  page('/app/records/:id', async (req, ctx) => {
    const record = await S.getRecord(ctx, req.params.id);
    return await saveRec(req, ctx, record.form, record.id);
  }, 'post');
  page('/app/records/:id/review', async (req, ctx) => {
    try { await S.reviewRecord(ctx, req.params.id, str(req.body.decision, 20), str(req.body.note, 2000)); } catch (e) {
      if ([400, 403, 409].includes(e.status)) {
        const record = await S.getRecord(ctx, req.params.id);
        return { status: e.status, html: V.recordView({ ctx, nonce: req.nonce, record, history: await S.recordHistory(ctx, record.id), canReviewIt: canReview(ctx, FORMS[record.form].reviewer), error: e.message }) };
      }
      throw e;
    }
    return { redirect: `/app/records/${req.params.id}?ok=reviewed` };
  }, 'post');

  // ----- Capital -----
  page('/app/capital', async (req, ctx) => ({ html: V.capital({ ctx, nonce: req.nonce, project: ctx.project }) }));
  const calc = (fn, map) => async (req, ctx) => {
    try {
      const results = fn(req.body);
      return { html: V.capital({ ctx, nonce: req.nonce, project: ctx.project, inputs: req.body, results }) };
    } catch (e) {
      if (e.fields) return { status: 400, html: V.capital({ ctx, nonce: req.nonce, project: ctx.project, inputs: req.body, errors: map ? Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [map[k] || k, v])) : e.fields }) };
      if (e instanceof RangeError) return { status: 400, html: V.capital({ ctx, nonce: req.nonce, project: ctx.project, inputs: req.body, errors: { holders: e.message } }) };
      throw e;
    }
  };
  page('/app/capital/proceeds', calc((b) => ({ proceeds: offeringProceeds(b) })), 'post');
  page('/app/capital/ownership', calc((b) => ({
    ownership: ownership({
      holders: String(b.holders || '').split('\n').slice(0, 50).map((l) => { const [name, cls, shares, votesPerShare, sold] = l.split('|').map((x) => x?.trim()); return { name, cls, shares: shares || '0', votesPerShare: votesPerShare || '1', sold: sold || '0' }; }).filter((h) => h.name),
      primaryShares: b.primaryShares2 || '0', newInvestorVotesPerShare: b.newVotes || '1',
    }),
  })), 'post');
  page('/app/capital/ntbv', calc((b) => ({ ntbv: ntbvDilution({ preNtbv: b.preNtbv, preShares: b.ntbvPreShares, newShares: b.newShares, price: b.ntbvPrice, netProceeds: b.netProceeds }) }), { preShares: 'ntbvPreShares', price: 'ntbvPrice' }), 'post');
  page('/app/capital/runway', calc((b) => ({ runway: runway({ ...b, netProceeds: b.netProceeds2 }) }), { netProceeds: 'netProceeds2' }), 'post');
  page('/app/capital/proceeds.csv', async (req, ctx) => {
    requirePerm(ctx, 'finance.export');
    const p = offeringProceeds(req.body);
    const rows = [['Thought Authorities A.I. IPO - Offering proceeds'], ['Model', p.modelVersion], ['Calculated at', p.calculatedAt], ['Currency', p.currency], [],
      ['Inputs'], ...Object.entries(p.inputs).map(([k, v]) => [k, v ?? '']), [], ['Metric', 'Base offering', 'With option exercised'],
      ...Object.keys(p.base).map((k) => [k, p.base[k], p.withOption[k]]), [], ['Formulas'], ...Object.entries(p.formulas), [], ['Assumptions'], ...p.assumptions.map((a) => [a])];
    await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'finance.export', detail: { model: 'proceeds' } });
    return { csv: toCsv(rows), filename: 'offering-proceeds.csv' };
  }, 'post');
  page('/app/capital/runway.csv', async (req, ctx) => {
    requirePerm(ctx, 'finance.export');
    const r = runway({ ...req.body, netProceeds: req.body.netProceeds2 });
    const names = Object.keys(r.scenarios);
    const rows = [['Thought Authorities A.I. IPO - Cash runway'], ['Model', r.modelVersion], [], ['Month', ...names], ...Array.from({ length: r.horizon }, (_, i) => [i + 1, ...names.map((n) => r.scenarios[n].series[i].cash.toString(2))]), [], ['Notes'], ...r.notes.map((n) => [n])];
    await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'finance.export', detail: { model: 'runway' } });
    return { csv: toCsv(rows), filename: 'cash-runway.csv' };
  }, 'post');

  // ----- Data room -----
  page('/app/dataroom', async (req, ctx) => ({ html: V.dataroom({ ctx, nonce: req.nonce, project: ctx.project, docs: ctx.project ? await S.listDocuments(ctx, ctx.project.id) : [], flash: flashOf(req), maxMb: config.uploads.maxBytes / 1048576 }) }));
  page('/app/dataroom/upload', async (req, ctx) => {
    if (!(await rateLimit(`upload:${ctx.userId}`, 60, 60 * 60e3)).ok) throw new HttpError(429, 'Upload limit reached. Try again later.');
    const out = await S.uploadDocument(ctx, ctx.project.id, { name: str(req.body.name, 200), folder: str(req.body.folder, 80), classification: str(req.body.classification, 30), contentBase64: req.body.content, documentId: str(req.body.documentId, 64) || null });
    return { json: { ok: true, id: out.id, version: out.version, scanStatus: out.scanStatus } };
  }, 'post');
  page('/app/dataroom/:id', async (req, ctx) => {
    const doc = await S.getDocument(ctx, req.params.id);
    const versions = await db.all('SELECT version, size, mime, sha256, scan_status, at FROM document_versions WHERE document_id = ? AND org_id = ? ORDER BY version DESC', doc.id, ctx.orgId);
    return { html: V.documentView({ ctx, nonce: req.nonce, doc, versions, log: await S.accessLog(ctx, doc.id), flash: flashOf(req), maxMb: config.uploads.maxBytes / 1048576 }) };
  });
  page('/app/dataroom/:id/download', async (req, ctx) => {
    const { buf, name, mime } = await S.downloadDocument(ctx, req.params.id, req.query.get('v'));
    return { file: buf, filename: name, mime };
  });
  page('/app/dataroom/:id/manage', async (req, ctx) => {
    const action = str(req.body.action, 20);
    if (action === 'hold' || action === 'unhold') await S.setLegalHold(ctx, req.params.id, action === 'hold');
    else if (action === 'delete') { await S.deleteDocument(ctx, req.params.id); return { redirect: '/app/dataroom' }; } else if (action === 'review') await S.setDocumentReview(ctx, req.params.id, str(req.body.review, 40));
    return { redirect: `/app/dataroom/${req.params.id}?ok=saved` };
  }, 'post');

  // ----- Advisors, learning, guide -----
  page('/app/advisors', async (req, ctx) => ({ html: V.advisors({ ctx, nonce: req.nonce, q: str(req.query.get('q'), 80), category: str(req.query.get('category'), 80) }) }));
  page('/app/learn', async (req, ctx) => ({ html: V.learn({ ctx, nonce: req.nonce }) }));
  page('/app/learn', async (req, ctx) => {
    const unit = LEARNING.find((u) => u.n === Number(req.body.unit));
    return { html: V.learn({ ctx, nonce: req.nonce, answers: unit ? { [unit.n]: Number(req.body.answer) === unit.check.correct } : {} }) };
  }, 'post');
  page('/app/guide', async (req, ctx) => {
    const key = str(req.query.get('task'), 40);
    const prefill = key ? `Help me with the task "${S.taskTemplate(key)?.title || key}": what information do I need, and what should I ask the reviewer?` : '';
    return { html: V.guide({ ctx, nonce: req.nonce, aiEnabled: config.ai.enabled, prefill }) };
  });
  page('/app/guide', async (req, ctx) => {
    requirePerm(ctx, 'ai.use');
    if (!ctx.project) return { json: { error: 'Create a project first.' }, status: 400 };
    if (!(await rateLimit(`ai:${ctx.userId}`, 30, 60 * 60e3)).ok) return { json: { error: 'Hourly question limit reached.' }, status: 429 };
    const question = str(req.body.question, 2000);
    if (!question) return { json: { error: 'Ask a question.' }, status: 400 };
    const answer = await askGuide(ctx, ctx.project, question);
    const task = answer.taskKey ? (await S.listTasks(ctx, ctx.project.id)).find((t) => t.key === answer.taskKey) : null;
    return { json: { ...answer, taskUrl: task ? `/app/tasks/${task.id}` : null } };
  }, 'post');

  // ----- Settings -----
  const settingsView = async (req, ctx, extra = {}) => ({
    status: extra.error ? 400 : 200,
    html: V.settings({ ctx, nonce: req.nonce, members: await S.members(ctx), auditEvents: can(ctx, 'audit.view') ? await listAudit(ctx.orgId, 100) : null, invites: can(ctx, 'members.manage') ? await pendingInvites(ctx) : [], flash: flashOf(req), ...extra }),
  });
  page('/app/settings', async (req, ctx) => await settingsView(req, ctx));
  page('/app/settings/mfa/start', async (req, ctx) => {
    if (ctx.isDemo) return await settingsView(req, ctx, { error: 'MFA cannot be configured on demo accounts.' });
    const secret = await beginMfaEnrollment(ctx.userId);
    return await settingsView(req, ctx, { mfaSetup: { secret, uri: otpauthUri(secret, ctx.profile.email) } });
  }, 'post');
  page('/app/settings/mfa/confirm', async (req, ctx) => {
    if (!(await rateLimit(`mfa-enroll:${ctx.userId}`, 10, 15 * 60e3)).ok) return await settingsView(req, ctx, { error: 'Too many attempts. Start again later.' });
    const codes = await confirmMfaEnrollment(ctx.userId, str(req.body.code, 6));
    if (!codes) return await settingsView(req, ctx, { error: 'That code did not match. Start setup again and use a fresh code.' });
    await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'auth.mfa.enabled' });
    return await settingsView(req, { ...ctx, profile: { ...ctx.profile, mfa: true } }, { recoveryCodes: codes, flash: { type: 'ok', text: 'Multi-factor authentication is on.' } });
  }, 'post');
  page('/app/settings/mfa/disable', async (req, ctx) => {
    const user = await getUser(ctx.userId);
    if (!verifyPassword(String(req.body.password || ''), user.password_hash) || !await verifyMfa(ctx.userId, str(req.body.code, 20))) return await settingsView(req, ctx, { error: 'Password or code is incorrect.' });
    await disableMfa(ctx.userId);
    await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'auth.mfa.disabled' });
    return { redirect: '/app/settings' };
  }, 'post');
  page('/app/settings/password', async (req, ctx) => {
    if (ctx.isDemo) return await settingsView(req, ctx, { error: 'Demo accounts have no password.' });
    const user = await getUser(ctx.userId);
    if (!(await rateLimit(`pwchange:${ctx.userId}`, 5, 15 * 60e3)).ok || !verifyPassword(String(req.body.current || ''), user.password_hash)) return await settingsView(req, ctx, { error: 'Current password is incorrect.' });
    const problems = passwordProblems(String(req.body.password || ''), ctx.profile.email);
    if (problems.length) return await settingsView(req, ctx, { error: problems.join(' ') });
    if (req.body.password !== req.body.confirm) return await settingsView(req, ctx, { error: 'Passwords do not match.' });
    await setPassword(ctx.userId, req.body.password);
    await destroyUserSessions(ctx.userId, ctx.sessionId);
    await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'auth.password.changed' });
    return { redirect: '/app/settings?ok=pw' };
  }, 'post');
  page('/app/settings/invite', async (req, ctx) => {
    requirePerm(ctx, 'members.manage');
    if (ctx.isDemo) throw new HttpError(400, 'Invitations are disabled in demo workspaces.');
    const email = str(req.body.email, 254).toLowerCase();
    const role = str(req.body.role, 30);
    if (!validateEmail(email) || !ROLES[role]) return await settingsView(req, ctx, { error: 'Enter a valid email and role.' });
    if (!(await rateLimit(`invite:${ctx.orgId}`, 30, 24 * 3600e3)).ok) return await settingsView(req, ctx, { error: 'Daily invitation limit reached.' });
    const { token } = await createInvitation(ctx, email, role);
    const link = `${config.baseUrl}/invite?token=${token}`;
    if (!config.mailAvailable) {
      await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'members.invite', detail: { role, delivery: 'manual' } });
      return await settingsView(req, ctx, { flash: { type: 'ok', text: `Invitation created. Email is not configured on this site, so copy this private link and send it to ${email} yourself (it works once and expires in 7 days): ${link}` } });
    }
    await sendMail({ kind: 'invite', to: email, subject: `You're invited to ${ctx.orgName} on Thought Authorities A.I. IPO`,
      text: `${ctx.profile.firstName} ${ctx.profile.lastName} invited you to join ${ctx.orgName} as ${ROLES[role]}.\n\nAccept: ${link}\n\nThis invitation expires in 7 days.` });
    await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'members.invite', detail: { role } });
    return { redirect: '/app/settings?ok=invited' };
  }, 'post');

}
