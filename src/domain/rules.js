// Versioned rule catalogue. Each threshold carries a source ID (see content.js SOURCES), effective
// dates and a review status. Values marked 'unverified' must be confirmed against the current official
// text before they are shown as authoritative; the UI labels them accordingly.
export const RULE_STATES = ['proposed', 'adopted_not_effective', 'effective', 'superseded', 'expired'];

export const RULES = [
  {
    key: 'us.egc.revenue_threshold', version: '2022-09', state: 'effective', effectiveFrom: '2022-09-20', effectiveTo: null,
    value: { usd: '1235000000' }, source: 'R07', review: 'unverified',
    summary: 'Emerging growth company: total annual gross revenues below the inflation-adjusted threshold (other disqualifying events apply).',
  },
  {
    key: 'us.src.float_test', version: '2018-09', state: 'effective', effectiveFrom: '2018-09-10', effectiveTo: null,
    value: { floatUsd: '250000000', revenueUsd: '100000000', floatWithRevenueUsd: '700000000' }, source: 'R08', review: 'unverified',
    summary: 'Smaller reporting company: public float below $250M, or annual revenues below $100M and public float below $700M (or no float). Initial IPO determinations use estimated float.',
  },
  {
    key: 'us.accelerated_filer', version: '2020-04', state: 'effective', effectiveFrom: '2020-04-27', effectiveTo: null,
    value: { floatMinUsd: '75000000', floatLargeUsd: '700000000' }, source: 'R09', review: 'unverified',
    summary: 'Accelerated and large accelerated filer status depends on public float, reporting history and SRC revenue test; a newly public company is generally a non-accelerated filer for its first annual report. SOX 404(b) attestation does not depend on public float alone.',
  },
  {
    key: 'us.fpi.definition', version: 'rule-405', state: 'effective', effectiveFrom: '2008-12-04', effectiveTo: null,
    value: { usHolderPct: '50' }, source: 'R10', review: 'unverified',
    summary: 'A foreign issuer is an FPI unless more than 50% of voting securities are held by US residents AND any of: majority of executive officers or directors are US citizens or residents; more than 50% of assets in the US; business administered principally in the US.',
  },
  {
    key: 'us.mjds.eligibility', version: 'frm-16', state: 'effective', effectiveFrom: '1991-07-01', effectiveTo: null,
    value: { reportingMonths: 12, floatUsd: '75000000' }, source: 'R12', review: 'unverified',
    summary: 'MJDS registration forms generally require a Canadian FPI that has been reporting in Canada for at least 12 calendar months with public float of at least US$75M; a newly private Canadian company is not automatically eligible. Staff guidance: verify current form instructions.',
  },
  {
    key: 'us.fpi.section16', version: 'pre-hfia', state: 'superseded', effectiveFrom: '1934-01-01', effectiveTo: '2026-03-17',
    value: { exempt: true }, source: 'R10', review: 'reviewed',
    summary: 'Historical: FPI insiders were generally exempt from Section 16 reporting.',
  },
  {
    key: 'us.fpi.section16', version: 'hfia-2026', state: 'effective', effectiveFrom: '2026-03-18', effectiveTo: null,
    value: { exempt: false, reliefOrder: '34-104931' }, source: 'R13', review: 'unverified',
    summary: 'Holding Foreign Insiders Accountable Act: FPI directors and officers report under Section 16(a) from March 18 2026, subject to specific exemptive relief (including qualifying Canadian circumstances under Release 34-104931). Evaluate conditions per individual.',
  },
  {
    key: 'finra.5110', version: 'pre-26-19', state: 'effective', effectiveFrom: '2020-09-08', effectiveTo: '2026-12-20',
    value: {}, source: 'R23', review: 'unverified',
    summary: 'FINRA Rule 5110 corporate financing rule as in effect before the Notice 26-19 amendments.',
  },
  {
    key: 'finra.5110', version: 'notice-26-19', state: 'adopted_not_effective', effectiveFrom: '2026-12-21', effectiveTo: null,
    value: {}, source: 'R55', review: 'unverified',
    summary: 'Notice 26-19 amendments, effective December 21 2026. Transition treatment keys to the offering\'s initial required filing date; record that date and apply the relevant version for the duration of the offering.',
  },
  {
    key: 'ca.blanket_order_41_930', version: '2025-04', state: 'effective', effectiveFrom: '2025-04-17', effectiveTo: null,
    value: {}, source: 'R25', review: 'unverified',
    summary: 'Coordinated blanket orders affect historical financial statement requirements in IPO prospectuses, subject to conditions. Review relief in each relevant jurisdiction for the intended filing date; do not make three audited years universal.',
  },
];

/**
 * Select the rule version that applies on a given event date. Versions that are proposed, or adopted
 * but not yet effective on that date, are never applied as current law.
 */
export function ruleFor(key, asOf = new Date().toISOString().slice(0, 10)) {
  const candidates = RULES.filter((r) => r.key === key && r.effectiveFrom <= asOf && (!r.effectiveTo || r.effectiveTo >= asOf)
    && ['effective', 'adopted_not_effective', 'superseded', 'expired'].includes(r.state));
  // A rule adopted-but-not-effective becomes applicable once its commencement date has passed.
  return candidates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null;
}

export function pendingChanges(asOf = new Date().toISOString().slice(0, 10)) {
  return RULES.filter((r) => (r.state === 'adopted_not_effective' || r.state === 'proposed') && r.effectiveFrom > asOf);
}
