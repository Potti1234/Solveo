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
  model?: "flash" | "core" | "prime";
  lineItems: FinancialLineItem[];
  citations: Citation[];
  rawResults?: Array<{
    score?: number | null;
    content: string;
    description?: string | null;
  }>;
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

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string | null;
  source?: string | null;
};

export type WebSearchResponse = {
  provider: "searxng" | "brave" | "disabled";
  query: string;
  results: WebSearchResult[];
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
    | "monitoring"
    | "reporting";
  message: string;
  payload?: Record<string, unknown>;
};

export type AuditRequest = {
  ticker: string;
  creditAgreementUrl?: string;
  prompt?: string;
  workflow?: "credit_review" | "sec_research";
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
  reflectiveChecks: RetrievalBlock[];
  externalContext: WebSearchResponse | null;
  actionPlan: ActionPlan | null;
  creditMonitoring: CreditMonitoringResult | null;
  codeAnalyses: CodeExecutionResult[];
  memo: ComplianceMemo;
  explainability: AuditExplainability;
};

export type AuditExplainability = {
  documents: Array<{
    kind: "credit_agreement" | "sec_filing" | "external_context";
    title: string;
    url: string;
  }>;
  toolCalls: Array<{
    order: number;
    tool: string;
    purpose: string;
    inputSummary: string;
    outputSummary: string;
  }>;
  evidenceTrail: Array<{
    label: string;
    value?: number | string;
    unit?: string;
    period?: string;
    source: string;
    locator: string;
    excerpt: string;
  }>;
  calculationTrail: Array<{
    formula: string;
    inputs: Array<{ name: string; value: number; unit: string; period: string }>;
    actual: number;
    threshold: number;
    operator: string;
    result: "pass" | "fail";
  }>;
  codeVerification: Array<{
    language: CodeLanguage;
    purpose: string;
    exitCode: number | null;
    timedOut: boolean;
    stdoutPreview: string;
  }>;
  decisionTrail: {
    status: ComplianceMemo["status"];
    summary: string;
    actionStatus?: ActionPlan["status"];
    borrowerQuestions: string[];
  };
  caveats: string[];
};

export type ActionPlan = {
  status: "pass" | "warning" | "fail";
  creditOfficerSummary: string;
  emailDraft: {
    subject: string;
    body: string;
  };
  borrowerQuestions: string[];
  dashboardConfig: {
    charts: Array<{
      id: string;
      title: string;
      type: "line" | "bar" | "ratio";
      dataKey: string;
    }>;
  };
};

export type MaterialEventSignal = {
  filingDate: string;
  form: "8-K" | "10-Q" | "10-K" | string;
  accessionNumber: string;
  documentUrl: string;
  category:
    | "debt_financing"
    | "credit_agreement"
    | "acquisition"
    | "default"
    | "restructuring"
    | "impairment"
    | "leadership_change"
    | "litigation"
    | "liquidity"
    | "other";
  severity: "low" | "medium" | "high";
  summary: string;
  citations: Citation[];
};

export type CovenantHeadroomPoint = {
  filingDate: string;
  filingUrl: string;
  ruleId: string;
  actual: number;
  threshold: number;
  operator: CovenantRule["operator"];
  cushion: number;
  status: "pass" | "fail" | "unknown";
};

export type HeadroomTrend = {
  points: CovenantHeadroomPoint[];
  direction: "improving" | "stable" | "deteriorating" | "insufficient_data";
  summary: string;
};

export type AmendmentComparison = {
  currentAgreementUrl: string | null;
  priorAgreementUrl: string | null;
  changes: Array<{
    ruleName: string;
    previousThreshold: number | null;
    currentThreshold: number | null;
    direction: "looser" | "tighter" | "unchanged" | "unknown";
    summary: string;
    citations: Citation[];
  }>;
};

export type EarlyWarningScore = {
  level: "low" | "medium" | "high" | "critical";
  score: number;
  drivers: string[];
};

export type MonitoringScheduleRecommendation = {
  kind: "audit_rescan" | "sec_8k_scan" | "web_news_scan" | "amendment_scan";
  cadenceMinutes: number;
  runAt: string;
  reason: string;
  input: Record<string, unknown>;
};

export type CreditMonitoringResult = {
  materialEvents: MaterialEventSignal[];
  headroomTrend: HeadroomTrend;
  amendmentComparison: AmendmentComparison | null;
  earlyWarning: EarlyWarningScore;
  scheduleRecommendations: MonitoringScheduleRecommendation[];
};

export type WhatIfRequest = {
  ticker: string;
  question: string;
  baselineRatio?: number;
  threshold?: number;
  interestRateShockBps?: number;
};

export type WhatIfResult = {
  ticker: string;
  question: string;
  assumptions: Record<string, unknown>;
  execution: CodeExecutionResult;
};
