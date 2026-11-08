// Progressive onboarding schema (Section 6). Any answer may be "unknown"; unknowns become targeted questions.
import { INDUSTRIES } from './content.js';
import { CA_VENUES, US_VENUES } from './routing.js';

const PROVINCES = ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Québec', 'Saskatchewan', 'Yukon'];
const YNU = [['yes', 'Yes'], ['no', 'No'], ['', 'Unknown / not yet available']];

export const SECTIONS = [
  { key: 'identity', title: 'Company identity', fields: [
    ['legalName', 'Legal name', 'text'], ['operatingName', 'Operating name', 'text'], ['entityType', 'Entity type', 'text'],
    ['incorporationCountry', 'Country of incorporation', 'select', [['CA', 'Canada'], ['US', 'United States'], ['OTHER', 'Other'], ['', 'Unknown']]],
    ['incorporationJurisdiction', 'Province / state of incorporation', 'text'], ['incorporationDate', 'Incorporation date', 'date'],
    ['hqProvince', 'Head office province (if in Canada)', 'select', [['', 'Not in Canada / unknown'], ...PROVINCES.map((p) => [p, p])]],
    ['hqCountry', 'Head office country', 'text'], ['website', 'Website', 'text'],
    ['sector', 'Industry', 'select', Object.entries(INDUSTRIES).map(([k, [l]]) => [k, l])], ['subindustry', 'Sub-industry', 'text'],
    ['fiscalYearEnd', 'Fiscal year-end (MM-DD)', 'text'], ['functionalCurrency', 'Functional currency', 'select', [['CAD', 'CAD'], ['USD', 'USD'], ['OTHER', 'Other'], ['', 'Unknown']]],
    ['operatingCountries', 'Key operating countries', 'text'], ['regulatedActivities', 'Regulated activities', 'textarea'],
  ] },
  { key: 'objectives', title: 'IPO objectives', fields: [
    ['targetCapital', 'Target primary capital', 'decimal'], ['currency', 'Currency', 'select', [['CAD', 'CAD'], ['USD', 'USD']]],
    ['secondarySales', 'Potential secondary sales by holders', 'textarea'], ['useOfProceeds', 'Intended use of proceeds', 'textarea'],
    ['offeringJurisdictions', 'Where securities would be offered', 'multi', [['CA', 'Canada'], ['US', 'United States']]],
    ['venues', 'Candidate listing venues', 'multi', [...Object.entries(CA_VENUES), ...Object.entries(US_VENUES)]],
    ['timing', 'Target timing range', 'text'], ['founderLiquidity', 'Founder liquidity objectives', 'textarea'], ['control', 'Control preferences', 'textarea'],
    ['reasons', 'Reasons for considering an IPO', 'textarea'],
  ] },
  { key: 'financial', title: 'Financial position', fields: [
    ['revenueUsd', 'Last fiscal year revenue (USD equivalent)', 'decimal'], ['profitability', 'Revenue and profitability trend', 'textarea'],
    ['accountingBasis', 'Accounting basis', 'text'], ['yearsOperating', 'Years of operations', 'decimal'], ['auditStatus', 'Auditor and audit status', 'text'],
    ['acquisitions', 'Acquisitions and disposals', 'textarea'], ['debt', 'Debt and covenants', 'textarea'], ['cash', 'Cash', 'decimal'], ['monthlyBurn', 'Monthly burn', 'decimal'],
    ['forecast', 'Forecast available?', 'select', YNU], ['weaknesses', 'Known reporting weaknesses', 'textarea'],
    ['expectedFloatUsd', 'Estimated post-IPO public float (USD)', 'decimal'],
  ] },
  { key: 'ownership', title: 'Ownership', restricted: true, fields: [
    ['shareClasses', 'Share classes and voting rights', 'textarea'], ['beneficialOwners', 'Significant beneficial owners', 'textarea'],
    ['convertibles', 'Options, warrants, SAFEs and convertibles', 'textarea'], ['shareholderAgreements', 'Shareholder agreements and transfer restrictions', 'textarea'],
    ['usHolderPct', '% of voting securities held by US residents', 'decimal'], ['execsUSMajority', 'Are a majority of executive officers or directors US citizens or residents?', 'select', YNU],
    ['assetsUSMajority', 'Are more than 50% of assets located in the US?', 'select', YNU], ['adminUS', 'Is the business administered principally in the US?', 'select', YNU],
    ['canadianReportingMonths', 'Months as a Canadian reporting issuer (0 if none)', 'decimal'], ['relatedParties', 'Related parties', 'textarea'],
  ] },
  { key: 'governance', title: 'Governance and legal', fields: [
    ['board', 'Board composition', 'textarea'], ['independentDirectors', 'Number of independent directors', 'decimal'], ['litigation', 'Material litigation', 'textarea'],
    ['ip', 'IP ownership status', 'textarea'], ['privacyIncidents', 'Privacy or cybersecurity incidents', 'textarea'], ['materialContracts', 'Material contracts', 'textarea'],
  ] },
  { key: 'team', title: 'Team and resources', fields: [
    ['cfo', 'CFO', 'text'], ['controller', 'Controller', 'text'], ['legalLead', 'Legal lead', 'text'], ['pm', 'Project manager', 'text'], ['irContact', 'IR / PR contact', 'text'],
    ['advisorsEngaged', 'Advisors already engaged', 'textarea'], ['readinessBudget', 'Readiness budget available', 'decimal'], ['systems', 'Existing systems (ERP, cap table, etc.)', 'textarea'],
    ['introductions', 'Professional introductions wanted', 'textarea'],
  ] },
];

export function cleanSection(key, body) {
  const sec = SECTIONS.find((s) => s.key === key);
  if (!sec) return null;
  const out = {};
  const errors = {};
  for (const [name, label, type, opts] of sec.fields) {
    let v = body[name];
    if (type === 'multi') {
      const arr = (Array.isArray(v) ? v : v ? [v] : []).filter((x) => opts.some(([o]) => o === x));
      out[name] = arr;
      continue;
    }
    if (Array.isArray(v)) v = v[0];
    v = typeof v === 'string' ? v.trim().slice(0, type === 'textarea' ? 4000 : 300) : '';
    if (type === 'select' && v && !opts.some(([o]) => o === v)) { errors[name] = `${label}: choose a listed option.`; continue; }
    if (type === 'decimal' && v && !/^-?\d+(\.\d+)?$/.test(v.replace(/[,\s$]/g, ''))) { errors[name] = `${label}: enter a number or leave blank if unknown.`; continue; }
    if (type === 'decimal') v = v.replace(/[,\s$]/g, '');
    if (type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { errors[name] = `${label}: use YYYY-MM-DD.`; continue; }
    out[name] = v;
  }
  return { data: out, errors, section: sec };
}

export function completion(profile) {
  return SECTIONS.map((s) => {
    const filled = s.fields.filter(([n]) => { const v = profile[n]; return Array.isArray(v) ? v.length : v; }).length;
    return { key: s.key, title: s.title, filled, total: s.fields.length };
  });
}
