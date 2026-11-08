// Structured starter forms (Section 15). Each form declares fields, its default classification and
// reviewer, and validation rules that encode the specification's controls.
import { Dec, D, sum } from './decimal.js';

const f = (name, label, type = 'text', o = {}) => ({ name, label, type, ...o });
const sel = (name, label, options, o = {}) => f(name, label, 'select', { options, ...o });
const SEVERITY = ['Low', 'Medium', 'High', 'Critical'];
const WORKSTREAMS = ['Strategy', 'Finance and audit', 'Legal and ownership', 'Governance', 'Diligence and disclosure', 'Communications', 'Public company operations'];

export const RECORD_STATUSES = ['Draft', 'Waiting for review', 'Changes requested', 'Approved', 'Held for counsel review', 'Closed', 'Superseded'];

export const FORMS = {
  issue: {
    name: 'Readiness issue', classification: 'confidential', reviewer: 'counsel', area: 'legal',
    fields: [sel('workstream', 'Workstream', WORKSTREAMS, { required: true }), f('finding', 'Finding', 'textarea', { required: true }), f('source', 'Source / evidence reference'),
      f('implication', 'Financial or legal implication', 'textarea'), sel('severity', 'Severity', SEVERITY, { required: true }), f('owner', 'Owner'), f('remediation', 'Remediation plan', 'textarea'),
      f('dueDate', 'Due date', 'date'), sel('materiality', 'Potential materiality (professional assessment)', ['Not yet assessed', 'Assessed - not material', 'Assessed - potentially material'])],
    title: (d) => d.finding,
  },
  period: {
    name: 'Financial period and audit', classification: 'confidential', reviewer: 'accountant', area: 'finance',
    fields: [f('entity', 'Entity', 'text', { required: true }), f('start', 'Period start', 'date', { required: true }), f('end', 'Period end', 'date', { required: true }),
      sel('framework', 'Framework', ['IFRS (IASB)', 'US GAAP', 'Canadian ASPE (not acceptable for IPO without conversion)', 'Other']), sel('currency', 'Presentation currency', ['CAD', 'USD', 'Other']),
      sel('basis', 'Consolidated or standalone', ['Consolidated', 'Standalone', 'Carve-out']), sel('auditStatus', 'Audit status', ['Unaudited interim', 'Reviewed interim', 'Audited', 'Audit in progress']),
      f('auditor', 'Auditor legal name'), f('reportDate', 'Audit report date', 'date'), f('reportEvidence', 'Signed report document reference'), f('opinionIssues', 'Opinion and issues', 'textarea'), f('freshness', 'Freshness / age assessment', 'textarea')],
    title: (d) => `${d.entity || 'Entity'} ${d.start || ''} → ${d.end || ''}`,
  },
  capevent: {
    name: 'Capitalization event', classification: 'restricted_pii', reviewer: 'counsel', area: 'legal',
    fields: [sel('instrument', 'Instrument', ['Common shares', 'Preferred shares', 'Options', 'Warrants', 'SAFE', 'Convertible note', 'RSUs', 'Other'], { required: true }),
      f('holder', 'Holder', 'text', { required: true }), f('cls', 'Class / series'), f('quantity', 'Quantity', 'decimal', { required: true }), sel('eventType', 'Event', ['Issuance', 'Transfer', 'Conversion', 'Cancellation', 'Split']),
      f('date', 'Issue or transfer date', 'date', { required: true }), f('consideration', 'Consideration', 'decimal'), sel('currency', 'Currency', ['CAD', 'USD', 'Other']),
      f('authorization', 'Authorization (resolution reference)'), f('agreement', 'Source agreement'), f('conversionTerms', 'Conversion terms', 'textarea'), f('restrictions', 'Restrictions', 'textarea')],
    title: (d) => `${d.eventType || 'Event'}: ${d.quantity || ''} ${d.instrument || ''} - ${d.holder || ''}`,
    dedupe: (d) => [d.instrument, d.holder, d.cls, d.quantity, d.date, d.eventType].map((x) => String(x || '').toLowerCase().trim()).join('|'),
  },
  uop: {
    name: 'Use of proceeds', classification: 'mnpi', reviewer: 'counsel', area: 'capital',
    fields: [f('issuerGross', 'Company gross proceeds', 'decimal', { required: true }), f('discounts', 'Underwriting discounts', 'decimal', { required: true }), f('issuerCosts', 'Company offering costs', 'decimal', { required: true }),
      f('uses', 'Planned uses (one per line: description | amount | timing)', 'textarea', { required: true }), f('assumptions', 'Assumptions', 'textarea'), f('minimumScenario', 'Minimum-funding scenario', 'textarea')],
    title: () => 'Use of proceeds',
  },
  rfp: {
    name: 'Advisor RFP', classification: 'confidential', reviewer: 'admin', area: 'advisors',
    fields: [sel('service', 'Service', ['Issuer securities counsel', 'Audit', 'Accounting advisory', 'Tax', 'Investment bank', 'Transfer agent', 'Filing agent', 'IR / PR', 'Valuation', 'Sector expert', 'D&O insurance'], { required: true }),
      f('recipient', 'Proposed recipient firm'), f('credentials', 'Required credentials'), f('scope', 'Scope and deliverables', 'textarea', { required: true }), f('timing', 'Timing'), f('confidentiality', 'Confidentiality terms'),
      f('conflicts', 'Independence and conflicts questions', 'textarea'), f('fees', 'Fee and expense assumptions'), f('references', 'References requested'),
      sel('shareAuthorized', 'Sharing authorized by issuer?', ['No - draft only', 'Yes - authorized'])],
    title: (d) => `${d.service || 'RFP'}${d.recipient ? ` - ${d.recipient}` : ''}`,
  },
  diligence: {
    name: 'Diligence request', classification: 'confidential', reviewer: 'counsel', area: 'disclosure',
    fields: [sel('category', 'Category', ['Corporate', 'Financial', 'Tax', 'Commercial', 'IP', 'Employment', 'Litigation', 'Regulatory', 'Privacy and security'], { required: true }),
      f('question', 'Question', 'textarea', { required: true }), f('entityPeriod', 'Entity and period'), f('requester', 'Requester'), f('owner', 'Responsible owner'), f('dueDate', 'Due date', 'date'),
      f('answer', 'Answer', 'textarea'), f('documentRef', 'Linked document version'), f('followUp', 'Follow-up', 'textarea'),
      sel('issueResolved', 'Underlying issue resolved?', ['Not assessed', 'No', 'Yes'])],
    title: (d) => d.question,
  },
  claim: {
    name: 'Disclosure claim', classification: 'mnpi', reviewer: 'counsel', area: 'disclosure', reopensDependents: true,
    fields: [f('claim', 'Exact claim', 'textarea', { required: true }), sel('numeric', 'Contains a number or metric?', ['Yes', 'No'], { required: true }), f('source', 'Source and period'),
      f('calculation', 'Calculation'), f('location', 'Disclosure location'), f('wording', 'Approved wording', 'textarea'), f('expiry', 'Expiry / update trigger', 'date'),
      f('dependents', 'Dependent documents (comma-separated)')],
    title: (d) => d.claim,
  },
  comment: {
    name: 'Regulatory comment response', classification: 'privileged', reviewer: 'counsel', area: 'disclosure',
    fields: [sel('authority', 'Authority', ['SEC', 'OSC', 'BCSC', 'ASC', 'AMF', 'Other CSA regulator', 'TSX', 'TSXV', 'CSE', 'Cboe Canada', 'Nasdaq', 'NYSE', 'FINRA'], { required: true }),
      f('date', 'Correspondence date', 'date', { required: true }), f('commentId', 'Comment ID', 'text', { required: true }), f('issue', 'Exact issue reference', 'textarea', { required: true }),
      f('professional', 'Responsible professional'), f('response', 'Response draft', 'textarea'), f('evidence', 'Supporting evidence'), f('pages', 'Revised disclosure pages'),
      f('submission', 'Submission version and receipt')],
    title: (d) => `${d.authority || ''} comment ${d.commentId || ''}`,
  },
  communication: {
    name: 'Communication request', classification: 'internal', reviewer: 'counsel', area: 'communications',
    fields: [f('content', 'Content / description', 'textarea', { required: true }), f('objective', 'Objective'),
      sel('stage', 'Issuer stage', ['Pre-filing', 'Filed - in review', 'Marketing period', 'Post-pricing', 'Listed'], { required: true }),
      sel('jurisdictions', 'Jurisdictions', ['Canada', 'United States', 'Canada and US', 'Other']),
      sel('audience', 'Audience', ['Institutional / accredited investors', 'Retail / general public', 'Customers', 'Employees', 'Media', 'Analysts'], { required: true }),
      sel('type', 'Communication type', ['Ordinary product marketing', 'Corporate branding', 'Offering communication', 'Testing the waters', 'Roadshow', 'Press release', 'Paid promotion / advertising', 'Employee communication', 'Social / influencer'], { required: true }),
      sel('channel', 'Channel', ['Website', 'Email', 'Social media', 'Event', 'Podcast / interview', 'Paid ads', 'Print', 'Meeting']),
      f('claims', 'Source claims used'), f('releaseTime', 'Proposed release time', 'date'), f('counselBasis', 'Counsel basis / permitted route', 'textarea'), f('legends', 'Legends and filing requirements', 'textarea'), f('distribution', 'Distribution evidence')],
    title: (d) => `${d.type || 'Communication'} → ${d.audience || ''}`,
  },
  pricing: {
    name: 'Pricing decision', classification: 'mnpi', reviewer: 'board', area: 'capital',
    fields: [f('price', 'Price per share', 'decimal', { required: true }), sel('currency', 'Currency', ['USD', 'CAD'], { required: true }), f('primaryShares', 'Primary shares', 'decimal', { required: true }),
      f('secondaryShares', 'Secondary shares', 'decimal', { required: true }), f('option', 'Over-allotment option structure'), f('demandSource', 'Demand information source (authorized bank)', 'text', { required: true }),
      f('feeAssumption', 'Underwriting discount %', 'decimal'), f('issuerCash', 'Expected company gross proceeds', 'decimal', { required: true }), f('committee', 'Authorized committee'), f('resolution', 'Resolution reference'), f('conditions', 'Outstanding conditions', 'textarea')],
    title: (d) => `Pricing at ${d.price || '?'} ${d.currency || ''}`,
  },
  closing: {
    name: 'Closing item', classification: 'confidential', reviewer: 'counsel', area: 'closing',
    fields: [f('deliverable', 'Deliverable', 'text', { required: true }), f('party', 'Responsible party', 'text', { required: true }), f('deadline', 'Agreed deadline', 'date'), f('condition', 'Condition precedent'),
      f('docVersion', 'Document version'), f('signature', 'Signature or receipt'), f('verification', 'Verification'), f('effect', 'Funds or securities effect'), f('evidence', 'Completion evidence (from responsible party)')],
    title: (d) => d.deliverable,
  },
  obligation: {
    name: 'Recurring obligation', classification: 'internal', reviewer: 'counsel', area: 'public',
    fields: [f('obligation', 'Obligation', 'text', { required: true }), f('classification', 'Issuer classification basis'), f('source', 'Legal source'), f('trigger', 'Triggering event'), f('period', 'Period'),
      f('dueRule', 'Due-date rule'), sel('ruleVerified', 'Due-date rule verified by counsel?', ['No - provisional', 'Yes - verified']), f('owner', 'Owner'), f('channel', 'Filing channel'), f('nextDue', 'Next internal target date', 'date'), f('evidence', 'Completion evidence')],
    title: (d) => d.obligation,
    permanent: true,
  },
};

