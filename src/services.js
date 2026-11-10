// Tenant-scoped application services. Every function takes ctx ({ orgId, userId, role, mfaSatisfied })
// and filters by ctx.orgId; callers never pass raw org ids from requests.
import { db, now, tx } from './db.js';
import { config } from './config.js';
import { encrypt, decrypt, encryptJson, decryptJson, encryptObject, decryptObject, sha256, newId } from './security/crypto.js';
import { canRead, can, canReview, Forbidden, CLASSIFICATIONS, requirePerm } from './security/permissions.js';
import { audit } from './security/audit.js';
import { routeSummary } from './domain/routing.js';
import { STAGES, tasksForRoutes, assertAcyclic, DONE, TASK_STATUSES } from './domain/stages.js';
import { FORMS, validateForm, statusGuards } from './domain/forms.js';
import { HttpError } from './http.js';
import { putObject, getObject } from './objects.js';

// ---------- Projects ----------
export async function listProjects(ctx) {
  return (await db.all('SELECT * FROM projects WHERE org_id = ? ORDER BY created_at', ctx.orgId)).map((p) => hydrateProject(p));
}

export function hydrateProject(p) {
  if (!p) return null;
  const aad = `project:${p.org_id}:${p.id}`;
  return { ...p, name: decrypt(p.name_enc, aad), profile: decryptJson(p.profile_enc, aad), assessment: decryptJson(p.assessment_enc, aad) };
}

export async function getProject(ctx, id) {
  const p = await db.get('SELECT * FROM projects WHERE id = ? AND org_id = ?', id, ctx.orgId);
  if (!p) throw new HttpError(404, 'Project not found.');
  return hydrateProject(p);
}

export async function createProject(ctx, name, profile = {}) {
  const id = newId();
  const aad = `project:${ctx.orgId}:${id}`;
  const t = now();
  await db.run('INSERT INTO projects (id, org_id, name_enc, profile_enc, assessment_enc, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', id, ctx.orgId, encrypt(name, aad), encryptJson(profile, aad), encryptJson(routeSummary(profile), aad), ctx.userId, t, t);
  await syncTasks(ctx, id);
  await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'project.create', target: id });
  return id;
}

/** Save onboarding answers; re-run routing and add any newly applicable tasks. Material changes are logged. */
export async function saveProfile(ctx, projectId, patch) {
  requirePerm(ctx, 'project.edit');
  const p = await getProject(ctx, projectId);
  const profile = { ...p.profile, ...patch };
  const summary = routeSummary(profile);
  const aad = `project:${ctx.orgId}:${projectId}`;
  const changed = Object.keys(patch).filter((k) => JSON.stringify(p.profile[k]) !== JSON.stringify(patch[k]));
  await db.run('UPDATE projects SET profile_enc = ?, assessment_enc = ?, updated_at = ? WHERE id = ? AND org_id = ?', encryptJson(profile, aad), encryptJson(summary, aad), now(), projectId, ctx.orgId);
  await syncTasks(ctx, projectId);
  // A change to routing facts reopens the counsel route review.
  const ROUTING = ['incorporationCountry', 'venues', 'offeringJurisdictions', 'usHolderPct', 'execsUSMajority', 'assetsUSMajority', 'adminUS', 'revenueUsd', 'expectedFloatUsd', 'canadianReportingMonths'];
  if (changed.some((k) => ROUTING.includes(k))) await reopenTask(ctx, projectId, 's1.route', 'Routing facts changed: ' + changed.filter((k) => ROUTING.includes(k)).join(', '));
  await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'project.profile.update', target: projectId, detail: { fields: changed } });
  return summary;
}

export async function closeProject(ctx, projectId) {
  requirePerm(ctx, 'project.close');
  await db.run("UPDATE projects SET status = 'closed', closed_at = ? WHERE id = ? AND org_id = ?", now(), projectId, ctx.orgId);
  await ensureRecurringObligations(ctx, projectId);
  await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'project.close', target: projectId });
}

