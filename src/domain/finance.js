// Deterministic financial models. Each model returns inputs, formulas, assumptions and results so the
// output can be audited, exported and reproduced. The AI guide may explain these results but never
// computes authoritative figures itself.
import { D, Dec, sum } from './decimal.js';

export const MODEL_VERSION = 'fin-models 1.0.0';

function need(inputs, keys) {
  const errors = {};
  const out = {};
  for (const [k, { label, min = '0', allowZero = true, optional = false, max }] of Object.entries(keys)) {
    const raw = inputs[k];
    if ((raw === undefined || raw === '' || raw === null) && optional) { out[k] = null; continue; }
    const v = Dec.parse(raw);
    if (!v) { errors[k] = `${label}: enter a number.`; continue; }
    if (v.cmp(min) < 0) errors[k] = `${label}: must be at least ${min}.`;
    else if (!allowZero && v.isZero()) errors[k] = `${label}: must be greater than zero.`;
    else if (max !== undefined && v.cmp(max) > 0) errors[k] = `${label}: must be at most ${max}.`;
    out[k] = v;
  }
  if (Object.keys(errors).length) { const e = new Error('Invalid inputs'); e.fields = errors; throw e; }
  return out;
}

/**
 * Offering proceeds: separates issuer (primary) and selling-holder (secondary) components and the
 * over-allotment option. Secondary sales never add issued shares or issuer cash.
 */
export function offeringProceeds(inputs) {
  const v = need(inputs, {
    preShares: { label: 'Pre-offering shares outstanding', allowZero: false },
    primaryShares: { label: 'New shares issued by the company' },
    secondaryShares: { label: 'Shares sold by existing holders' },
    price: { label: 'Offering price per share', allowZero: false },
    discountPct: { label: 'Underwriting discount (%)', max: '100' },
    issuerExpenses: { label: 'Company offering expenses' },
    sellerExpenses: { label: 'Selling holder expenses', optional: true },
    optionPrimary: { label: 'Over-allotment option: new company shares', optional: true },
    optionSecondary: { label: 'Over-allotment option: selling holder shares', optional: true },
  });
  const currency = /^(CAD|USD)$/.test(inputs.currency) ? inputs.currency : 'USD';
  const sellerBears = inputs.sellerExpensesBorneBy !== 'issuer';
  const exercised = inputs.optionExercised === 'yes' || inputs.optionExercised === true;
  const rate = v.discountPct.div(100);
  const sellerExp = v.sellerExpenses || D(0);
  const optP = v.optionPrimary || D(0);
  const optS = v.optionSecondary || D(0);

  const build = (withOption) => {
    const pShares = v.primaryShares.add(withOption ? optP : 0);
    const sShares = v.secondaryShares.add(withOption ? optS : 0);
    const issuerGross = pShares.mul(v.price);
    const issuerDiscount = issuerGross.mul(rate);
    const issuerExpenses = v.issuerExpenses.add(sellerBears ? 0 : sellerExp);
    const issuerNet = issuerGross.sub(issuerDiscount).sub(issuerExpenses);
    const sellerGross = sShares.mul(v.price);
    const sellerDiscount = sellerGross.mul(rate);
    const sellerNet = sellerGross.sub(sellerDiscount).sub(sellerBears ? sellerExp : 0);
    const postShares = v.preShares.add(pShares);
    return {
      primaryShares: pShares, secondaryShares: sShares, totalSharesOffered: pShares.add(sShares),
      issuerGross, issuerDiscount, issuerExpenses, issuerNet,
      sellerGross, sellerDiscount, sellerNet,
      totalDealSize: issuerGross.add(sellerGross),
      postShares,
      nonParticipatingRetention: v.preShares.div(postShares),
    };
  };
  const base = build(false);
  const withOption = build(true);
  const warnings = [];
  if (base.issuerNet.isNeg()) warnings.push('Company net proceeds are negative under these assumptions.');
  if (v.primaryShares.isZero() && v.secondaryShares.cmp(0) > 0) warnings.push('This is an all-secondary offering: the company receives no offering cash.');
  return {
    model: 'offering-proceeds', modelVersion: MODEL_VERSION, currency, calculatedAt: new Date().toISOString(),
    inputs: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x?.toString() ?? null])),
    assumptions: [
      `Underwriting discount of ${v.discountPct.toString()}% is a calculation assumption, not a market fee recommendation.`,
      sellerBears ? 'Selling holders bear their own discount and expenses.' : 'The company bears selling-holder expenses (reduces company net proceeds).',
      'Excludes taxes, currency conversion and other adjustments.',
      exercised ? 'Over-allotment option shown as exercised in the selected scenario.' : 'Over-allotment option shown separately; not assumed exercised.',
    ],
    formulas: {
      issuerGross: 'company shares × price',
      issuerNet: 'issuer gross − underwriting discount on company shares − company expenses',
      sellerGross: 'selling-holder shares × price (never company cash)',
      postShares: 'pre-offering shares + new company shares (secondary shares are already outstanding)',
      nonParticipatingRetention: 'pre-offering shares ÷ post-offering shares',
    },
    base, withOption, selected: exercised ? 'withOption' : 'base', warnings,
  };
}

