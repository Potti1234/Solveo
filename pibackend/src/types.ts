export type Citation = {
  source: string;
  locator: string;
  excerpt: string;
};

export type CovenantRule = {
  id: string;
  name: string;
  metric: "debt_to_ebitda" | "minimum_liquidity" | "interest_coverage" | "custom";
  operator: "<=" | ">=";
  threshold: number;
  unit: "ratio" | "usd";
  period: "quarterly" | "annual" | "trailing_twelve_months";
  citations: Citation[];
};

export type CovenantRulebook = {
  borrower: string;
  agreementName: string;
  extractedAt: string;
  rules: CovenantRule[];
};

export type FilingPlan = {
  ticker: string;
  cik?: number;
  companyName?: string;
  filingType: "10-Q" | "10-K";
  targetPeriod: string;
  requiredLineItems: string[];
  retrievalQueries: string[];
  rationale: string;
};

export type FinancialLineItem = {
  name: string;
  value: number;
  unit: "usd" | "ratio";
  period: string;
  citations: Citation[];
};

export type RetrievalBlock = {
  query: string;
  reasoning: string;
  lineItems: FinancialLineItem[];
  citations: Citation[];
};

export type CovenantCalculation = {
  ruleId: string;
  actual: number;
  threshold: number;
  operator: CovenantRule["operator"];
  compliant: boolean;
  formula: string;
  citations: Citation[];
};

export type ComplianceMemo = {
  ticker: string;
  status: "compliant" | "breach" | "needs_review";
  summary: string;
  calculations: CovenantCalculation[];
  citations: Citation[];
};

export type AuditThought = {
  phase: "sec_lookup" | "rule_extraction" | "planning" | "retrieval" | "calculation" | "reporting";
  message: string;
  payload?: Record<string, unknown>;
};

export type AuditRequest = {
  ticker: string;
  creditAgreementUrl?: string;
  rulebook?: CovenantRulebook;
};

export type SecCompany = {
  cik: number;
  cikPadded: string;
  ticker: string;
  title: string;
};

export type SecRecentFiling = {
  accessionNumber: string;
  cik: number;
  ticker: string;
  companyName: string;
  form: string;
  filingDate: string;
  reportDate: string | null;
  primaryDocument: string;
  primaryDocumentUrl: string;
  filingDirectoryUrl: string;
};

export type SecFilingDocument = {
  accessionNumber: string;
  cik: number;
  name: string;
  type: string;
  size: number | null;
  url: string;
  isExhibit101: boolean;
};

export type ExhibitDiscovery = {
  company: SecCompany;
  filings: SecRecentFiling[];
  exhibitCandidates: SecFilingDocument[];
};

export type AuditRunResult = {
  thoughts: AuditThought[];
  rulebook: CovenantRulebook;
  plan: FilingPlan;
  retrievals: RetrievalBlock[];
  memo: ComplianceMemo;
};
