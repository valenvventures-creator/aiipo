// Unit tests for deterministic engines and rules (spec Section 26 acceptance tests noted as AT#).
process.env.NODE_ENV = 'test';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { D } from '../src/domain/decimal.js';
import { offeringProceeds, ownership, ntbvDilution, runway, reconcileUses, toCsv } from '../src/domain/finance.js';
import { routes, classify, routeSummary } from '../src/domain/routing.js';
import { ruleFor } from '../src/domain/rules.js';
import { tasksForRoutes, assertAcyclic, STAGES } from '../src/domain/stages.js';
import { validateForm, statusGuards } from '../src/domain/forms.js';
import { hotp, verifyTotp, generateSecret, base32Decode, base32Encode } from '../src/security/totp.js';
import { encrypt, decrypt, hashPassword, verifyPassword } from '../src/security/crypto.js';
import { canRead, can } from '../src/security/permissions.js';
import { passwordProblems } from '../src/security/auth.js';
import { esc, html, toHtml } from '../src/http.js';

test('decimal arithmetic is exact and rounds half-even', () => {
  assert.equal(D('0.1').add('0.2').toString(), '0.3');
  assert.equal(D('2.345').round(2).toString(), '2.34');
  assert.equal(D('2.355').round(2).toString(), '2.36');
  assert.equal(D('1').div(3).mul(3).round(10).toString(), '1');
  assert.equal(D('1234567.891').format(2), '1,234,567.89');
  assert.throws(() => D('abc'));
});

test('AT8: worked proceeds example; secondary sales add no shares or company cash', () => {
  const r = offeringProceeds({ preShares: '10000000', primaryShares: '2000000', secondaryShares: '1000000', price: '10', discountPct: '6', issuerExpenses: '1000000' });
  assert.equal(r.base.issuerGross.toString(), '20000000');
  assert.equal(r.base.sellerGross.toString(), '10000000');
  assert.equal(r.base.postShares.toString(), '12000000');
  assert.equal(r.base.issuerNet.toString(), '17800000');
  assert.ok(r.base.nonParticipatingRetention.eq(D(10).div(12)));
  const noSecondary = offeringProceeds({ preShares: '10000000', primaryShares: '2000000', secondaryShares: '0', price: '10', discountPct: '6', issuerExpenses: '1000000' });
  assert.equal(noSecondary.base.issuerNet.toString(), r.base.issuerNet.toString());
  assert.equal(noSecondary.base.postShares.toString(), r.base.postShares.toString());
});

test('AT9: over-allotment modelled separately and without rounding loss', () => {
  const r = offeringProceeds({ preShares: '10000000', primaryShares: '2000000', secondaryShares: '1000000', price: '10.015', discountPct: '6', issuerExpenses: '1000000', optionPrimary: '300000', optionSecondary: '150000' });
  assert.equal(r.withOption.primaryShares.toString(), '2300000');
  assert.equal(r.withOption.issuerGross.toString(), '23034500');
  assert.equal(r.base.issuerGross.toString(), '20030000');
  assert.notEqual(r.base.issuerNet.toString(), r.withOption.issuerNet.toString());
});

test('seller expenses borne by company reduce company net', () => {
  const a = offeringProceeds({ preShares: '100', primaryShares: '10', secondaryShares: '10', price: '10', discountPct: '0', issuerExpenses: '0', sellerExpenses: '5', sellerExpensesBorneBy: 'issuer' });
  assert.equal(a.base.issuerNet.toString(), '95');
  assert.equal(a.base.sellerNet.toString(), '100');
});

test('proceeds input validation', () => {
  assert.throws(() => offeringProceeds({ preShares: '0', primaryShares: '1', secondaryShares: '0', price: '1', discountPct: '1', issuerExpenses: '0' }), (e) => Boolean(e.fields.preShares));
  assert.throws(() => offeringProceeds({ preShares: '1', primaryShares: '1', secondaryShares: '0', price: '1', discountPct: '120', issuerExpenses: '0' }), (e) => Boolean(e.fields.discountPct));
});

test('ownership simulator separates economic and voting percentages', () => {
  const o = ownership({ holders: [{ name: 'Founder', cls: 'B', shares: '6000000', votesPerShare: '10' }, { name: 'Fund', shares: '4000000', votesPerShare: '1', sold: '1000000' }], primaryShares: '2000000' });
  const f = o.table.find((x) => x.name === 'Founder');
  assert.equal(f.postEconomic.round(2).toString(), '50');
  assert.ok(f.postVoting.cmp(90) > 0);
  assert.equal(o.postShares.toString(), '12000000');
});