/** Ownership and voting simulator across share classes, primary issuance and secondary transfers. */
export function ownership({ holders = [], primaryShares = '0', newInvestorVotesPerShare = '1' }) {
  const rows = holders.filter((h) => h && h.name).map((h) => ({
    name: String(h.name).slice(0, 80),
    cls: String(h.cls || 'Common').slice(0, 40),
    shares: D(h.shares || 0),
    sold: D(h.sold || 0),
    votes: D(h.votesPerShare || 1),
  }));
  for (const r of rows) if (r.sold.cmp(r.shares) > 0) throw Object.assign(new Error('Invalid inputs'), { fields: { holders: `${r.name} cannot sell more shares than held.` } });
  const p = D(primaryShares);
  const sold = sum(rows.map((r) => r.sold));
  const preShares = sum(rows.map((r) => r.shares));
  const preVotes = sum(rows.map((r) => r.shares.mul(r.votes)));
  const nv = D(newInvestorVotesPerShare);
  const postShares = preShares.add(p);
  const postVotes = sum(rows.map((r) => r.shares.sub(r.sold).mul(r.votes))).add(p.add(sold).mul(nv));
  const pct = (a, b) => (b.isZero() ? D(0) : a.div(b).mul(100));
  const table = rows.map((r) => ({
    name: r.name, cls: r.cls,
    preShares: r.shares, preEconomic: pct(r.shares, preShares), preVoting: pct(r.shares.mul(r.votes), preVotes),
    postShares: r.shares.sub(r.sold), postEconomic: pct(r.shares.sub(r.sold), postShares), postVoting: pct(r.shares.sub(r.sold).mul(r.votes), postVotes),
  }));
  table.push({
    name: 'New public investors', cls: `Offered (${nv.toString()} vote/sh)`,
    preShares: D(0), preEconomic: D(0), preVoting: D(0),
    postShares: p.add(sold), postEconomic: pct(p.add(sold), postShares), postVoting: pct(p.add(sold).mul(nv), postVotes),
  });
  return {
    model: 'ownership', modelVersion: MODEL_VERSION, preShares, postShares, preVotes, postVotes, table,
    notes: ['Economic and voting percentages are different measures; multiple-vote classes require counsel review (e.g. coattail provisions in Canada, exchange rules in the US).',
      'Basic shares only. Options, warrants and convertibles are not included unless entered as holders; state fully diluted methodology separately.'],
  };
}