export const FORM_AREAS = Object.fromEntries(Object.entries(FORMS).map(([k, v]) => [k, v.area]));

function parseUses(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [description, amount, timing] = l.split('|').map((x) => x?.trim());
    return { description, amount, timing };
  });
}

/** Clean and validate submitted data. Returns { data, errors }. */
export function validateForm(key, input) {
  const def = FORMS[key];
  const data = {};
  const errors = {};
  for (const fld of def.fields) {
    let v = input[fld.name];
    if (Array.isArray(v)) v = v[0];
    v = typeof v === 'string' ? v.trim().slice(0, fld.type === 'textarea' ? 8000 : 500) : '';
    if (fld.type === 'select' && v && !fld.options.includes(v)) { errors[fld.name] = 'Choose one of the listed options.'; continue; }
    if (fld.type === 'decimal' && v) { const d = Dec.parse(v); if (!d) { errors[fld.name] = 'Enter a number.'; continue; } v = d.toString(); }
    if (fld.type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { errors[fld.name] = 'Use YYYY-MM-DD.'; continue; }
    // Required fields may be "Unknown" while drafting; they must be resolved before approval.
    data[fld.name] = v;
  }
  if (key === 'period') {
    if (data.start && data.end && data.end <= data.start) errors.end = 'End date must follow start date.';
    if (data.auditStatus === 'Audited' && (!data.auditor || !data.reportDate || !data.reportEvidence)) errors.auditStatus = 'An "Audited" label needs the auditor legal name, report date and the signed report reference.';
  }
  if (key === 'uop' && !Object.keys(errors).length && data.issuerGross) {
    const net = D(data.issuerGross).sub(D(data.discounts || 0)).sub(D(data.issuerCosts || 0));
    const uses = parseUses(data.uses);
    const bad = uses.find((u) => !Dec.parse(u.amount || ''));
    if (bad) errors.uses = `Each line needs an amount: "${bad.description}".`;
    else {
      const total = sum(uses.map((u) => D(u.amount)));
      if (!total.eq(net)) errors.uses = `Planned uses total ${total.format(2)} but company net proceeds are ${net.format(2)}. Uses must reconcile (secondary seller cash is excluded).`;
    }
    if (/secondary|selling (share|stock)holder/i.test(data.uses)) errors.uses = 'Selling-holder (secondary) proceeds are not company cash and cannot be allocated as a use.';
  }
  if (key === 'pricing' && !Object.keys(errors).length) {
    const expected = D(data.primaryShares || 0).mul(D(data.price || 0));
    if (data.issuerCash && !expected.eq(data.issuerCash)) errors.issuerCash = `Company gross proceeds must equal primary shares × price (${expected.format(2)}). Secondary shares do not produce company cash.`;
  }
  return { data, errors };
}

/** Rules applied when a record is submitted or a status change is requested. */
export function statusGuards(key, data, { action, actorId, creatorId, previousStatus }) {
  if (action === 'submit') {
    // Prefiling retail promotion or paid promotion is always held for counsel; institutional TTW flows proceed to review.
    if (key === 'communication') {
      const retail = data.audience === 'Retail / general public';
      const pre = data.stage === 'Pre-filing' || data.stage === 'Filed - in review';
      if ((retail && pre) || data.type === 'Paid promotion / advertising' || data.type === 'Social / influencer') {
        return { status: 'Held for counsel review', note: 'Held: retail-directed or paid communications during the offering process require a specific counsel determination before any use.' };
      }
    }
    return { status: 'Waiting for review' };
  }
  if (action === 'approve') {
    const def = FORMS[key];
    const missing = def.fields.filter((x) => x.required && (!data[x.name] || /^unknown$/i.test(data[x.name]))).map((x) => x.label);
    if (missing.length) return { error: `Resolve required fields before approval: ${missing.join(', ')}.` };
    if (key === 'claim' && data.numeric === 'Yes' && (!data.source || !data.calculation)) return { error: 'An unsupported numeric claim cannot be approved for external use. Add the source and calculation.' };
    if (key === 'issue' && data.severity === 'Critical' && actorId === creatorId) return { error: 'A critical issue cannot be closed or approved by its preparer alone. Ask an independent reviewer.' };
    if (key === 'closing' && !data.evidence) return { error: 'Mark satisfied only with completion evidence from the responsible party.' };
    if (key === 'rfp' && data.shareAuthorized !== 'Yes - authorized') return { error: 'Sharing requires the issuer\'s authorization. Nothing is sent by the platform.' };
    return { status: 'Approved' };
  }
  if (action === 'close' && key === 'obligation') return { error: 'Recurring obligations cannot be erased; mark individual occurrences complete with evidence instead.' };
  return { status: previousStatus };
}

export { parseUses };
