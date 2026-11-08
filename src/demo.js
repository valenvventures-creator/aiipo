// Clearly fictional demo workspaces. Each visitor gets an isolated, short-lived tenant that is purged
// automatically. Demo assumptions are labelled and are never legal conclusions.
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from './db.js';
import { config } from './config.js';
import { createUser, createOrg, addMembership } from './security/auth.js';
import { randomToken } from './security/crypto.js';
import { createProject, saveRecord, listTasks, updateTaskStatus } from './services.js';

import { DEMOS } from './domain/demos.js';
export { DEMOS };

export function createDemo(kind) {
  const demo = DEMOS[kind] || DEMOS.us_software;
  const expires = new Date(Date.now() + config.session.demoHours * 3600e3).toISOString();
  const orgId = createOrg(`Demo - ${demo.label}`, { isDemo: true, demoExpiresAt: expires });
  const user = createUser({ email: `demo-${randomToken(9)}@demo.invalid`, firstName: 'Demo', lastName: 'Founder', password: randomToken(24) + 'a1', verified: true, isDemo: true });
  addMembership(orgId, user.id, 'founder');
  const ctx = { orgId, userId: user.id, role: 'founder', mfaSatisfied: true };
  const projectId = createProject(ctx, demo.label, demo.profile);
  // Seed illustrative records so each workspace shows real workflow states.
  saveRecord(ctx, projectId, 'issue', { workstream: 'Finance and audit', finding: 'Most recent fiscal year statements are not yet audited by an appropriately registered firm (DEMO DATA).', severity: 'Critical', owner: 'CFO', remediation: 'Engage registered auditor; scope re-audit.', materiality: 'Not yet assessed' }, { submit: true });
  saveRecord(ctx, projectId, 'issue', { workstream: 'Legal and ownership', finding: '2021 option grants lack documented board approval (DEMO DATA).', severity: 'High', owner: 'Corporate secretary', remediation: 'Ratification resolution.', materiality: 'Not yet assessed' }, { submit: true });
  saveRecord(ctx, projectId, 'issue', { workstream: 'Governance', finding: 'Board has one independent director (DEMO DATA).', severity: 'Medium', owner: 'CEO', remediation: 'Director search.', materiality: 'Not yet assessed' });
  saveRecord(ctx, projectId, 'claim', { claim: 'Revenue grew 31% year over year (DEMO DATA).', numeric: 'Yes', source: 'FY2025 audited statements vs FY2024', calculation: '(FY25 − FY24) ÷ FY24', location: 'Prospectus summary', dependents: 'Investor presentation v1' }, { submit: true });
  saveRecord(ctx, projectId, 'communication', { content: 'Paid social campaign inviting the public to "own a piece" before the IPO (DEMO DATA).', stage: 'Pre-filing', audience: 'Retail / general public', type: 'Paid promotion / advertising', jurisdictions: 'Canada and US', channel: 'Paid ads' }, { submit: true });
  saveRecord(ctx, projectId, 'communication', { content: 'Testing-the-waters meeting deck for qualified institutional buyers (DEMO DATA).', stage: 'Pre-filing', audience: 'Institutional / accredited investors', type: 'Testing the waters', jurisdictions: 'United States', channel: 'Meeting' }, { submit: true });
  const tasks = listTasks(ctx, projectId);
  const obj = tasks.find((t) => t.key === 's0.objectives');
  if (obj) updateTaskStatus(ctx, obj.id, 'In progress', 'Demo: objectives drafted');
  const run = tasks.find((t) => t.key === 's0.readiness');
  if (run) updateTaskStatus(ctx, run.id, 'Waiting for review', 'Demo: risk register submitted');
  return { user, orgId, projectId };
}

/** Delete expired demo tenants, including append-only rows that belong only to those tenants. */
export function purgeExpiredDemos() {
  const expired = db.prepare('SELECT id FROM orgs WHERE is_demo = 1 AND demo_expires_at < ?').all(now());
  if (!expired.length) return 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO _purge_allowed (x) VALUES (1)').run();
    for (const { id } of expired) {
      for (const v of db.prepare('SELECT object_name FROM document_versions WHERE org_id = ?').all(id)) {
        fs.rmSync(path.join(config.uploadDir, path.basename(v.object_name)), { force: true });
      }
      for (const t of ['approvals', 'record_versions', 'task_events', 'document_versions', 'access_log', 'ai_interactions']) db.prepare(`DELETE FROM ${t} WHERE org_id = ?`).run(id);
      const users = db.prepare('SELECT user_id FROM memberships WHERE org_id = ?').all(id).map((r) => r.user_id);
      db.prepare('DELETE FROM orgs WHERE id = ?').run(id);
      for (const u of users) db.prepare('DELETE FROM users WHERE id = ? AND is_demo = 1').run(u);
    }
    db.prepare('DELETE FROM _purge_allowed').run();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return expired.length;
}