/** Net tangible book value dilution per share to new investors. */
export function ntbvDilution(inputs) {
  const v = need(inputs, {
    preNtbv: { label: 'Pre-offering net tangible book value', min: '-1000000000000000' },
    preShares: { label: 'Pre-offering shares', allowZero: false },
    newShares: { label: 'New company shares', allowZero: false },
    price: { label: 'Offering price', allowZero: false },
    netProceeds: { label: 'Company net proceeds', min: '-1000000000000000' },
  });
  const preNtbvPs = v.preNtbv.div(v.preShares);
  const postNtbv = v.preNtbv.add(v.netProceeds);
  const postShares = v.preShares.add(v.newShares);
  const postNtbvPs = postNtbv.div(postShares);
  return {
    model: 'ntbv-dilution', modelVersion: MODEL_VERSION,
    preNtbvPs, postNtbvPs, increaseToExisting: postNtbvPs.sub(preNtbvPs),
    dilutionToNew: v.price.sub(postNtbvPs), dilutionPct: v.price.sub(postNtbvPs).div(v.price).mul(100),
    notes: ['NTBV dilution is distinct from ownership dilution, voting dilution and EPS effects.', 'Counsel and auditors determine the presentation required in the offering document.'],
  };
}

/** Monthly cash forecast under completed, delayed, downsized and abandoned IPO scenarios. */
export function runway(inputs) {
  const v = need(inputs, {
    cash: { label: 'Current cash' },
    burn: { label: 'Monthly operating burn' },
    readinessFeesMonthly: { label: 'Readiness professional fees per month' },
    monthsToIpo: { label: 'Months to expected closing', allowZero: false, max: '60' },
    netProceeds: { label: 'Expected company net proceeds' },
    publicCoAnnualCost: { label: 'Incremental public-company cost per year' },
    delayMonths: { label: 'Delay scenario: extra months', max: '36' },
    downsizePct: { label: 'Downsized scenario: % of base proceeds', max: '100' },
    abandonmentCosts: { label: 'Costs incurred if abandoned' },
  });
  const horizon = 36;
  const pubMonthly = v.publicCoAnnualCost.div(12);
  const scenarios = {
    completed: { closeMonth: Number(v.monthsToIpo.toString(0)), proceeds: v.netProceeds },
    delayed: { closeMonth: Number(v.monthsToIpo.add(v.delayMonths).toString(0)), proceeds: v.netProceeds },
    downsized: { closeMonth: Number(v.monthsToIpo.toString(0)), proceeds: v.netProceeds.mul(v.downsizePct.div(100)) },
    abandoned: { closeMonth: Number(v.monthsToIpo.toString(0)), proceeds: null },
  };
  const out = {};
  for (const [name, s] of Object.entries(scenarios)) {
    let cash = v.cash;
    let zeroMonth = null;
    const series = [];
    for (let m = 1; m <= horizon; m++) {
      let delta = v.burn.neg();
      if (m <= s.closeMonth) delta = delta.sub(v.readinessFeesMonthly);
      if (m === s.closeMonth) delta = s.proceeds ? delta.add(s.proceeds) : delta.sub(v.abandonmentCosts);
      if (s.proceeds && m > s.closeMonth) delta = delta.sub(pubMonthly);
      cash = cash.add(delta);
      series.push({ month: m, cash });
      if (zeroMonth === null && cash.isNeg()) zeroMonth = m;
    }
    out[name] = { ...s, series, zeroMonth, endCash: cash };
  }
  return {
    model: 'runway', modelVersion: MODEL_VERSION, horizon, scenarios: out,
    notes: ['Readiness fees are incurred whether or not an offering closes.', 'Public-company costs begin after closing.', 'Legal deadlines are independent of these internal targets.'],
  };
}

/** Use-of-proceeds reconciliation: planned uses must equal company net proceeds; secondary cash excluded. */
export function reconcileUses(netProceeds, uses) {
  const total = sum(uses.map((u) => D(u.amount || 0)));
  const diff = D(netProceeds).sub(total);
  return { total, diff, reconciled: diff.isZero() };
}

export function convert(amount, rate) {
  return D(amount).mul(D(rate));
}

export function toCsv(rows) {
  const cell = (c) => {
    let s = c instanceof Dec ? c.toString() : String(c ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