test('NTBV dilution', () => {
  const n = ntbvDilution({ preNtbv: '15000000', preShares: '10000000', newShares: '2000000', price: '10', netProceeds: '17800000' });
  assert.equal(n.postNtbvPs.toString(4), '2.7333');
  assert.equal(n.dilutionToNew.toString(4), '7.2667');
});

test('AT12: delayed IPO increases cash need; abandoned scenario still bears readiness fees', () => {
  const r = runway({ cash: '9000000', burn: '650000', readinessFeesMonthly: '120000', monthsToIpo: '9', netProceeds: '17800000', publicCoAnnualCost: '2500000', delayMonths: '6', downsizePct: '60', abandonmentCosts: '900000' });
  assert.ok(r.scenarios.delayed.zeroMonth !== null);
  assert.ok(r.scenarios.delayed.zeroMonth < r.scenarios.delayed.closeMonth || r.scenarios.delayed.endCash.cmp(r.scenarios.completed.endCash) < 0);
  assert.ok(r.scenarios.abandoned.endCash.cmp(r.scenarios.completed.endCash) < 0);
  assert.equal(r.scenarios.abandoned.series[0].cash.toString(), '8230000');
});

test('use-of-proceeds reconciliation and form rules', () => {
  assert.ok(reconcileUses('100', [{ amount: '60' }, { amount: '40' }]).reconciled);
  const bad = validateForm('uop', { issuerGross: '100', discounts: '6', issuerCosts: '4', uses: 'Growth | 50\nDebt | 30' });
  assert.match(bad.errors.uses, /reconcile/);
  const sec = validateForm('uop', { issuerGross: '100', discounts: '0', issuerCosts: '0', uses: 'Secondary seller payout | 100' });
  assert.match(sec.errors.uses, /not company cash/);
  const good = validateForm('uop', { issuerGross: '100', discounts: '6', issuerCosts: '4', uses: 'Growth | 60\nDebt | 30' });
  assert.deepEqual(good.errors, {});
});

test('financial period: end after start; "Audited" requires report evidence', () => {
  assert.ok(validateForm('period', { entity: 'X', start: '2025-01-01', end: '2024-12-31' }).errors.end);
  assert.ok(validateForm('period', { entity: 'X', start: '2025-01-01', end: '2025-12-31', auditStatus: 'Audited' }).errors.auditStatus);
});

test('AT1: Canadian-only project gets Canadian workflow, not a US checklist', () => {
  const s = routeSummary({ incorporationCountry: 'CA', venues: ['TSXV'], offeringJurisdictions: ['CA'] });
  assert.deepEqual(s.routes.map((r) => r.key), ['ca_conventional']);
  const keys = tasksForRoutes(s).map((t) => t.key);
  assert.ok(!keys.includes('s5.finra'));
});

test('AT2: Canadian company seeking US listing receives an FPI assessment, not automatic F-1/F-10', () => {
  const unknown = routes({ incorporationCountry: 'CA', venues: ['NASDAQ'] });
  assert.ok(unknown.find((r) => r.key === 'us_fpi' && r.status === 'requires_assessment'));
  assert.equal(unknown.find((r) => r.key === 'mjds').status, 'not_currently_indicated');
  const nonFpi = routes({ incorporationCountry: 'CA', venues: ['NASDAQ'], usHolderPct: '70', execsUSMajority: 'yes' });
  assert.ok(nonFpi.find((r) => r.key === 'us_domestic'));
  const fpi = classify({ incorporationCountry: 'CA', venues: ['NASDAQ'], usHolderPct: '20' }).find((c) => c.key === 'fpi');
  assert.equal(fpi.conclusion, 'likely');
});

test('AT3: EGC, SRC and filer status are stored separately', () => {
  const c = classify({ incorporationCountry: 'US', venues: ['NASDAQ'], revenueUsd: '50000000', expectedFloatUsd: '200000000' });
  const keys = c.map((x) => x.key);
  for (const k of ['egc', 'src', 'filer']) assert.ok(keys.includes(k));
  assert.equal(c.find((x) => x.key === 'egc').conclusion, 'likely');
  assert.equal(c.find((x) => x.key === 'src').conclusion, 'likely');
  assert.match(c.find((x) => x.key === 'filer').notes.join(' '), /not on public float alone/);
});

test('AT13: adopted-but-not-effective rule is not applied before commencement', () => {
  assert.equal(ruleFor('finra.5110', '2026-11-08').version, 'pre-26-19');
  assert.equal(ruleFor('finra.5110', '2026-12-21').version, 'notice-26-19');
});

