// Stage and SOP library (Sections 8-11 of the specification). Every stage carries a fully populated
// SOP record and concrete task templates with route applicability, owner, reviewer and dependencies.
// Content status: drafted by the product team from the cited sources; NOT yet reviewed by licensed
// professionals. The UI shows this status on every stage.

export const CONTENT_STATUS = 'Research draft - pending legal and accounting review';

export const TASK_STATUSES = ['Not started', 'In progress', 'Waiting for information', 'Waiting for review', 'Changes requested', 'Approved', 'Blocked', 'Not applicable', 'Superseded'];
export const DONE = new Set(['Approved', 'Not applicable', 'Superseded']);

const t = (key, title, o) => ({ key, title, routes: ['all'], material: false, depends: [], ...o });

export const STAGES = [
  {
    n: 0, slug: 'strategic-fit', name: 'Assess strategic fit', owner: 'CEO and board', support: 'CFO and counsel',
    sop: {
      id: 'SOP-STR-00', version: '1.0', purpose: 'Decide, on documented evidence, whether to prepare for an IPO, investigate further, defer, or pursue an alternative.',
      trigger: 'Board or founders begin considering a public listing or a large capital raise.',
      responsibility: { accountable: 'CEO', contributors: ['CFO', 'Board'], reviewer: 'Securities counsel (route assumptions)', approval: 'Board of directors' },
      inputs: ['IPO objectives and funding need', 'Ownership and control constraints', '24-month cash forecast', 'Management capacity', 'Market alternatives'],
      procedure: ['Complete the objectives questionnaire (onboarding).', 'Compare IPO against private capital, debt, strategic sale and postponement.', 'Model ongoing public-company costs and founder control effects.', 'Record readiness gaps in the risk register.', 'Prepare the board decision memo and record the decision.'],
      timing: 'Typically 2-8 weeks of internal work; no statutory deadline. Internal targets only.',
      outputs: ['Alternatives memo', 'Readiness assessment', 'Board decision memo', 'Readiness budget'],
      verification: 'Board minutes or resolution record a decision to prepare, defer or investigate; unknowns are listed with owners.',
      escalation: 'Founder control concerns, unresolved going-concern risk, or a regulated sector → specialist assessment before committing spend.',
      support: 'Learning unit 1: Public markets and alternatives. Case: The We Company 2019 (withdrawal and costs).',
    },
    exit: 'Documented board direction, identified unknowns, readiness budget and accountable lead. A favourable assessment does not certify listing eligibility.',
    tasks: [
      t('s0.objectives', 'Document IPO objectives and alternatives', { owner: 'founder', reviewer: 'board', form: 'onboarding',
        what: 'Write down why the company is considering an IPO and what else could meet the same objectives.', why: 'An IPO is one route among several; clear objectives keep the decision grounded and reviewable.',
        needs: ['Target capital and use', 'Founder liquidity goals', 'Control preferences', 'Timing range'], steps: ['Complete onboarding: IPO objectives.', 'List at least three alternatives.', 'Note what would make you postpone.'],
        example: 'A software company needing US$40M for expansion compares a growth round, venture debt and a Nasdaq IPO in 18-24 months.', check: 'Board reviewer approves the objectives record.' }),
      t('s0.runway', 'Model cash runway under IPO scenarios', { owner: 'cfo', reviewer: 'board', depends: ['s0.objectives'], tool: 'runway',
        what: 'Forecast cash under completed, delayed, downsized and abandoned IPO scenarios.', why: 'Readiness costs are incurred even if no offering closes.',
        needs: ['Cash balance', 'Monthly burn', 'Estimated readiness fees'], steps: ['Open Capital and Valuation → Runway.', 'Enter assumptions and save the scenario.', 'Export and attach to the board memo.'],
        example: 'With 14 months of runway and a 9-month delay, the delayed scenario runs out of cash in month 13.', check: 'Saved scenario attached; CFO assumptions reviewed.' }),
      t('s0.readiness', 'Complete the readiness assessment and risk register', { owner: 'cfo', reviewer: 'board', form: 'issue',
        what: 'Identify gaps across finance, legal, governance, systems and people.', why: 'Blockers found early are cheaper to remediate.',
        needs: ['Financial statement status', 'Cap table', 'Board composition'], steps: ['Record each gap as a readiness issue.', 'Assign severity and owner.'], example: 'No audited statements for the most recent year → critical finance issue.', check: 'All identified gaps recorded with owners.' }),
      t('s0.board', 'Board decision: prepare, defer or investigate', { owner: 'founder', reviewer: 'board', material: true, depends: ['s0.objectives', 's0.runway', 's0.readiness'],
        what: 'The board records its direction based on the evidence assembled.', why: 'A documented decision anchors the budget and accountability.', needs: ['Alternatives memo', 'Runway model', 'Risk register'],
        steps: ['Generate the board decision memo.', 'Circulate to directors.', 'Record the resolution and upload minutes.'], example: 'Board resolves to fund a 6-month readiness program with a US$600k budget.', check: 'Signed minutes uploaded; director approval recorded.' }),
    ],
  },
  {
    n: 1, slug: 'route-and-team', name: 'Select route and assemble the team', owner: 'CFO or IPO project lead', support: 'Securities counsel',
    sop: {
      id: 'SOP-TEAM-01', version: '1.0', purpose: 'Confirm candidate jurisdictions and venues and engage the professionals the route requires.',
      trigger: 'Board direction to prepare (Stage 0 gate).', responsibility: { accountable: 'IPO project lead', contributors: ['CFO', 'CEO'], reviewer: 'Securities counsel', approval: 'CEO' },
      inputs: ['Route assessment', 'Budget', 'Sector', 'Advisor shortlist'], procedure: ['Review the provisional route comparison with counsel.', 'Issue advisor RFPs (counsel, auditor, banks, transfer agent, IR).', 'Run qualification and conflict checks against official registries.', 'Compare proposals and record engagement decisions.', 'Publish working group list, RACI and workback schedule.'],
      timing: 'Typically 4-10 weeks depending on advisor availability.', outputs: ['Engagement tracker', 'RACI', 'Workback schedule', 'Kickoff agenda'],
      verification: 'Counsel has reviewed route assumptions; key professionals engaged with signed letters; owners named.',
      escalation: 'Conflicts of interest, auditor independence concerns, or no banker appetite → escalate to board.',
      support: 'Learning unit 3: Building your professional team.',
    },
    exit: 'Counsel-reviewed route assumptions, engaged key professionals, documented exchange eligibility questions, named owners and a funded plan.',
    tasks: [
      t('s1.route', 'Counsel review of provisional route and classifications', { owner: 'cfo', reviewer: 'counsel', material: true, depends: ['s0.board'],
        what: 'Securities counsel reviews the software-generated route comparison and classification inputs.', why: 'Software matching is a starting point; counsel determines the route.',
        needs: ['Company profile', 'Route assessment'], steps: ['Share the route summary with counsel.', 'Record counsel conclusions and changed inputs.'], example: 'Counsel confirms FPI status is likely but flags US-resident holder data as unverified.', check: 'Counsel approval recorded on the route record.' }),
      t('s1.counsel', 'Engage issuer securities counsel', { owner: 'founder', reviewer: 'admin', form: 'rfp', depends: ['s0.board'],
        what: 'Select and engage counsel experienced in your route.', why: 'Counsel coordinates the prospectus or registration statement and regulatory review.', needs: ['Advisor RFP', 'Budget'],
        steps: ['Issue RFPs from Advisors & Resources.', 'Verify licensing via law society or state bar search.', 'Sign engagement letter.'], example: 'Two Canadian and one US firm invited; cross-border capability compared.', check: 'Engagement letter uploaded.' }),
      t('s1.auditor', 'Engage an appropriately registered auditor', { owner: 'cfo', reviewer: 'admin', form: 'rfp', depends: ['s0.board'],
        what: 'Confirm your auditor is registered (CPAB participating firm in Canada; PCAOB registered for SEC filers) and independent.', why: 'Audits by an ineligible firm may need to be repeated.',
        needs: ['Current auditor details', 'Independence questionnaire'], steps: ['Search the CPAB and PCAOB directories.', 'Collect independence confirmation.'], example: 'Existing auditor is not PCAOB registered; a re-audit is scoped.', check: 'Registry search evidence and engagement letter uploaded.' }),
      t('s1.underwriters', 'Banker proposals and selection', { owner: 'founder', reviewer: 'board', routes: ['all'], depends: ['s1.route'], tool: 'banker',
        what: 'Obtain and compare proposals from qualified dealers.', why: 'Underwriters lead distribution, pricing and due diligence.', needs: ['Banker RFP', 'Conflict checks'],
        steps: ['Verify dealer registration via CIRO / FINRA BrokerCheck.', 'Compare experience, distribution, fees and conflicts.', 'Record selection rationale.'], example: 'Three banks pitch; lead left selected for sector research depth (no promised coverage).', check: 'Board approves mandate letter.' }),
      t('s1.workback', 'Publish working group list, RACI and workback schedule', { owner: 'cfo', reviewer: 'counsel', depends: ['s1.counsel', 's1.auditor'],
        what: 'One shared plan of who does what, by when.', why: 'Clear ownership prevents dropped items between advisors.', needs: ['Engaged parties', 'Target window'],
        steps: ['Assign owners to every task in Tasks & Calendar.', 'Set internal target dates (distinct from legal deadlines).'], example: 'Workback from a target filing date with best, expected and delayed scenarios.', check: 'Counsel reviews the schedule.' }),
    ],
  },
  {
    n: 2, slug: 'finance', name: 'Remediate finance and reporting', owner: 'CFO and controller', support: 'Independent auditor (separately)',
    sop: {
      id: 'SOP-FIN-02', version: '1.0', purpose: 'Produce reliable financial statements for the required periods and a close process that can meet public reporting timetables.',
      trigger: 'Auditor engaged and route provisionally confirmed.', responsibility: { accountable: 'CFO', contributors: ['Controller', 'Accounting advisor'], reviewer: 'Independent auditor (audit work); accounting advisor (positions)', approval: 'Audit committee / board' },
      inputs: ['Trial balances', 'Prior statements', 'Acquisition history', 'Applicable relief (e.g. Blanket Order 41-930)'],
      procedure: ['Determine required periods and framework with counsel and auditor.', 'Perform GAAP/IFRS gap analysis.', 'Document technical accounting positions.', 'Support audit/re-audit via PBC tracker.', 'Run monthly and quarterly close dry runs.', 'Build a controls matrix and remediate deficiencies.'],
      timing: 'Commonly 3-18 months depending on audit history and complexity.', outputs: ['Audited statements', 'Accounting position memos', 'Controls matrix', 'Close checklist'],
      verification: 'Audit plan approved; statements at the readiness level for the next filing step; open issues assigned; reporting rehearsal completed.',
      escalation: 'Material weakness, going-concern doubt, significant acquisition requiring additional statements → auditor, accounting advisor and counsel.',
      support: 'Learning unit 4: Financial statements and audit.',
    },
    exit: 'Reporting and audit plan approved by responsible professionals; statements at the required readiness level; credible reporting rehearsal.',
    tasks: [
      t('s2.periods', 'Determine required financial periods and framework', { owner: 'cfo', reviewer: 'accountant', material: true, depends: ['s1.auditor'], form: 'period',
        what: 'Identify which audited and interim periods the offering document needs, and in which framework.', why: 'Requirements vary by route and relief; three audited years is not universal.',
        needs: ['Route assessment', 'Fiscal year-end', 'Relief orders'], steps: ['Record each period in the Financial Period form.', 'Mark freshness/age dates.'], example: 'Canadian IPO relying on coordinated relief may present two audited years - subject to conditions.', check: 'Accounting advisor and counsel approve the period plan.' }),
      t('s2.gap', 'Financial reporting gap analysis', { owner: 'cfo', reviewer: 'accountant', depends: ['s2.periods'], form: 'issue',
        what: 'Compare current accounting to the required framework and disclosure.', why: 'Revenue, stock compensation, leases and consolidation are common gaps.', needs: ['Accounting policies', 'Trial balances'],
        steps: ['Log gaps as readiness issues.', 'Draft accounting position memos.'], example: 'Multi-element SaaS contracts need revised revenue allocation.', check: 'Issues assigned; memos reviewed.' }),
      t('s2.audit', 'Complete audits / re-audits (auditor-owned)', { owner: 'auditor', reviewer: 'auditor', material: true, depends: ['s2.periods'],
        what: 'The independent auditor performs audit work; management supplies evidence via the PBC list.', why: 'An audit report must come from the auditor - the platform only tracks it.',
        needs: ['PBC list', 'Signed management representations'], steps: ['Track PBC requests to completion.', 'Archive the signed report when issued.'], example: 'Auditor issues reports on FY2025 and FY2024.', check: 'Uploading a report records evidence only; the auditor confirms the status.' }),
      t('s2.controls', 'Controls matrix and close process', { owner: 'cfo', reviewer: 'accountant', depends: ['s2.gap'],
        what: 'Document key controls by process and rehearse the close.', why: 'Public reporting timetables and certifications depend on reliable controls.', needs: ['Process narratives', 'Owners'],
        steps: ['Record controls (risk, assertion, owner, frequency, evidence).', 'Run a quarterly close dry run.'], example: 'Dry run closes in 22 business days; target is 15.', check: 'Dry run results reviewed; deficiencies logged.' }),
    ],
  },
  {
    n: 3, slug: 'legal-governance', name: 'Resolve legal structure and governance', owner: 'Securities counsel and corporate secretary', support: 'Board',
    sop: {
      id: 'SOP-LEG-03', version: '1.0', purpose: 'Reconcile corporate records and capitalization and put public-company governance in place.',
      trigger: 'Counsel engaged.', responsibility: { accountable: 'Corporate secretary', contributors: ['Counsel', 'CFO'], reviewer: 'Securities counsel', approval: 'Board' },
      inputs: ['Minute books', 'Cap table', 'Material contracts', 'IP assignments'], procedure: ['Reconcile capitalization events to signed records.', 'Review restructuring and tax consequences.', 'Collect D&O questionnaires and assess independence.', 'Identify change-of-control consents.', 'Adopt charters and policies on a phase-in schedule.'],
      timing: '2-6 months, often in parallel with Stage 2.', outputs: ['Reconciled cap table', 'Entity chart', 'Independence matrix', 'Policies'],
      verification: 'Counsel-reviewed structure; documented decisions on material diligence issues; consents scheduled.',
      escalation: 'Disputed ownership, missing IP assignments, related-party arrangements → counsel; AI does not decide materiality.',
      support: 'Learning unit 5: Ownership and governance.',
    },
    exit: 'Counsel-reviewed structure and ownership; governance implementation and phase-in schedule; consents completed or scheduled.',
    tasks: [
      t('s3.captable', 'Reconcile capitalization to signed records', { owner: 'legal', reviewer: 'counsel', material: true, depends: ['s1.counsel'], form: 'capevent',
        what: 'Every issuance, transfer and conversion matches a signed agreement and authorization.', why: 'Errors surface in diligence and can delay the offering.', needs: ['Subscription agreements', 'Board consents'],
        steps: ['Enter each event in the Capitalization form.', 'Resolve duplicates and gaps.'], example: 'A SAFE conversion lacks board approval; ratification required.', check: 'Counsel approves the reconciliation.' }),
      t('s3.dno', 'Director and officer questionnaires and independence', { owner: 'legal', reviewer: 'counsel', depends: ['s1.counsel'],
        what: 'Collect D&O information and assess director independence.', why: 'Feeds governance disclosure and exchange requirements.', needs: ['Questionnaires'],
        steps: ['Distribute questionnaires.', 'Complete the independence matrix.'], example: 'Board needs a majority of independent directors for the selected exchange - verify with counsel.', check: 'Counsel reviews independence determinations.' }),
      t('s3.policies', 'Adopt governance policies and committee charters', { owner: 'legal', reviewer: 'board', depends: ['s3.dno'],
        what: 'Disclosure, insider trading, whistleblower, code of conduct, committee charters.', why: 'Required or expected for listed issuers; some phase in after listing.', needs: ['Templates', 'Exchange rules'],
        steps: ['Draft policies from templates.', 'Counsel review.', 'Board adoption.'], example: 'Audit committee phase-in for a newly listed company.', check: 'Board resolution uploaded.' }),
      t('s3.consents', 'Material contracts, IP and consent tracker', { owner: 'legal', reviewer: 'counsel', depends: ['s1.counsel'], form: 'issue',
        what: 'Identify contracts needing consent or notice on IPO/reorganization and confirm IP ownership.', why: 'Missed consents can breach key contracts.', needs: ['Contract list', 'IP assignments'],
        steps: ['Review change-of-control clauses.', 'Log issues for missing assignments.'], example: 'Founder pre-incorporation code not assigned.', check: 'Counsel signs off the tracker.' }),
    ],
  },
  {
    n: 4, slug: 'disclosure', name: 'Conduct diligence and prepare disclosure', owner: 'Securities counsel', support: 'Management, CFO, auditor, underwriters',
    sop: {
      id: 'SOP-DIS-04', version: '1.0', purpose: 'Assemble a versioned draft offering document whose material claims are source-linked and verified.',
      trigger: 'Stage 2 and 3 work sufficiently advanced to draft.', responsibility: { accountable: 'Issuer counsel', contributors: ['CFO', 'CEO', 'Underwriters\' counsel'], reviewer: 'Counsel and auditor', approval: 'Board (filing version)' },
      inputs: ['Data room', 'Verified claims', 'Financial statements', 'Risk register'], procedure: ['Open diligence request list.', 'Run risk factor workshop.', 'Draft sections using verified facts.', 'Register every material claim in the claims ledger.', 'Tie out numbers to approved financials.', 'Track exhibits and consents.'],
      timing: 'Commonly 2-4 months.', outputs: ['Draft prospectus / registration statement', 'Verification notes', 'Exhibit list'],
      verification: 'Versioned draft reviewed; material claims source-linked; approval to submit a specific version.',
      escalation: 'Unsupported numeric claim; material diligence issue unresolved → counsel.', support: 'Learning unit 6: Diligence and disclosure.',
    },
    exit: 'Versioned draft reviewed, source-linked claims, documented issues, required consents and approval to submit the specific version.',
    tasks: [
      t('s4.dataroom', 'Open the data room and diligence request list', { owner: 'legal', reviewer: 'counsel', depends: ['s3.captable'], form: 'diligence',
        what: 'Set up folders, access levels and the request list.', why: 'Diligence is faster and safer with controlled access.', needs: ['Folder index', 'Access roles'],
        steps: ['Create folders with classifications.', 'Log requests as Diligence Request records.'], example: 'Bankers get Confidential access; PR has none.', check: 'Counsel confirms access matrix.' }),
      t('s4.claims', 'Verified claims ledger for material statements', { owner: 'cfo', reviewer: 'counsel', material: true, depends: ['s2.audit'], form: 'claim',
        what: 'Every material fact and number used in disclosure is registered with its source.', why: 'Changes then flag every dependent document for review.', needs: ['Approved financials', 'KPI definitions'],
        steps: ['Register claims.', 'Obtain review.'], example: '"Net revenue retention 118% (FY2025)" sourced to KPI schedule v3.', check: 'Unsupported numeric claims cannot be approved.' }),
      t('s4.draft', 'Draft offering document (route-specific outline)', { owner: 'external_counsel', reviewer: 'counsel', material: true, depends: ['s4.claims', 's3.policies'],
        what: 'Prepare the prospectus or registration statement using the outline for your route.', why: 'The document is the primary liability instrument.', needs: ['Outline', 'Verified claims'],
        steps: ['Use the route outline from Disclosure Workspace.', 'Circulate versioned drafts.'], example: 'Canadian long-form prospectus outline under NI 41-101 / Form 41-101F1.', check: 'Board approves the specific filing version.' }),
    ],
  },
  {
    n: 5, slug: 'regulatory-review', name: 'Manage regulatory and exchange review', owner: 'Securities counsel and filing professional', support: 'Management',
    sop: {
      id: 'SOP-REG-05', version: '1.0', purpose: 'Submit through authorized systems, track every comment and condition, and reach a documented path to receipt or effectiveness and listing.',
      trigger: 'Board approval of the filing version.', responsibility: { accountable: 'Issuer counsel', contributors: ['CFO', 'Filing agent'], reviewer: 'Counsel', approval: 'Board / authorized officer' },
      inputs: ['Approved filing version', 'Filing access credentials (EDGAR Next roles / SEDAR+ profile)', 'Fees'], procedure: ['Verify filing authority and access roles.', 'Submit via authorized channel; archive receipt.', 'Log each comment in the response matrix.', 'Draft responses; revise disclosure; refresh financials when stale.', 'Track exchange conditions separately.'],
      timing: 'Depends on regulator and exchange; do not assume a fixed number of comment rounds.', outputs: ['Comment response matrix', 'Amendments', 'Correspondence archive'],
      verification: 'Verified status record from the authority; distinguish review completion, receipt/effectiveness, conditional and final listing approval.',
      escalation: 'Financial statements going stale; unresolved comment → counsel and auditor.', support: 'Learning unit 6.',
    },
    exit: 'Verified review status, outstanding conditions assessed by counsel, documented path to effectiveness or final receipt and listing.',
    tasks: [
      t('s5.filing', 'Verify filing authority and submit', { owner: 'external_counsel', reviewer: 'counsel', material: true, depends: ['s4.draft'],
        what: 'Confirm who can file and submit through EDGAR / SEDAR+ or the filing agent.', why: 'EDGAR Next requires individual roles; old shared credentials are not adequate.', needs: ['Access roles', 'Fees'],
        steps: ['Record filing authority checklist.', 'Archive submission receipt.'], example: 'Draft registration statement submitted non-publicly under the current SEC accommodations.', check: 'Receipt archived - the platform never claims a filing without an external record.' }),
      t('s5.comments', 'Comment response matrix', { owner: 'external_counsel', reviewer: 'counsel', depends: ['s5.filing'], form: 'comment',
        what: 'Track each regulator/exchange comment to response and revised pages.', why: 'Preserves the original correspondence and shows what changed.', needs: ['Comment letters'],
        steps: ['Log each comment.', 'Draft response with evidence.'], example: 'Comment 7 on revenue recognition → revised MD&A p.54.', check: 'Counsel approves each response version.' }),
      t('s5.finra', 'FINRA filing and underwriting compensation (if applicable)', { owner: 'banker', reviewer: 'counsel', routes: ['us'], depends: ['s5.filing'],
        what: 'Track the FINRA member\'s filing and no-objections opinion as a separate workstream.', why: 'Required for many US underwritten offerings; it is not an endorsement of the issuer.',
        needs: ['Initial required filing date'], steps: ['Record the initial filing date (determines Rule 5110 version).'], example: 'Initial filing before Dec 21 2026 → pre-amendment version applies per transition guidance.', check: 'No-objections letter archived.' }),
      t('s5.exchange', 'Exchange application and conditional approval', { owner: 'external_counsel', reviewer: 'counsel', depends: ['s5.filing'],
        what: 'Apply to the exchange and track conditions.', why: 'Conditional approval is not final authorization.', needs: ['Exchange forms'],
        steps: ['Record each condition.', 'Archive approvals.'], example: 'TSX conditional approval subject to distribution requirements.', check: 'Final authorization requires an external status record.' }),
    ],
  },
  {
    n: 6, slug: 'communications', name: 'Prepare communications and market the offering', owner: 'Issuer and authorized underwriters', support: 'Counsel (clearance)',
    sop: {
      id: 'SOP-COM-01', version: '1.0', purpose: 'Communicate a defensible story within the applicable offering rules; every material is cleared on its exact version.',
      trigger: 'Request to distribute any material during the offering period.', responsibility: { accountable: 'IR lead', contributors: ['CFO', 'Underwriters'], reviewer: 'Securities counsel', approval: 'Counsel + underwriters where required' },
      inputs: ['Approved claims', 'Stage', 'Jurisdictions', 'Audience'], procedure: ['Select stage, jurisdictions, audience and date.', 'Generate from approved facts; register claims.', 'Finance ties figures to approved records.', 'Counsel determines communication type, audiences, legends and filings.', 'Approve the specific version; edits reopen clearance.', 'Distribute only via authorized channel and log.', 'Route new investor questions through review.'],
      timing: 'Per request; plan around offering-period restrictions.', outputs: ['Cleared material', 'Distribution log', 'Approved Q&A'],
      verification: 'Evidence-backed material, finance verification, counsel clearance, filings, distribution record, no unresolved claims.',
      escalation: 'Retail promotion before filing; paid promotion; unknown answers → counsel hold.', support: 'Learning unit 8: Communications and roadshows.',
    },
    exit: 'Materials and audiences approved; legends and filings addressed; executives trained. Indications of interest are not subscriptions.',
    tasks: [
      t('s6.matrix', 'Communications permission matrix and inventory', { owner: 'ir_pr', reviewer: 'counsel', depends: ['s1.counsel'], form: 'communication',
        what: 'Inventory ongoing communications and classify each by type and audience.', why: 'Ordinary marketing can become an offering communication in context.', needs: ['Historical cadence', 'Channels'],
        steps: ['Submit each planned communication as a request.', 'Counsel classifies.'], example: 'Customer webinar continues; CEO podcast paused pending review.', check: 'Counsel decision on each item.' }),
      t('s6.narrative', 'Investor narrative and roadshow (cleared)', { owner: 'ir_pr', reviewer: 'counsel', material: true, depends: ['s4.claims', 's6.matrix'],
        what: 'Build the investor presentation from approved claims and clear it under SOP-COM-01.', why: 'Inconsistent claims create liability.', needs: ['Approved claims'],
        steps: ['Draft from claims ledger.', 'Finance tie-out.', 'Counsel clearance.'], example: 'Deck v4 cleared for institutional audiences only.', check: 'Clearance recorded on the exact version.' }),
      t('s6.training', 'Executive training and approved Q&A', { owner: 'ir_pr', reviewer: 'counsel', depends: ['s6.narrative'],
        what: 'Rehearse difficult questions and escalation when an answer is outside approved disclosure.', why: 'Selective disclosure risk.', needs: ['Question bank'],
        steps: ['Mock sessions.', 'Approved responses library.'], example: 'Unknown answer → "We\'ll follow up" and route to counsel.', check: 'Rehearsal scorecard completed.' }),
    ],
  },
  {
    n: 7, slug: 'pricing', name: 'Price and authorize the transaction', owner: 'Board or pricing committee', support: 'Lead underwriter and counsel',
    sop: {
      id: 'SOP-PRC-07', version: '1.0', purpose: 'Authorize price, size and structure on documented information.', trigger: 'Underwriters report demand and the transaction window.',
      responsibility: { accountable: 'Pricing committee chair', contributors: ['CFO', 'Underwriters'], reviewer: 'Counsel', approval: 'Board / pricing committee' },
      inputs: ['Demand information from bankers', 'Proceeds model', 'Underwriting agreement draft'], procedure: ['Review pricing scenarios and dilution.', 'Reconcile values to the approved model.', 'Record resolution and outstanding conditions.'],
      timing: 'Event-driven; often hours.', outputs: ['Pricing decision record', 'Board resolution'], verification: 'Values reconcile to the approved model; resolution recorded.',
      escalation: 'Material change in demand or disclosure → counsel.', support: 'Learning unit 9: Pricing and closing.',
    },
    exit: 'Authorized pricing, receipts/effectiveness, executed agreements and a counsel-reviewed closing plan. Pricing, trading and closing have separate dates.',
    tasks: [
      t('s7.model', 'Pricing scenarios, proceeds and dilution', { owner: 'cfo', reviewer: 'board', depends: ['s6.narrative'], tool: 'proceeds',
        what: 'Model price and size scenarios with primary/secondary split.', why: 'Directors need issuer cash and dilution per scenario.', needs: ['Price range', 'Share counts'],
        steps: ['Run the proceeds calculator.', 'Export scenarios.'], example: '2M primary + 1M secondary at $10 → issuer net $17.8M (illustrative 6% discount, $1M expenses).', check: 'CFO and board review.' }),
      t('s7.decision', 'Pricing decision and resolution', { owner: 'founder', reviewer: 'board', material: true, depends: ['s7.model', 's5.exchange'], form: 'pricing',
        what: 'Record the authorized price and structure.', why: 'Creates the binding internal authorization.', needs: ['Demand source', 'Model'],
        steps: ['Complete the Pricing Decision form.', 'Upload signed resolution.'], example: 'Priced at US$17 within revised range.', check: 'Values reconcile; director approval recorded.' }),
    ],
  },
  {
    n: 8, slug: 'closing', name: 'Close and begin trading', owner: 'Counsel', support: 'Issuer, underwriters, transfer agent, depository, exchange',
    sop: {
      id: 'SOP-CLS-08', version: '1.0', purpose: 'Satisfy every closing deliverable with evidence and reconcile funds and shares.',
      trigger: 'Pricing authorized and agreements executed.', responsibility: { accountable: 'Issuer counsel', contributors: ['CFO', 'Transfer agent'], reviewer: 'Counsel', approval: 'Authorized officers' },
      inputs: ['Closing checklist', 'Funds flow', 'Identifiers (CUSIP/ISIN)'], procedure: ['Track each closing item to evidence from the responsible party.', 'Verify wire instructions independently (call-back).', 'Reconcile shares issued with transfer agent.', 'Archive closing binder.'],
      timing: 'Per the actual transaction arrangements; no universal settlement assumption.', outputs: ['Closing binder', 'Funds reconciliation'],
      verification: 'Closing confirmation; reconciled funds and shares; exchange status evidence. Secondary proceeds never counted as company cash.',
      escalation: 'Changed wire instructions → stop and verify by phone with a known contact.', support: 'Learning unit 9.',
    },
    exit: 'Closing confirmed, reconciled, archived; post-closing tasks assigned; public reporting calendar activated.',
    tasks: [
      t('s8.checklist', 'Closing checklist with evidence', { owner: 'external_counsel', reviewer: 'counsel', material: true, depends: ['s7.decision'], form: 'closing',
        what: 'Every closing deliverable tracked to evidence.', why: 'An item is satisfied only with evidence from the responsible party.', needs: ['Checklist'],
        steps: ['Create Closing Item records.', 'Attach evidence.'], example: 'Comfort letter bring-down received from auditor.', check: 'Counsel confirms all items.' }),
      t('s8.funds', 'Funds flow and independent wire verification', { owner: 'cfo', reviewer: 'counsel', depends: ['s8.checklist'],
        what: 'Confirm amounts and verify bank instructions out-of-band.', why: 'Payment-redirection fraud targets closings.', needs: ['Funds flow memo'],
        steps: ['Call back a known contact.', 'Record verification.'], example: 'Changed instructions by email rejected until verified by phone.', check: 'Reconciliation approved.' }),
    ],
  },
  {
    n: 9, slug: 'first-90-days', name: 'Manage the first ninety days', owner: 'CFO, corporate secretary, counsel, IR', support: '',
    sop: {
      id: 'SOP-P90-09', version: '1.0', purpose: 'Meet first public obligations and stabilize recurring processes.', trigger: 'Closing.',
      responsibility: { accountable: 'CFO', contributors: ['Corporate secretary', 'IR'], reviewer: 'Counsel', approval: 'Board / audit committee' },
      inputs: ['Classification', 'Lock-up agreements', 'Reporting calendar'], procedure: ['Activate the obligations calendar.', 'Run first earnings process.', 'Maintain lock-up register from actual agreements.', 'Monitor use of proceeds.'],
      timing: 'Event-based deadlines from the reviewed classification.', outputs: ['First filings', '12-month operating plan'], verification: 'Required deadlines addressed with evidence.',
      escalation: 'Potential material event → disclosure triage.', support: 'Learning unit 10.',
    },
    exit: 'Deadlines addressed, rehearsal issues remediated, stable owners, and a 12-month plan.',
    tasks: [
      t('s9.calendar', 'Activate recurring obligations calendar', { owner: 'legal', reviewer: 'counsel', depends: ['s8.checklist'], form: 'obligation',
        what: 'Create recurring obligations based on the reviewed classification.', why: 'Obligations continue after the IPO project completes.', needs: ['Reviewed classification'],
        steps: ['Review generated obligations.', 'Confirm due-date rules.'], example: 'Canadian reporting issuer: interim filings and MD&A.', check: 'Counsel confirms rules (unverified rules stay provisional).' }),
      t('s9.lockups', 'Lock-up register from executed agreements', { owner: 'legal', reviewer: 'counsel', depends: ['s8.checklist'],
        what: 'Record each holder\'s restrictions from the actual signed documents.', why: 'Prevents inadvertent breaches.', needs: ['Lock-up agreements'], steps: ['Enter terms and expiry.'], example: '180-day lock-up with early release triggers.', check: 'Counsel reviews.' }),
    ],
  },
  {
    n: 10, slug: 'public-company', name: 'Operate as a public company', owner: 'Management and board', support: 'Continuing professional support',
    sop: {
      id: 'SOP-OPS-10', version: '1.0', purpose: 'Run recurring reporting, governance and disclosure obligations indefinitely.', trigger: 'Ongoing after listing.',
      responsibility: { accountable: 'CFO and corporate secretary', contributors: ['IR', 'Counsel'], reviewer: 'Audit committee', approval: 'Board' },
      inputs: ['Obligations', 'Classification changes'], procedure: ['Complete each recurring obligation with evidence.', 'Reassess classifications and relief annually and on events.', 'Maintain disclosure incident log.'],
      timing: 'Recurring.', outputs: ['Filings', 'Certifications support'], verification: 'Evidence of completion for each obligation.',
      escalation: 'Classification change creates new duties.', support: 'Learning unit 10.',
    },
    exit: 'This stage recurs indefinitely; the company does not graduate out of its obligations.',
    tasks: [
      t('s10.reassess', 'Annual classification reassessment', { owner: 'legal', reviewer: 'counsel', depends: ['s9.calendar'],
        what: 'Re-test FPI, filer, EGC/SRC and venture status.', why: 'Status changes create new duties.', needs: ['Float', 'Holder data'], steps: ['Update profile facts.', 'Counsel review.'], example: 'Loss of FPI status → domestic forms from the following fiscal year.', check: 'Counsel approval recorded.' }),
    ],
  },
];

export function stageBySlug(slug) { return STAGES.find((s) => s.slug === slug); }

/** Task templates applicable to a route summary (Canadian-only projects never get US-only tasks). */
export function tasksForRoutes(summary) {
  const out = [];
  for (const s of STAGES) {
    for (const task of s.tasks) {
      const r = task.routes;
      if (r.includes('all') || (r.includes('us') && summary.hasUS) || (r.includes('ca') && summary.hasCanadian)) out.push({ ...task, stage: s.n });
    }
  }
  return out;
}

/** Validates that task dependencies form an acyclic graph. */
export function assertAcyclic(templates) {
  const map = new Map(templates.map((x) => [x.key, x]));
  const state = new Map();
  const visit = (k, path) => {
    if (state.get(k) === 2) return;
    if (state.get(k) === 1) throw new Error(`Dependency cycle: ${[...path, k].join(' → ')}`);
    state.set(k, 1);
    for (const d of map.get(k)?.depends || []) if (map.has(d)) visit(d, [...path, k]);
    state.set(k, 2);
  };
  for (const k of map.keys()) visit(k, []);
  return true;
}
