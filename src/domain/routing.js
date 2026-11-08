// Jurisdiction routing and issuer classification. Pure functions: given a company profile and an
// as-of date they return provisional, reviewable conclusions with inputs, unknowns, rule versions and
// required reviewers. Nothing here is a legal determination; every conclusion requires counsel review.
import { D, Dec } from './decimal.js';
import { ruleFor } from './rules.js';

export const CA_VENUES = { TSX: 'TSX', TSXV: 'TSX Venture Exchange', CSE: 'Canadian Securities Exchange', CBOE_CA: 'Cboe Canada' };
export const US_VENUES = { NASDAQ: 'Nasdaq', NYSE: 'NYSE', NYSE_AMERICAN: 'NYSE American' };
export const SPECIALIST_SECTORS = new Set(['banking_financial', 'cannabis_crypto', 'funds_structures', 'mining', 'oil_gas', 'life_sciences', 'real_estate']);

const yn = (v) => (v === 'yes' ? true : v === 'no' ? false : null);
const num = (v) => (v === '' || v === undefined || v === null ? null : Dec.parse(v));
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function assessment(key, label, conclusion, { inputs = {}, calc = '', unknowns = [], rule = null, notes = [], reviewer = 'counsel' }) {
  return {
    key, label, conclusion, inputs, calc, unknowns, notes, reviewer,
    ruleVersion: rule ? `${rule.key}@${rule.version}` : null,
    ruleSummary: rule?.summary || null,
    source: rule?.source || null,
    ruleReview: rule?.review || null,
    status: 'Provisional - waiting for professional review',
  };
}

export function fpiTest(p, asOf) {
  const rule = ruleFor('us.fpi.definition', asOf);
  const inc = p.incorporationCountry;
  if (inc === 'US') return assessment('fpi', 'US foreign private issuer (FPI) status', 'not_applicable', { inputs: { incorporationCountry: inc }, calc: 'US-incorporated issuers are domestic issuers.', rule });
  if (!inc) return assessment('fpi', 'US foreign private issuer (FPI) status', 'undetermined', { unknowns: ['incorporationCountry'], rule });
  const usPct = num(p.usHolderPct);
  const tests = { execsUSMajority: yn(p.execsUSMajority), assetsUSMajority: yn(p.assetsUSMajority), adminUS: yn(p.adminUS) };
  const unknowns = [];
  if (!usPct) unknowns.push('usHolderPct');
  const inputs = { incorporationCountry: inc, usHolderPct: p.usHolderPct ?? null, ...tests };
  if (usPct && usPct.cmp(rule.value.usHolderPct) <= 0) {
    return assessment('fpi', 'US foreign private issuer (FPI) status', 'likely', { inputs, calc: `US-resident holders ${usPct.toString()}% ≤ 50%: the business-contacts tests are not reached.`, rule, notes: ['FPI status is tested annually as of the last business day of the second fiscal quarter, and initially within 30 days before filing.'] });
  }
  const anyTrue = Object.values(tests).some((x) => x === true);
  const allFalse = Object.values(tests).every((x) => x === false);
  Object.entries(tests).forEach(([k, x]) => { if (x === null) unknowns.push(k); });
  if (usPct && anyTrue) return assessment('fpi', 'US foreign private issuer (FPI) status', 'unlikely', { inputs, calc: 'More than 50% US-resident holders and at least one US business-contact test is met.', rule, notes: ['A Canadian company that is not an FPI uses domestic forms (e.g. S-1, 10-K) - it is not assigned F-1 or F-10 simply because it is Canadian.'] });
  if (usPct && allFalse) return assessment('fpi', 'US foreign private issuer (FPI) status', 'likely', { inputs, calc: 'More than 50% US-resident holders, but none of the US business-contact tests is met.', rule });
  return assessment('fpi', 'US foreign private issuer (FPI) status', 'undetermined', { inputs, unknowns, calc: 'Insufficient facts to complete the Rule 405 test.', rule });
}

