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
  model?: "flash" | "prime";
  lineItems: FinancialLineItem[];
  citations: Citation[];
};

export type CovenantKeywordScan = {
  documentUrl: string;
  model: "flash";
  keywords: string[];
  hits: Array<{
    keyword: string;
    found: boolean;
    citations: Citation[];
  }>;
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
  codeAnalyses?: CodeExecutionResult[];
  citations: Citation[];
};

export type CodeLanguage = "python" | "typescript";

export type CodeExecutionRequest = {
  language: CodeLanguage;
  code: string;
};

export type CodeExecutionResult = {
  language: CodeLanguage;
  code: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
};

export type AuditThought = {
  phase:
    | "sec_lookup"
    | "exhibit_discovery"
    | "keyword_scan"
    | "rule_extraction"
    | "planning"
    | "retrieval"
    | "calculation"
    | "code_execution"
    | "reporting";
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
  creditAgreementUrl: string | null;
  keywordScan: CovenantKeywordScan | null;
  rulebook: CovenantRulebook;
  plan: FilingPlan;
  retrievals: RetrievalBlock[];
  codeAnalyses: CodeExecutionResult[];
  memo: ComplianceMemo;
};