test('AT14: FPI Section 16 follows current HFIA rules', () => {
  assert.equal(ruleFor('us.fpi.section16', '2026-01-01').version, 'pre-hfia');
  assert.equal(ruleFor('us.fpi.section16', '2026-11-08').version, 'hfia-2026');
});

test('stage dependency graph is acyclic and every stage has a populated SOP', () => {
  const all = STAGES.flatMap((s) => s.tasks.map((t) => ({ ...t, stage: s.n })));
  assert.ok(assertAcyclic(all));
  assert.throws(() => assertAcyclic([{ key: 'a', depends: ['b'] }, { key: 'b', depends: ['a'] }]));
  for (const s of STAGES) for (const k of ['purpose', 'trigger', 'responsibility', 'inputs', 'procedure', 'timing', 'outputs', 'verification', 'escalation', 'support']) assert.ok(s.sop[k], `${s.slug} ${k}`);
});

test('AT7: prefiling retail promotion is held; institutional TTW proceeds to review', () => {
  assert.equal(statusGuards('communication', { audience: 'Retail / general public', stage: 'Pre-filing', type: 'Press release' }, { action: 'submit' }).status, 'Held for counsel review');
  assert.equal(statusGuards('communication', { audience: 'Institutional / accredited investors', stage: 'Pre-filing', type: 'Testing the waters' }, { action: 'submit' }).status, 'Waiting for review');
});

test('approval guards: unsupported numeric claim, critical issue self-approval, closing evidence', () => {
  assert.ok(statusGuards('claim', { claim: 'x', numeric: 'Yes' }, { action: 'approve' }).error);
  assert.ok(statusGuards('issue', { workstream: 'Strategy', finding: 'f', severity: 'Critical' }, { action: 'approve', actorId: 'u', creatorId: 'u' }).error);
  assert.ok(statusGuards('closing', { deliverable: 'd', party: 'p' }, { action: 'approve' }).error);
  assert.ok(statusGuards('obligation', {}, { action: 'close' }).error);
});

test('TOTP matches RFC 6238 test vector and blocks replay', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(hotp(secret, Math.floor(59 / 30)), '287082');
  const s = generateSecret();
  const now = Date.now();
  const code = hotp(s, Math.floor(now / 30000));
  const step = verifyTotp(s, code, { now });
  assert.notEqual(step, null);
  assert.equal(verifyTotp(s, code, { now, lastUsedStep: step }), null);
  assert.equal(base32Decode(base32Encode(Buffer.from('hi'))).toString(), 'hi');
});

test('encryption is authenticated and bound to context', () => {
  const c = encrypt('secret', 'org:a');
  assert.equal(decrypt(c, 'org:a'), 'secret');
  assert.throws(() => decrypt(c, 'org:b'));
  const tampered = c.slice(0, -2) + (c.endsWith('A') ? 'B' : 'A') + c.slice(-1);
  assert.throws(() => decrypt(tampered, 'org:a'));
});

test('password hashing and policy', () => {
  const h = hashPassword('Correct horse 42');
  assert.ok(verifyPassword('Correct horse 42', h));
  assert.ok(!verifyPassword('wrong', h));
  assert.ok(passwordProblems('short1').length);
  assert.ok(passwordProblems('allletterslong').length);
  assert.ok(passwordProblems('password123').length);
  assert.deepEqual(passwordProblems('Ledger-route-2027'), []);
});

test('permissions: PR guest cannot read privileged; MFA required for MNPI', () => {
  assert.ok(!canRead({ role: 'ir_pr', mfaSatisfied: true }, 'privileged'));
  assert.ok(!canRead({ role: 'guest', mfaSatisfied: true }, 'confidential'));
  assert.ok(!canRead({ role: 'founder', mfaSatisfied: false }, 'mnpi'));
  assert.ok(canRead({ role: 'founder', mfaSatisfied: true }, 'mnpi'));
  assert.ok(!can({ role: 'guest' }, 'document.download'));
});

test('HTML escaping and CSV injection guard', () => {
  assert.equal(esc('<script>"'), '&#60;script&#62;&#34;');
  assert.ok(!toHtml(html`<p>${'<img onerror=x>'}</p>`).includes('<img'));
  assert.match(toCsv([['=HYPERLINK("x")', '-5', '@cmd']]), /^"'=HYPERLINK.*,-5,'@cmd/);
  assert.match(toCsv([['-5']]), /^-5/);
});