export function classify(p, asOf = new Date().toISOString().slice(0, 10)) {
  const venues = list(p.venues);
  const offering = list(p.offeringJurisdictions);
  const wantsCA = offering.includes('CA') || venues.some((v) => v in CA_VENUES);
  const wantsUS = offering.includes('US') || venues.some((v) => v in US_VENUES);
  const results = [];
  const revenue = num(p.revenueUsd);
  const floatUsd = num(p.expectedFloatUsd);

  const fpi = wantsUS ? fpiTest(p, asOf) : null;
  if (fpi) results.push(fpi);

  if (wantsUS) {
    const egcRule = ruleFor('us.egc.revenue_threshold', asOf);
    results.push(revenue
      ? assessment('egc', 'Emerging growth company (EGC)', revenue.cmp(egcRule.value.usd) < 0 ? 'likely' : 'unlikely', {
        inputs: { revenueUsd: revenue.toString() }, rule: egcRule,
        calc: `Revenue US$${revenue.format(0)} vs threshold US$${D(egcRule.value.usd).format(0)}.`,
        notes: ['Also disqualified by issuing more than US$1.07B of non-convertible debt in three years or becoming a large accelerated filer; verify current thresholds.'],
      })
      : assessment('egc', 'Emerging growth company (EGC)', 'undetermined', { unknowns: ['revenueUsd'], rule: egcRule }));

    const usesDomesticForms = p.incorporationCountry === 'US' || fpi?.conclusion === 'unlikely';
    const srcRule = ruleFor('us.src.float_test', asOf);
    if (!usesDomesticForms && fpi?.conclusion === 'likely') {
      results.push(assessment('src', 'Smaller reporting company (SRC)', 'not_applicable', { rule: srcRule, calc: 'An FPI using foreign-issuer forms is generally not eligible for SRC scaled disclosure unless it files on domestic forms with US GAAP financial statements.' }));
    } else if (floatUsd || revenue) {
      let c = 'undetermined';
      if (floatUsd && floatUsd.cmp(srcRule.value.floatUsd) < 0) c = 'likely';
      else if (revenue && revenue.cmp(srcRule.value.revenueUsd) < 0 && floatUsd && floatUsd.cmp(srcRule.value.floatWithRevenueUsd) < 0) c = 'likely';
      else if (floatUsd) c = 'unlikely';
      results.push(assessment('src', 'Smaller reporting company (SRC)', c, { inputs: { expectedFloatUsd: p.expectedFloatUsd, revenueUsd: p.revenueUsd }, rule: srcRule, calc: 'Float and revenue tests (stored separately from EGC and filer status).', unknowns: floatUsd ? [] : ['expectedFloatUsd'] }));
    } else {
      results.push(assessment('src', 'Smaller reporting company (SRC)', 'undetermined', { unknowns: ['expectedFloatUsd', 'revenueUsd'], rule: srcRule }));
    }

    const filerRule = ruleFor('us.accelerated_filer', asOf);
    results.push(assessment('filer', 'Exchange Act filer status', 'non_accelerated_initially', {
      rule: filerRule, calc: 'A newly public company is generally a non-accelerated filer until it has been reporting for 12 months and filed an annual report.',
      notes: ['SOX 404(a) management assessment typically begins with the second annual report; 404(b) auditor attestation depends on filer status and EGC relief - not on public float alone.'],
    }));

    const s16 = ruleFor('us.fpi.section16', asOf);
    if (fpi?.conclusion !== 'not_applicable') {
      results.push(assessment('section16', 'Director and officer Section 16 reporting', 'requires_individual_review', {
        rule: s16, calc: s16?.version === 'hfia-2026' ? 'Current HFIA framework applies; evaluate each insider and any qualifying relief.' : 'Pre-HFIA treatment.',
      }));
    }
  }

  if (wantsCA) {
    const caVenues = venues.filter((v) => v in CA_VENUES);
    const nonVenture = venues.some((v) => v === 'TSX' || v === 'CBOE_CA' || v in US_VENUES);
    results.push(assessment('venture', 'Canadian venture issuer status', caVenues.length === 0 ? 'undetermined' : nonVenture ? 'unlikely' : 'likely', {
      inputs: { venues },
      calc: 'Under NI 51-102 a venture issuer generally has no securities listed on the TSX, Cboe Canada, a US marketplace or certain other foreign marketplaces. Apply the definition in the specific rule.',
      unknowns: caVenues.length ? [] : ['venues'],
    }));
    results.push(assessment('principal_regulator', 'Principal regulator and distribution jurisdictions', 'requires_counsel', {
      inputs: { hqProvince: p.hqProvince || null },
      calc: `Generally determined by head office location under NP 11-202${p.hqProvince ? ` (head office: ${p.hqProvince})` : ''}; distribution jurisdictions depend on where securities are offered, not exchange location.`,
      unknowns: p.hqProvince ? [] : ['hqProvince'],
    }));
  }
  return results;
}

