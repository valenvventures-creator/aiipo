// Clearly fictional demo companies shared by the server and static editions.
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
