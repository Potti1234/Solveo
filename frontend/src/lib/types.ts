export type ChatRole = "user" | "assistant" | "system";

export type FileAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: FileAttachment[];
};

export type ChatRunStatus = "idle" | "running" | "complete" | "error";

export type ChatRun = {
  id: string;
  title: string;
  ticker?: string;
  workflow?: "credit_review" | "sec_research";
  creditAgreementUrl?: string;
  status: ChatRunStatus;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  audit?: AuditResponse["audit"];
  markdown?: string;
  streamEvents?: AuditStreamEvent[];
  error?: string;
};

export type AuditResponse = {
  audit: AuditRun;
  markdown: string;
};

export type AuditStreamEvent =
  | {
      type: "start" | "thought" | "heartbeat";
      phase: string;
      message: string;
      payload?: Record<string, unknown>;
      createdAt: string;
    }
  | {
      type: "result";
      audit: AuditRun;
      markdown: string;
      createdAt: string;
    }
  | {
      type: "error";
      phase: string;
      message: string;
      createdAt: string;
    }
  | {
      type: "done";
      createdAt: string;
    };

export type AuditRun = {
  thoughts: Array<{
    phase: string;
    message: string;
    payload?: Record<string, unknown>;
  }>;
  creditAgreementUrl: string | null;
  rulebook: {
    borrower: string;
    agreementName: string;
    rules: Array<{
      id: string;
      name: string;
      metric: string;
      operator: "<=" | ">=";
      threshold: number;
      unit: string;
      period: string;
      citations: Citation[];
    }>;
  };
  plan: {
    ticker: string;
    filingType: string;
    retrievalQueries: string[];
    rationale: string;
  };
  retrievals: RetrievalBlock[];
  reflectiveChecks: RetrievalBlock[];
  externalContext: {
    provider: string;
    query: string;
    results: Array<{ title: string; url: string; snippet: string }>;
  } | null;
  actionPlan: {
    status: "pass" | "warning" | "fail";
    creditOfficerSummary: string;
    borrowerQuestions: string[];
    emailDraft: { subject: string; body: string };
  } | null;
  creditMonitoring: {
    materialEvents: Array<{
      filingDate: string;
      category: string;
      severity: "low" | "medium" | "high";
      summary: string;
      documentUrl: string;
      citations: Citation[];
    }>;
    headroomTrend: {
      direction: string;
      summary: string;
      points: Array<{
        filingDate: string;
        actual: number;
        threshold: number;
        cushion: number;
        status: string;
      }>;
    };
    earlyWarning: {
      level: "low" | "medium" | "high" | "critical";
      score: number;
      drivers: string[];
    };
    scheduleRecommendations: Array<{
      kind: string;
      cadenceMinutes: number;
      runAt: string;
      reason: string;
      input: Record<string, unknown>;
    }>;
  } | null;
  memo: {
    ticker: string;
    status: "compliant" | "breach" | "needs_review";
    summary: string;
    calculations: Array<{
      ruleId: string;
      actual: number;
      threshold: number;
      operator: "<=" | ">=";
      compliant: boolean;
      formula: string;
      citations: Citation[];
    }>;
  };
  explainability: {
    documents: Array<{ kind: string; title: string; url: string }>;
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
      actual: number;
      threshold: number;
      operator: string;
      result: "pass" | "fail";
      inputs: Array<{ name: string; value: number; unit: string; period: string }>;
    }>;
    codeVerification: Array<{
      language: string;
      purpose: string;
      exitCode: number | null;
      timedOut: boolean;
      stdoutPreview: string;
    }>;
    caveats: string[];
  };
};

export type Citation = {
  source: string;
  locator: string;
  excerpt: string;
};

export type RetrievalBlock = {
  query: string;
  reasoning: string;
  lineItems: Array<{
    name: string;
    value: number;
    unit: "usd" | "ratio";
    period: string;
    citations: Citation[];
  }>;
  citations: Citation[];
};