export function routes(p, asOf = new Date().toISOString().slice(0, 10)) {
  const venues = list(p.venues);
  const offering = list(p.offeringJurisdictions);
  const wantsCA = offering.includes('CA') || venues.some((v) => v in CA_VENUES);
  const wantsUS = offering.includes('US') || venues.some((v) => v in US_VENUES);
  const out = [];
  const fpi = wantsUS ? fpiTest(p, asOf) : null;
  const add = (key, name, status, reasons, workflow) => out.push({ key, name, status, reasons, workflow });

  if (wantsCA) {
    add('ca_conventional', 'Canadian conventional IPO', 'potential',
      ['Canadian offering or listing selected.', 'Identify the principal regulator and distribution jurisdictions with counsel; exchange location alone does not determine where to file.'],
      'Provincial/territorial prospectus (NI 41-101), exchange application, underwriting, closing, continuous disclosure (NI 51-102).');
  }
  if (wantsUS) {
    if (p.incorporationCountry === 'US') {
      add('us_domestic', 'US domestic conventional IPO', 'potential', ['US-incorporated issuer seeking a US offering or listing.'],
        'Form S-1 with applicable Regulation S-K and S-X; SEC review; FINRA filing where applicable; exchange application; Exchange Act reporting.');
    } else if (fpi.conclusion === 'likely') {
      add('us_fpi', 'Foreign private issuer in the US', 'potential', ['Provisional FPI assessment is "likely" - pending counsel review.'],
        'Evaluate Form F-1 and related requirements; Form 20-F / 6-K reporting; IFRS as issued by the IASB may be acceptable - confirm the applicable framework.');
    } else if (fpi.conclusion === 'unlikely') {
      add('us_domestic', 'US domestic forms (non-FPI foreign issuer)', 'potential', ['Provisional FPI assessment is "unlikely"; a non-FPI foreign issuer uses domestic forms.'],
        'Form S-1, US GAAP financial statements, Forms 10-K / 10-Q / 8-K after listing.');
    } else {
      add('us_fpi', 'US route - FPI assessment required', 'requires_assessment', ['FPI status cannot be determined from the facts provided.', `Missing: ${fpi.unknowns.join(', ') || 'see assessment'}.`],
        'Complete the FPI questionnaire with counsel before selecting F-1 or S-1.');
    }
    if (p.incorporationCountry === 'CA') {
      const rule = ruleFor('us.mjds.eligibility', asOf);
      const months = num(p.canadianReportingMonths);
      const fl = num(p.expectedFloatUsd);
      const eligibleFacts = months && months.cmp(rule.value.reportingMonths) >= 0 && fl && fl.cmp(rule.value.floatUsd) >= 0 && fpi.conclusion === 'likely';
      add('mjds', 'Canadian MJDS route (F-10 / 40-F)', eligibleFacts ? 'potential' : 'not_currently_indicated',
        [eligibleFacts ? 'Facts provided are consistent with MJDS eligibility - verify F-10 and 40-F conditions independently.' : 'MJDS generally requires 12 months of Canadian reporting history and minimum public float; a company that is not yet a Canadian reporting issuer is not automatically eligible.',
          `Rule ${rule.key}@${rule.version} (${rule.source}, review: ${rule.review}).`],
        'Canadian disclosure with applicable US MJDS forms and conditions.');
    }
  }
  if (wantsCA && wantsUS) {
    add('concurrent', 'Concurrent Canadian and US transaction', 'potential', ['Both Canadian and US offering or listing selected.'],
      'Coordinated disclosure, currencies, selling restrictions, approvals, intermediaries and settlement; maintain both sets of obligations and a conflict-resolution log.');
  }
  if (!wantsCA && !wantsUS) {
    add('undetermined', 'Route not yet selected', 'requires_assessment', ['Select offering jurisdictions or candidate venues to generate a route comparison.'], 'Complete onboarding: IPO objectives.');
  }
  if (SPECIALIST_SECTORS.has(p.sector)) {
    add('specialist', 'Specialist sector assessment', 'requires_assessment', ['This sector requires additional reviewed requirements before workflows are treated as complete.'], 'Sector module with specialist counsel and technical experts.');
  }
  return out;
}

export function routeSummary(p, asOf) {
  const r = routes(p, asOf);
  return {
    asOf: asOf || new Date().toISOString().slice(0, 10),
    routes: r,
    classifications: classify(p, asOf),
    hasCanadian: r.some((x) => ['ca_conventional', 'concurrent', 'mjds'].includes(x.key) && x.status !== 'not_applicable'),
    hasUS: r.some((x) => ['us_domestic', 'us_fpi', 'mjds', 'concurrent'].includes(x.key)),
  };
}
