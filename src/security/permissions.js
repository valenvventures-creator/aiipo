// Role-based access control with information classifications. Every read of tenant data passes
// through canRead(); every consequential action through can(). Applies equally to pages, search,
// exports, notifications and the AI guide's retrieval context.

export const ROLES = {
  org_admin: 'Organization administrator',
  founder: 'Founder / CEO',
  cfo: 'CFO / Controller',
  legal: 'In-house legal',
  external_counsel: 'External securities counsel',
  auditor: 'Independent auditor',
  accounting_advisor: 'Accounting advisor',
  banker: 'Investment banker',
  ir_pr: 'IR / PR',
  director: 'Director',
  sector_expert: 'Sector expert',
  guest: 'Restricted guest',
};

export const CLASSIFICATIONS = {
  public: 'Public',
  approved: 'Approved for specified use',
  internal: 'Internal draft',
  confidential: 'Confidential',
  restricted_pii: 'Restricted personal information',
  mnpi: 'Material non-public information (MNPI)',
  privileged: 'Privileged (counsel-labelled)',
};

// Highly sensitive classifications additionally require that the user has MFA enabled.
export const MFA_REQUIRED_CLASSES = new Set(['restricted_pii', 'mnpi', 'privileged']);

const ALL = Object.keys(CLASSIFICATIONS);
const READ = {
  org_admin: ALL,
  founder: ALL,
  cfo: ['public', 'approved', 'internal', 'confidential', 'restricted_pii', 'mnpi'],
  legal: ALL,
  external_counsel: ALL,
  auditor: ['public', 'approved', 'internal', 'confidential', 'mnpi'],
  accounting_advisor: ['public', 'approved', 'internal', 'confidential', 'mnpi'],
  banker: ['public', 'approved', 'internal', 'confidential', 'mnpi'],
  ir_pr: ['public', 'approved', 'internal'],
  director: ['public', 'approved', 'internal', 'confidential', 'mnpi', 'privileged'],
  sector_expert: ['public', 'approved', 'internal'],
  guest: ['public', 'approved'],
};

const ACTIONS = {
  'org.manage': ['org_admin', 'founder'],
  'members.manage': ['org_admin', 'founder'],
  'audit.view': ['org_admin', 'founder', 'legal', 'external_counsel'],
  'project.edit': ['org_admin', 'founder', 'cfo', 'legal'],
  'project.close': ['org_admin', 'founder'],
  'task.update': ['org_admin', 'founder', 'cfo', 'legal', 'external_counsel', 'auditor', 'accounting_advisor', 'banker', 'ir_pr'],
  'record.create': ['org_admin', 'founder', 'cfo', 'legal', 'external_counsel', 'accounting_advisor', 'banker', 'ir_pr'],
  'record.review': ['org_admin', 'founder', 'cfo', 'legal', 'external_counsel', 'auditor', 'accounting_advisor', 'banker', 'director'],
  'document.upload': ['org_admin', 'founder', 'cfo', 'legal', 'external_counsel', 'auditor', 'accounting_advisor', 'banker', 'ir_pr'],
  'document.download': ['org_admin', 'founder', 'cfo', 'legal', 'external_counsel', 'auditor', 'accounting_advisor', 'banker', 'director'],
  'document.hold': ['org_admin', 'legal', 'external_counsel'],
  'document.delete': ['org_admin', 'founder', 'legal'],
  'finance.export': ['org_admin', 'founder', 'cfo', 'banker', 'accounting_advisor', 'auditor', 'director'],
  'ai.use': Object.keys(ROLES),
};

// Professional reviewer roles that a task or form may require.
export const REVIEWER_FOR = {
  counsel: ['external_counsel', 'legal'],
  auditor: ['auditor'],
  accountant: ['accounting_advisor', 'auditor'],
  cfo: ['cfo'],
  board: ['director', 'founder'],
  banker: ['banker'],
  admin: ['org_admin', 'founder'],
};

export function readableClasses(role) {
  return READ[role] || [];
}

export function canRead(ctx, classification) {
  if (!ctx?.role) return false;
  if (!readableClasses(ctx.role).includes(classification)) return false;
  if (MFA_REQUIRED_CLASSES.has(classification) && !ctx.mfaSatisfied) return false;
  return true;
}

export function can(ctx, action) {
  return Boolean(ctx?.role && ACTIONS[action]?.includes(ctx.role));
}

export function canReview(ctx, reviewerKey) {
  if (!reviewerKey) return can(ctx, 'record.review');
  return (REVIEWER_FOR[reviewerKey] || []).includes(ctx.role);
}

export class Forbidden extends Error {
  constructor(msg = 'You do not have permission to do that.') { super(msg); this.status = 403; }
}

export function requirePerm(ctx, action) {
  if (!can(ctx, action)) throw new Forbidden();
}
