// Clearly fictional demo workspaces. Each visitor gets an isolated, short-lived tenant that is purged
// automatically. Demo assumptions are labelled and are never legal conclusions.
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from './db.js';
import { config } from './config.js';
import { createUser, createOrg, addMembership } from './security/auth.js';
import { randomToken } from './security/crypto.js';
import { createProject, saveRecord, listTasks, updateTaskStatus } from './services.js';

export const DEMOS = {
  ca_industrial: {
    label: 'Northbeam Fabrication Inc. (fictional)', blurb: 'Canadian industrial manufacturer considering the TSX Venture Exchange.',
    profile: { legalName: 'Northbeam Fabrication Inc. (FICTIONAL DEMO)', incorporationCountry: 'CA', incorporationJurisdiction: 'Alberta', hqProvince: 'Alberta', sector: 'industrial', fiscalYearEnd: '12-31',
      venues: ['TSXV'], offeringJurisdictions: ['CA'], targetCapital: '12000000', currency: 'CAD', revenueUsd: '38000000', expectedFloatUsd: '30000000', reasons: 'Fund a second plant and create liquidity for early employees.', accountingBasis: 'ASPE (conversion to IFRS needed)', auditStatus: 'Audited (not CPAB participating firm - to verify)' },
  },
  us_software: {
    label: 'Cobaltline Software, Inc. (fictional)', blurb: 'US software company considering Nasdaq.',
    profile: { legalName: 'Cobaltline Software, Inc. (FICTIONAL DEMO)', incorporationCountry: 'US', incorporationJurisdiction: 'Delaware', sector: 'software', fiscalYearEnd: '01-31',
      venues: ['NASDAQ'], offeringJurisdictions: ['US'], targetCapital: '150000000', currency: 'USD', revenueUsd: '210000000', expectedFloatUsd: '600000000', reasons: 'Growth capital, acquisition currency and employee liquidity.', accountingBasis: 'US GAAP', auditStatus: 'Audited (PCAOB registered firm)' },
  },
  ca_dual: {
    label: 'Lumen Harbour Analytics Ltd. (fictional)', blurb: 'Canadian company assessing a US or dual-market route.',
    profile: { legalName: 'Lumen Harbour Analytics Ltd. (FICTIONAL DEMO)', incorporationCountry: 'CA', incorporationJurisdiction: 'British Columbia', hqProvince: 'British Columbia', sector: 'software', fiscalYearEnd: '12-31',
      venues: ['TSX', 'NASDAQ'], offeringJurisdictions: ['CA', 'US'], targetCapital: '90000000', currency: 'USD', revenueUsd: '64000000', expectedFloatUsd: '240000000', usHolderPct: '', execsUSMajority: 'no', assetsUSMajority: 'no', adminUS: '',
      reasons: 'Access US investor base while keeping Canadian listing.', accountingBasis: 'IFRS', auditStatus: 'Audited (CPAB participating; PCAOB status to verify)' },
  },
  life_sciences: {
    label: 'Verdant Peptide Therapeutics Corp. (fictional)', blurb: 'Pre-revenue life sciences company.',
    profile: { legalName: 'Verdant Peptide Therapeutics Corp. (FICTIONAL DEMO)', incorporationCountry: 'CA', incorporationJurisdiction: 'Ontario', hqProvince: 'Ontario', sector: 'life_sciences', venues: ['NASDAQ'], offeringJurisdictions: ['US'],
      targetCapital: '75000000', currency: 'USD', revenueUsd: '0', expectedFloatUsd: '180000000', usHolderPct: '62', execsUSMajority: 'yes', assetsUSMajority: 'no', adminUS: 'no', reasons: 'Fund Phase 2 trial.', accountingBasis: 'US GAAP', auditStatus: 'Audit in progress' },
  },
  resource: {
    label: 'Kestrel Ridge Minerals Ltd. (fictional)', blurb: 'Resource issuer with an exploration property.',
    profile: { legalName: 'Kestrel Ridge Minerals Ltd. (FICTIONAL DEMO)', incorporationCountry: 'CA', incorporationJurisdiction: 'British Columbia', hqProvince: 'British Columbia', sector: 'mining', venues: ['CSE'], offeringJurisdictions: ['CA'],
      targetCapital: '4000000', currency: 'CAD', revenueUsd: '0', expectedFloatUsd: '6000000', reasons: 'Fund Phase 1 drilling program.', accountingBasis: 'IFRS', auditStatus: 'Audited' },
  },
};

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