// ---------- Tasks ----------
async function syncTasks(ctx, projectId) {
  const p = await getProject(ctx, projectId);
  const templates = tasksForRoutes(p.assessment);
  assertAcyclic(templates);
  const existing = new Set((await db.all('SELECT key FROM tasks WHERE project_id = ? AND org_id = ?', projectId, ctx.orgId)).map((r) => r.key));
  const t = now();
  for (const [ord, tpl] of templates.entries()) {
    if (existing.has(tpl.key)) continue;
    await db.run(`INSERT INTO tasks (id, org_id, project_id, stage, ord, key, title, owner_role, reviewer_role, material, depends_on, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, newId(), ctx.orgId, projectId, tpl.stage, ord, tpl.key, tpl.title, tpl.owner, tpl.reviewer || null, tpl.material ? 1 : 0, JSON.stringify(tpl.depends), t, t);
  }
  // Tasks no longer applicable to the route are superseded, never deleted.
  const keys = new Set(templates.map((x) => x.key));
  for (const k of existing) if (!keys.has(k)) await db.run("UPDATE tasks SET status = 'Superseded', updated_at = ? WHERE project_id = ? AND key = ? AND org_id = ?", t, projectId, k, ctx.orgId);
}

export async function listTasks(ctx, projectId) {
  return (await db.all('SELECT * FROM tasks WHERE project_id = ? AND org_id = ? ORDER BY stage, ord', projectId, ctx.orgId))
    .map((x) => ({ ...x, depends_on: JSON.parse(x.depends_on), evidence: JSON.parse(x.evidence) }));
}

export async function getTask(ctx, id) {
  const x = await db.get('SELECT * FROM tasks WHERE id = ? AND org_id = ?', id, ctx.orgId);
  if (!x) throw new HttpError(404, 'Task not found.');
  return { ...x, depends_on: JSON.parse(x.depends_on), evidence: JSON.parse(x.evidence) };
}

export function taskTemplate(key) {
  for (const s of STAGES) { const tt = s.tasks.find((x) => x.key === key); if (tt) return { ...tt, stage: s }; }
  return null;
}

export async function taskEvents(ctx, taskId) {
  return (await db.all('SELECT * FROM task_events WHERE task_id = ? AND org_id = ? ORDER BY at', taskId, ctx.orgId))
    .map((e) => ({ ...e, note: e.note_enc ? decrypt(e.note_enc, `task:${ctx.orgId}`) : '' }));
}

/** Blocking dependencies for a task (unfinished prerequisites). */
export function blockers(tasks, task) {
  const byKey = new Map(tasks.map((x) => [x.key, x]));
  return task.depends_on.map((k) => byKey.get(k)).filter((d) => d && !DONE.has(d.status));
}

export async function updateTaskStatus(ctx, taskId, to, note = '') {
  if (!TASK_STATUSES.includes(to)) throw new HttpError(400, 'Unknown status.');
  const task = await getTask(ctx, taskId);
  const tasks = await listTasks(ctx, task.project_id);
  if (to === 'Approved') {
    if (!canReview(ctx, task.reviewer_role)) throw new Forbidden('Only the designated professional reviewer can approve this task.');
    const open = blockers(tasks, task);
    if (open.length) throw new HttpError(409, `Cannot approve: waiting on ${open.map((d) => d.title).join('; ')}.`);
  } else if (!can(ctx, 'task.update')) throw new Forbidden();
  if (to === 'Not applicable' && task.material && !(note && canReview(ctx, task.reviewer_role))) {
    throw new HttpError(409, 'Marking a material task "Not applicable" requires a rationale and the designated reviewer.');
  }
  if (to === 'Not applicable' && !note) throw new HttpError(400, 'Give a rationale for "Not applicable".');
  await tx(async () => {
    await db.run('UPDATE tasks SET status = ?, na_rationale = CASE WHEN ? = \'Not applicable\' THEN ? ELSE na_rationale END, updated_at = ? WHERE id = ? AND org_id = ?', to, to, note, now(), taskId, ctx.orgId);
    await db.run('INSERT INTO task_events (id, org_id, task_id, user_id, from_status, to_status, note_enc, at) VALUES (?,?,?,?,?,?,?,?)', newId(), ctx.orgId, taskId, ctx.userId, task.status, to, note ? encrypt(note, `task:${ctx.orgId}`) : null, now());
  });
  await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'task.status', target: taskId, detail: { from: task.status, to } });
}

export async function reopenTask(ctx, projectId, key, reason) {
  const task = await db.get('SELECT * FROM tasks WHERE project_id = ? AND key = ? AND org_id = ?', projectId, key, ctx.orgId);
  if (!task || task.status !== 'Approved') return false;
  await db.run("UPDATE tasks SET status = 'Changes requested', updated_at = ? WHERE id = ?", now(), task.id);
  await db.run('INSERT INTO task_events (id, org_id, task_id, user_id, from_status, to_status, note_enc, at) VALUES (?,?,?,?,?,?,?,?)', newId(), ctx.orgId, task.id, ctx.userId, 'Approved', 'Changes requested', encrypt(`Reopened: ${reason}`, `task:${ctx.orgId}`), now());
  return true;
}

export async function assignTask(ctx, taskId, assigneeId, dueDate) {
  requirePerm(ctx, 'task.update');
  await getTask(ctx, taskId);
  if (assigneeId && !await db.get('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?', ctx.orgId, assigneeId)) throw new HttpError(400, 'Assignee is not a member.');
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new HttpError(400, 'Use YYYY-MM-DD.');
  await db.run('UPDATE tasks SET assignee_id = ?, due_date = ?, updated_at = ? WHERE id = ? AND org_id = ?', assigneeId || null, dueDate || null, now(), taskId, ctx.orgId);
}

export async function linkEvidence(ctx, taskId, documentId) {
  const task = await getTask(ctx, taskId);
  await getDocument(ctx, documentId); // permission check
  const ev = Array.from(new Set([...task.evidence, documentId]));
  // Evidence changes availability, not approval: status is untouched.
  await db.run('UPDATE tasks SET evidence = ?, updated_at = ? WHERE id = ? AND org_id = ?', JSON.stringify(ev), now(), taskId, ctx.orgId);
}

export function stageGate(tasks, stageN) {
  const st = tasks.filter((x) => x.stage === stageN && x.status !== 'Superseded');
  const open = st.filter((x) => !DONE.has(x.status));
  return { total: st.length, done: st.length - open.length, open, ready: st.length > 0 && open.length === 0 };
}

// ---------- Records (structured forms) ----------
function recAad(orgId, id) { return `record:${orgId}:${id}`; }

export async function listRecords(ctx, projectId, form) {
  const rows = await db.all(`SELECT * FROM records WHERE org_id = ? AND project_id = ? ${form ? 'AND form = ?' : ''} ORDER BY updated_at DESC`, ...[ctx.orgId, projectId, form].filter(Boolean));
  return rows.filter((r) => canRead(ctx, r.classification)).map((r) => ({ ...r, data: decryptJson(r.data_enc, recAad(ctx.orgId, r.id)) }));
}

export async function countHiddenRecords(ctx, projectId, form) {
  const rows = await db.all('SELECT classification FROM records WHERE org_id = ? AND project_id = ? AND form = ?', ctx.orgId, projectId, form);
  return rows.filter((r) => !canRead(ctx, r.classification)).length;
}

export async function getRecord(ctx, id) {
  const r = await db.get('SELECT * FROM records WHERE id = ? AND org_id = ?', id, ctx.orgId);
  if (!r || !canRead(ctx, r.classification)) throw new HttpError(404, 'Record not found.'); // no existence oracle
  return { ...r, data: decryptJson(r.data_enc, recAad(ctx.orgId, r.id)) };
}

export async function recordHistory(ctx, id) {
  await getRecord(ctx, id);
  const versions = (await db.all('SELECT * FROM record_versions WHERE record_id = ? AND org_id = ? ORDER BY version DESC', id, ctx.orgId))
    .map((v) => ({ ...v, data: decryptJson(v.data_enc, recAad(ctx.orgId, id)) }));
  const approvals = (await db.all('SELECT * FROM approvals WHERE record_id = ? AND org_id = ? ORDER BY at DESC', id, ctx.orgId))
    .map((a) => ({ ...a, note: a.note_enc ? decrypt(a.note_enc, `approval:${ctx.orgId}`) : '' }));
  return { versions, approvals };
}

export async function saveRecord(ctx, projectId, form, input, { id = null, submit = false, classification } = {}) {
  requirePerm(ctx, 'record.create');
  const def = FORMS[form];
  if (!def) throw new HttpError(404, 'Unknown form.');
  await getProject(ctx, projectId);
  const { data, errors } = validateForm(form, input);
  if (Object.keys(errors).length) return { errors, data };
  const cls = classification && CLASSIFICATIONS[classification] ? classification : def.classification;
  if (!canRead(ctx, cls)) throw new Forbidden('You cannot create a record at a classification you are not cleared to read.');
  const dedupe = def.dedupe ? sha256(def.dedupe(data)) : null;
  const t = now();
  return tx(async () => {
    if (dedupe) {
      const dup = await db.get('SELECT id FROM records WHERE org_id = ? AND project_id = ? AND form = ? AND dedupe_key = ? AND id != ?', ctx.orgId, projectId, form, dedupe, id || '');
      if (dup) return { errors: { _: 'Duplicate event: an identical capitalization event already exists.' }, data };
    }
    let rec;
    let status = submit ? statusGuards(form, data, { action: 'submit' }) : { status: 'Draft' };
    if (id) {
      rec = await getRecord(ctx, id);
      if (rec.project_id !== projectId) throw new HttpError(400, 'Record belongs to another project.');
      const material = JSON.stringify(rec.data) !== JSON.stringify(data);
      if (!material && !submit) return { id };
      const version = rec.version + 1;
      // Editing an approved record creates a new version and reopens review; the old approval stays in history.
      if (rec.status === 'Approved' && material && !submit) status = { status: 'Changes requested', note: 'Edited after approval - review reopened.' };
      await db.run('UPDATE records SET data_enc = ?, status = ?, classification = ?, version = ?, dedupe_key = ?, updated_by = ?, updated_at = ? WHERE id = ? AND org_id = ?', encryptJson(data, recAad(ctx.orgId, id)), status.status, cls, version, dedupe, ctx.userId, t, id, ctx.orgId);
      await db.run('INSERT INTO record_versions (id, record_id, org_id, version, status, data_enc, changed_by, at) VALUES (?,?,?,?,?,?,?,?)', newId(), id, ctx.orgId, version, status.status, encryptJson(data, recAad(ctx.orgId, id)), ctx.userId, t);
      if (def.reopensDependents && material) await reopenDependents(ctx, projectId, rec, data);
    } else {
      id = newId();
      await db.run(`INSERT INTO records (id, org_id, project_id, form, status, classification, version, data_enc, dedupe_key, created_by, updated_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?)`, id, ctx.orgId, projectId, form, status.status, cls, encryptJson(data, recAad(ctx.orgId, id)), dedupe, ctx.userId, ctx.userId, t, t);
      await db.run('INSERT INTO record_versions (id, record_id, org_id, version, status, data_enc, changed_by, at) VALUES (?,?,?,?,?,?,?,?)', newId(), id, ctx.orgId, 1, status.status, encryptJson(data, recAad(ctx.orgId, id)), ctx.userId, t);
    }
    await audit({ orgId: ctx.orgId, userId: ctx.userId, action: `record.${submit ? 'submit' : 'save'}`, target: id, detail: { form, status: status.status } });
    return { id, status: status.status, note: status.note };
  });
}

async function reopenDependents(ctx, projectId, rec, data) {
  // A changed claim reopens other approved claims and communications that reference the same dependent documents or claim text.
  const deps = String(data.dependents || rec.data.dependents || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const others = await db.all("SELECT * FROM records WHERE org_id = ? AND project_id = ? AND status = 'Approved' AND id != ?", ctx.orgId, projectId, rec.id);
  for (const o of others) {
    const od = decryptJson(o.data_enc, recAad(ctx.orgId, o.id));
    const text = JSON.stringify(od).toLowerCase();
    const hit = deps.some((d) => text.includes(d)) || (rec.data.claim && text.includes(String(rec.data.claim).toLowerCase().slice(0, 40)));
    if (hit) {
      await db.run("UPDATE records SET status = 'Changes requested', version = version + 1, updated_at = ? WHERE id = ?", now(), o.id);
      await db.run('INSERT INTO record_versions (id, record_id, org_id, version, status, data_enc, changed_by, at) VALUES (?,?,?,?,?,?,?,?)', newId(), o.id, ctx.orgId, o.version + 1, 'Changes requested', o.data_enc, ctx.userId, now());
    }
  }
}

export async function reviewRecord(ctx, id, decision, note = '') {
  const rec = await getRecord(ctx, id);
  const def = FORMS[rec.form];
  if (!canReview(ctx, def.reviewer)) throw new Forbidden('Only the designated reviewer can decide on this record.');
  let status;
  if (decision === 'approve') {
    const g = statusGuards(rec.form, rec.data, { action: 'approve', actorId: ctx.userId, creatorId: rec.created_by });
    if (g.error) throw new HttpError(409, g.error);
    status = 'Approved';
  } else if (decision === 'changes') status = 'Changes requested';
  else if (decision === 'close') {
    const g = statusGuards(rec.form, rec.data, { action: 'close' });
    if (g.error) throw new HttpError(409, g.error);
    if (rec.form === 'issue' && rec.data.severity === 'Critical' && rec.created_by === ctx.userId) throw new HttpError(409, 'A critical issue cannot be closed by its preparer alone.');
    status = 'Closed';
  } else throw new HttpError(400, 'Unknown decision.');
  await tx(async () => {
    await db.run('UPDATE records SET status = ?, updated_at = ? WHERE id = ? AND org_id = ?', status, now(), id, ctx.orgId);
    await db.run('INSERT INTO approvals (id, org_id, record_id, record_version, decision, user_id, role, note_enc, at) VALUES (?,?,?,?,?,?,?,?,?)', newId(), ctx.orgId, id, rec.version, status, ctx.userId, ctx.role, note ? encrypt(note, `approval:${ctx.orgId}`) : null, now());
  });
  await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'record.review', target: id, detail: { decision: status, version: rec.version } });
  return status;
}

export async function ensureRecurringObligations(ctx, projectId) {
  const p = await getProject(ctx, projectId);
  const existing = (await listRecords({ ...ctx, role: 'org_admin', mfaSatisfied: true }, projectId, 'obligation')).map((r) => r.data.obligation);
  const items = [];
  if (p.assessment.hasCanadian) items.push(
    ['Annual audited financial statements and MD&A (Canada)', 'NI 51-102', 'Fiscal year-end'],
    ['Interim financial reports and MD&A (Canada)', 'NI 51-102', 'Quarter-end'],
    ['CEO/CFO certifications (Canada)', 'NI 52-109', 'Each annual and interim filing'],
    ['Annual information form where required', 'NI 51-102', 'Fiscal year-end'],
    ['Material change reports and timely disclosure', 'NI 51-102 / NP 51-201 / exchange rules', 'Material change'],
    ['Management information circular and annual meeting', 'NI 51-102 / NI 54-101 / corporate law', 'Annual meeting'],
    ['Insider reporting and early warning', 'NI 55-104 / NI 62-103', 'Insider trades / thresholds'],
  );
  const fpi = p.assessment.classifications?.find((c) => c.key === 'fpi');
  if (p.assessment.hasUS) {
    if (fpi?.conclusion === 'likely') items.push(['Annual report on Form 20-F (or 40-F if MJDS eligible)', 'Exchange Act', 'Fiscal year-end'], ['Current reports on Form 6-K', 'Exchange Act', 'Home-country disclosure'], ['Section 16(a) insider reports - evaluate HFIA and relief per individual', 'HFIA / Release 34-104931', 'Insider transactions']);
    else items.push(['Annual report on Form 10-K', 'Exchange Act', 'Fiscal year-end'], ['Quarterly reports on Form 10-Q', 'Exchange Act', 'Quarter-end'], ['Current reports on Form 8-K', 'Exchange Act', 'Triggering events'], ['Proxy statement and annual meeting', 'Exchange Act / exchange rules', 'Annual meeting'], ['Section 16 insider reports', 'Exchange Act s.16', 'Insider transactions']);
    items.push(['SOX 302 certifications; 404(a)/(b) per filer status and relief', 'SOX', 'Annual / quarterly']);
  }
  // System-generated on project close; recorded under the acting user but not limited by their role.
  const sys = { ...ctx, role: 'org_admin', mfaSatisfied: true };
  for (const [obligation, source, trigger] of items) {
    if (existing.includes(obligation)) continue;
    await saveRecord(sys, projectId, 'obligation', {
      obligation, source, trigger, classification: 'Pending counsel review of issuer classification', dueRule: 'To be confirmed by counsel', ruleVerified: 'No - provisional', owner: 'CFO / corporate secretary',
    }, { submit: true });
  }
}

// ---------- Data room ----------
const ALLOWED = [
  { mime: 'application/pdf', ext: 'pdf', magic: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx', magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  { mime: 'image/png', ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'text/csv', ext: 'csv', magic: (b) => isText(b) },
  { mime: 'text/plain', ext: 'txt', magic: (b) => isText(b) },
];
function isText(b) { const s = b.subarray(0, 4096); return !s.includes(0); }

/** Basic content screening. Production deployments must add an AV engine (e.g. ClamAV) - see SECURITY.md. */
function scan(buf) {
  const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  if (buf.includes(Buffer.from(eicar))) return 'blocked';
  if (buf.subarray(0, 2).toString() === 'MZ' || buf.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return 'blocked';
  if (/\/JavaScript|\/Launch|\/EmbeddedFile/.test(buf.subarray(0, 2_000_000).toString('latin1'))) return 'flagged';
  return 'basic-checks-passed';
}

export async function uploadDocument(ctx, projectId, { name, folder, classification, contentBase64, documentId = null }) {
  requirePerm(ctx, 'document.upload');
  await getProject(ctx, projectId);
  const cleanName = String(name || '').replace(/[\\/\0<>:"|?*\x00-\x1f]/g, '_').slice(0, 180);
  if (!cleanName) throw new HttpError(400, 'File name is required.');
  if (!CLASSIFICATIONS[classification]) throw new HttpError(400, 'Choose a classification.');
  if (!canRead(ctx, classification)) throw new Forbidden('You cannot upload at a classification you are not cleared to read.');
  const buf = Buffer.from(String(contentBase64 || ''), 'base64');
  if (!buf.length) throw new HttpError(400, 'The file is empty.');
  if (buf.length > config.uploads.maxBytes) throw new HttpError(413, `File exceeds ${config.uploads.maxBytes / 1024 / 1024} MB.`);
  const ext = cleanName.split('.').pop().toLowerCase();
  const type = ALLOWED.find((a) => a.ext === ext || (ext === 'jpeg' && a.ext === 'jpg'));
  if (!type || !type.magic(buf)) throw new HttpError(415, 'File type not allowed or content does not match its extension. Allowed: PDF, DOCX, XLSX, PPTX, PNG, JPG, CSV, TXT.');
  const scanStatus = scan(buf);
  if (scanStatus === 'blocked') {
    await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'document.blocked', detail: { name: cleanName } });
    throw new HttpError(422, 'The file was blocked by content screening.');
  }
  const t = now();
  return tx(async () => {
    let docId = documentId;
    let version = 1;
    if (docId) {
      const d = await getDocument(ctx, docId);
      version = Number((await db.get('SELECT MAX(version) AS v FROM document_versions WHERE document_id = ? AND org_id = ?', docId, ctx.orgId)).v) + 1;
      // A new version is unreviewed even if the previous one was reviewed.
      await db.run("UPDATE documents SET review_status = 'Unreviewed' WHERE id = ?", d.id);
    } else {
      docId = newId();
      await db.run('INSERT INTO documents (id, org_id, project_id, folder, name_enc, classification, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)', docId, ctx.orgId, projectId, String(folder || 'General').slice(0, 80), encrypt(cleanName, `doc:${ctx.orgId}:${docId}`), classification, ctx.userId, t);
    }
    const aad = `object:${ctx.orgId}:${docId}:${version}`;
    const { body, wrappedKey } = encryptObject(buf, aad);
    const objectName = newId();
    await putObject(objectName, body);
    await db.run('INSERT INTO document_versions (id, document_id, org_id, version, object_name, wrapped_key, size, mime, sha256, scan_status, uploaded_by, at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', newId(), docId, ctx.orgId, version, objectName, wrappedKey, buf.length, type.mime, sha256(buf), scanStatus, ctx.userId, t);
    await db.run('INSERT INTO access_log (id, org_id, document_id, user_id, action, version, at) VALUES (?,?,?,?,?,?,?)', newId(), ctx.orgId, docId, ctx.userId, 'upload', version, t);
    await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'document.upload', target: docId, detail: { version, classification, scanStatus } });
    return { id: docId, version, scanStatus };
  });
}

export async function listDocuments(ctx, projectId) {
  const docs = (await db.all('SELECT * FROM documents WHERE org_id = ? AND project_id = ? AND deleted_at IS NULL ORDER BY folder, created_at', ctx.orgId, projectId))
    .filter((d) => canRead(ctx, d.classification));
  const out = [];
  for (const d of docs) {
    out.push({ ...d, name: decrypt(d.name_enc, `doc:${ctx.orgId}:${d.id}`), versions: await db.all('SELECT version, size, mime, sha256, scan_status, uploaded_by, at FROM document_versions WHERE document_id = ? AND org_id = ? ORDER BY version DESC', d.id, ctx.orgId) });
  }
  return out;
}

export async function getDocument(ctx, id) {
  const d = await db.get('SELECT * FROM documents WHERE id = ? AND org_id = ? AND deleted_at IS NULL', id, ctx.orgId);
  if (!d || !canRead(ctx, d.classification)) throw new HttpError(404, 'Document not found.');
  if (d.expires_at && d.expires_at < now()) throw new HttpError(410, 'Access to this document has expired.');
  return { ...d, name: decrypt(d.name_enc, `doc:${ctx.orgId}:${d.id}`) };
}

export async function downloadDocument(ctx, id, version) {
  requirePerm(ctx, 'document.download');
  const d = await getDocument(ctx, id);
  const v = version
    ? await db.get('SELECT * FROM document_versions WHERE document_id = ? AND org_id = ? AND version = ?', id, ctx.orgId, Number(version))
    : await db.get('SELECT * FROM document_versions WHERE document_id = ? AND org_id = ? ORDER BY version DESC LIMIT 1', id, ctx.orgId);
  if (!v) throw new HttpError(404, 'Version not found.');
  const stored = await getObject(v.object_name);
  const buf = decryptObject(stored, v.wrapped_key, `object:${ctx.orgId}:${id}:${v.version}`);
  if (sha256(buf) !== v.sha256) throw new HttpError(500, 'Integrity check failed.');
  await db.run('INSERT INTO access_log (id, org_id, document_id, user_id, action, version, at) VALUES (?,?,?,?,?,?,?)', newId(), ctx.orgId, id, ctx.userId, 'download', v.version, now());
  await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'document.download', target: id, detail: { version: v.version } });
  return { buf, name: d.name, mime: v.mime };
}

export async function setLegalHold(ctx, id, on) {
  requirePerm(ctx, 'document.hold');
  await getDocument(ctx, id);
  await db.run('UPDATE documents SET legal_hold = ? WHERE id = ? AND org_id = ?', on ? 1 : 0, id, ctx.orgId);
  await audit({ orgId: ctx.orgId, userId: ctx.userId, action: on ? 'document.hold.on' : 'document.hold.off', target: id });
}

export async function deleteDocument(ctx, id) {
  requirePerm(ctx, 'document.delete');
  const d = await getDocument(ctx, id);
  if (d.legal_hold) throw new HttpError(409, 'This document is under legal hold and cannot be deleted.');
  await db.run('UPDATE documents SET deleted_at = ? WHERE id = ? AND org_id = ?', now(), id, ctx.orgId);
  await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'document.delete', target: id });
}

export async function setDocumentReview(ctx, id, status) {
  if (!canReview(ctx, 'counsel') && !canReview(ctx, 'accountant')) throw new Forbidden();
  await getDocument(ctx, id);
  if (!['Unreviewed', 'Reviewed', 'Approved for specified use'].includes(status)) throw new HttpError(400, 'Unknown status.');
  await db.run('UPDATE documents SET review_status = ? WHERE id = ? AND org_id = ?', status, id, ctx.orgId);
  await audit({ orgId: ctx.orgId, userId: ctx.userId, action: 'document.review', target: id, detail: { status } });
}

export async function accessLog(ctx, docId) {
  await getDocument(ctx, docId);
  return await db.all('SELECT * FROM access_log WHERE document_id = ? AND org_id = ? ORDER BY at DESC LIMIT 100', docId, ctx.orgId);
}

// ---------- Members ----------
export async function members(ctx) {
  return (await db.all('SELECT m.role, m.created_at, u.id, u.email_enc, u.first_name_enc, u.last_name_enc, u.mfa_enabled FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at', ctx.orgId))
    .map((m) => ({ id: m.id, role: m.role, mfa: Boolean(m.mfa_enabled), email: decrypt(m.email_enc, `user:${m.id}`), name: `${decrypt(m.first_name_enc, `user:${m.id}`) || ''} ${decrypt(m.last_name_enc, `user:${m.id}`) || ''}`.trim() }));
}

// ---------- Dashboard plan ----------
export async function plan(ctx, project) {
  const tasks = (await listTasks(ctx, project.id)).filter((x) => x.status !== 'Superseded');
  const byKey = new Map(tasks.map((x) => [x.key, x]));
  const actionable = tasks.filter((x) => !DONE.has(x.status) && x.depends_on.every((k) => !byKey.has(k) || DONE.has(byKey.get(k).status)));
  const activeStage = STAGES.find((s) => tasks.some((x) => x.stage === s.n && !DONE.has(x.status))) || STAGES[STAGES.length - 1];
  const issues = (await listRecords(ctx, project.id, 'issue')).filter((r) => !['Closed', 'Approved'].includes(r.status));
  const sevRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const blockersList = issues.sort((a, b) => (sevRank[a.data.severity] ?? 9) - (sevRank[b.data.severity] ?? 9)).slice(0, 5);
  const waitingReview = tasks.filter((x) => x.status === 'Waiting for review');
  const docs = await listDocuments(ctx, project.id);
  const unknowns = (project.assessment.classifications || []).flatMap((c) => c.unknowns.map((u) => `${c.label}: ${u}`));
  const readiness = STAGES.map((s) => ({ ...stageGate(tasks, s.n), n: s.n, name: s.name, slug: s.slug }));
  return {
    activeStage, next: actionable.slice(0, 3), actionable, blockers: blockersList, waitingReview, unknowns, readiness,
    docs: { total: docs.length, unreviewed: docs.filter((d) => d.review_status === 'Unreviewed').length },
    critical: issues.filter((r) => r.data.severity === 'Critical').length,
    upcoming: tasks.filter((x) => x.due_date && !DONE.has(x.status)).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5),
  };
}
