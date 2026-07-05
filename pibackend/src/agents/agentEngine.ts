import type {
  ActionPlan,
  AuditRequest,
  AuditRunResult,
  AuditThought,
  CreditMonitoringResult,
  CodeExecutionResult,
  ComplianceMemo,
  CovenantCalculation,
  CovenantRulebook,
  FilingPlan,
  MonitoringScheduleRecommendation,
  RetrievalBlock,
  WebSearchResponse
} from "../types";
import { discoverCreditAgreementExhibits, findLatestFiling, resolveCompanyTicker } from "../services/sec";
import {
  extractCovenantRulebookFromDocument,
  extractCovenantRulesContext,
  retrieveFinancialContext,
  scanCovenantKeywords
} from "../services/retriever";
import { llmClient } from "../services/vultr";
import { buildAuditExplainability } from "../services/auditReport";
import { buildCreditMonitoring } from "../services/creditMonitoring";
import { calculateCovenants } from "../tools/calculator";
import { executeCode } from "../tools/executeCode";
import { buildMathVerificationScript, buildTwoQuarterProjectionScript } from "../tools/riskScripts";
import { webSearch } from "../tools/webSearch";

export class AgentEngine {
  private readonly thoughts: AuditThought[] = [];

  constructor(private readonly onThought?: (thought: AuditThought) => void) {}

  async run(request: AuditRequest): Promise<AuditRunResult> {
    this.think("sec_lookup", "Resolving ticker against SEC company ticker index.", { ticker: request.ticker });
    const company = await resolveCompanyTicker(request.ticker);
    this.think("sec_lookup", company ? "Resolved SEC company metadata." : "Ticker not found in SEC cache.", {
      company
    });

    let creditAgreementUrl = request.creditAgreementUrl ?? null;
    if (!creditAgreementUrl && company) {
      this.think("exhibit_discovery", "Searching recent SEC 10-K and 8-K filings for Exhibit 10.1 candidates.", {
        ticker: company.ticker,
        cik: company.cik
      });
      const discovery = await discoverCreditAgreementExhibits(company.ticker);
      creditAgreementUrl = discovery.exhibitCandidates[0]?.url ?? null;
      this.think(
        "exhibit_discovery",
        creditAgreementUrl ? "Selected Exhibit 10.1 candidate for covenant scanning." : "No Exhibit 10.1 candidate found in recent SEC filings.",
        {
          filingsChecked: discovery.filings.length,
          candidateCount: discovery.exhibitCandidates.length,
          creditAgreementUrl
        }
      );
    }

    const keywordScan = creditAgreementUrl ? await this.scanCreditAgreement(creditAgreementUrl) : null;
    const parsedRulebook = creditAgreementUrl
      ? await extractCovenantRulebookFromDocument(creditAgreementUrl, company?.title ?? request.ticker.toUpperCase())
      : null;
    if (parsedRulebook) {
      this.think("rule_extraction", "Extracted covenant rulebook from focused credit agreement extraction path.", {
        creditAgreementUrl,
        ruleCount: parsedRulebook.rules.length,
        rules: parsedRulebook.rules.map((rule) => ({ name: rule.name, operator: rule.operator, threshold: rule.threshold }))
      });
    }
    const ruleContext =
      !parsedRulebook && creditAgreementUrl && keywordScan ? await extractCovenantRulesContext(creditAgreementUrl, keywordScan) : null;
    const llmRulebook = !parsedRulebook && !request.rulebook ? await this.extractRulebookWithVultr(request, creditAgreementUrl, ruleContext) : null;
    const rulebook = request.rulebook ?? llmRulebook ?? parsedRulebook ?? fallbackRulebook(request, creditAgreementUrl, ruleContext);
    const plan = await this.planFilingRetrieval(company?.ticker ?? request.ticker, rulebook, company);
    const filing = await findLatestFiling(request.ticker, plan.filingType);

    const retrievals = [];
    for (const query of plan.retrievalQueries) {
      this.think("retrieval", `Searching SEC filing for: ${query}`, { query, filingUrl: filing.url });
      retrievals.push(
        await retrieveFinancialContext({
          documentUrl: filing.url,
          query,
          model: "prime",
          reasoning: `Needed to evaluate ${rulebook.rules.map((rule) => rule.name).join(", ")}.`
        })
      );
    }

    this.think("calculation", "Computing covenant ratios with extracted line items.");
    const calculations = calculateCovenants(rulebook.rules, retrievals);
    const reflectiveChecks = await this.runReflectiveRetrieval(filing.url, rulebook);
    const codeAnalyses = await this.runCodeAnalyses(rulebook, calculations, retrievals);
    const externalContext = await this.maybeSearchExternalContext(company?.ticker ?? request.ticker.toUpperCase(), calculations);
    const actionPlan = this.buildActionPlan(company?.ticker ?? request.ticker.toUpperCase(), calculations, externalContext);
    this.think("monitoring", "Running credit monitoring checks for 8-K events, headroom trend, amendments, and follow-up schedules.", {
      ticker: company?.ticker ?? request.ticker.toUpperCase()
    });
    let creditMonitoring = await buildCreditMonitoring({
      ticker: request.ticker,
      company,
      creditAgreementUrl,
      rulebook,
      calculations
    });
    const scheduleRecommendations = await this.planFollowUpAgents({
      ticker: company?.ticker ?? request.ticker.toUpperCase(),
      creditAgreementUrl,
      calculations,
      externalContext,
      creditMonitoring
    });
    creditMonitoring = {
      ...creditMonitoring,
      scheduleRecommendations
    };
    this.think("monitoring", "Completed credit monitoring expansion.", {
      earlyWarning: creditMonitoring.earlyWarning,
      materialEventCount: creditMonitoring.materialEvents.length,
      scheduleCount: creditMonitoring.scheduleRecommendations.length
    });

    this.think("reporting", "Preparing audit-ready compliance memo with citations.");
    const hasMeasuredCalculations = calculations.some((calculation) => calculation.actual > 0);
    const memo: ComplianceMemo = {
      ticker: company?.ticker ?? request.ticker.toUpperCase(),
      status: calculations.some((calculation) => !calculation.compliant) ? "breach" : hasMeasuredCalculations ? "compliant" : "needs_review",
      summary: hasMeasuredCalculations
        ? "Compliance memo includes cited filing evidence, script-backed math verification, and two-quarter covenant stress projection."
        : "Compliance memo includes script-backed checks, but the agent did not extract enough measured values for a final covenant decision.",
      calculations,
      codeAnalyses,
      citations: [...retrievals, ...reflectiveChecks].flatMap((retrieval) => retrieval.citations)
    };

    const runResult = {
      thoughts: this.thoughts,
      creditAgreementUrl,
      keywordScan,
      rulebook,
      plan,
      retrievals,
      reflectiveChecks,
      externalContext,
      actionPlan,
      creditMonitoring,
      codeAnalyses,
      memo
    };
    return { ...runResult, explainability: buildAuditExplainability(runResult) };
  }

  private async runReflectiveRetrieval(documentUrl: string, rulebook: CovenantRulebook): Promise<RetrievalBlock[]> {
    const queries = [
      "Subsequent Events new debt repayment refinancing covenant compliance",
      "Management's Discussion liquidity capital resources debt obligations covenant"
    ];

    const checks: RetrievalBlock[] = [];
    for (const query of queries) {
      this.think("retrieval", `Triple-checking calculation against: ${query}`, {
        query,
        documentUrl
      });
      checks.push(
        await retrieveFinancialContext({
          documentUrl,
          query,
          model: "prime",
          reasoning: `Reflective retrieval to find sections that could contradict or qualify ${rulebook.rules.map((rule) => rule.name).join(", ")}.`
        })
      );
    }

    return checks;
  }

  private async runCodeAnalyses(
    rulebook: CovenantRulebook,
    calculations: ReturnType<typeof calculateCovenants>,
    retrievals: Awaited<ReturnType<typeof retrieveFinancialContext>>[]
  ): Promise<CodeExecutionResult[]> {
    const scripts = [
      {
        title: "Writing Python script to verify covenant math.",
        code: buildMathVerificationScript({ rulebook, calculations, retrievals })
      },
      {
        title: "Writing Python script to project breach risk over the next two quarters.",
        code: buildTwoQuarterProjectionScript({ rulebook, calculations, retrievals })
      }
    ];

    const results: CodeExecutionResult[] = [];
    for (const script of scripts) {
      this.think("code_execution", script.title, {
        language: "python",
        code: script.code
      });
      const result = await executeCode({ language: "python", code: script.code });
      this.think("code_execution", "Executed analyst script.", {
        language: result.language,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdout: result.stdout,
        stderr: result.stderr
      });
      results.push(result);
    }

    return results;
  }

  private async maybeSearchExternalContext(ticker: string, calculations: CovenantCalculation[]): Promise<WebSearchResponse | null> {
    const nearLimit = calculations.some((calculation) => {
      if (calculation.threshold === 0) return false;
      const distance = Math.abs(calculation.threshold - calculation.actual) / Math.abs(calculation.threshold);
      return distance <= 0.1 || !calculation.compliant;
    });

    if (!nearLimit) return null;

    const query = `${ticker} recent 8-K new debt refinancing covenant credit agreement`;
    this.think("retrieval", "Ratio is near limit or failing; searching the live web for recent financing context.", { query });
    const result = await webSearch(query, 5);
    this.think("retrieval", "Completed external context search.", {
      provider: result.provider,
      resultCount: result.results.length,
      topResults: result.results.slice(0, 3)
    });
    return result;
  }

  private buildActionPlan(ticker: string, calculations: CovenantCalculation[], externalContext: WebSearchResponse | null): ActionPlan {
    const hasBreach = calculations.some((calculation) => !calculation.compliant);
    const nearLimit = calculations.some((calculation) => {
      if (calculation.threshold === 0) return false;
      return Math.abs(calculation.threshold - calculation.actual) / Math.abs(calculation.threshold) <= 0.1;
    });
    const status: ActionPlan["status"] = hasBreach ? "fail" : nearLimit || externalContext ? "warning" : "pass";
    const subject =
      status === "fail"
        ? `${ticker}: Potential covenant default follow-up`
        : status === "warning"
          ? `${ticker}: Covenant cushion clarification request`
          : `${ticker}: Covenant monitoring follow-up`;

    return {
      status,
      creditOfficerSummary:
        status === "fail"
          ? "Potential breach detected. Review citations, confirm borrower-provided compliance certificate, and prepare notice language."
          : status === "warning"
            ? "Covenant appears close to the threshold or has external context requiring human review."
            : "No immediate covenant issue detected from current extracted values; keep monitoring for new 8-K events.",
      emailDraft: {
        subject,
        body: [
          `Hello,`,
          ``,
          `We are reviewing ${ticker}'s latest covenant compliance materials and would appreciate clarification on the items below.`,
          `Please provide supporting schedules, current debt balances, and any updates since the latest SEC filing.`,
          ``,
          `Regards,`,
          `Credit Monitoring Team`
        ].join("\n")
      },
      borrowerQuestions: [
        "Can you provide the latest compliance certificate and covenant calculation workbook?",
        "Have there been any debt issuances, repayments, refinancing events, or amendments since the latest filing date?",
        "Which adjustments were included in Adjusted EBITDA, and where are they supported in the financial statements?"
      ],
      dashboardConfig: {
        charts: [
          { id: "debt-ebitda-trend", title: "Debt to EBITDA Trend", type: "line", dataKey: "debtToEbitda" },
          { id: "covenant-cushion", title: "Covenant Cushion", type: "ratio", dataKey: "covenantCushion" },
          { id: "stress-projection", title: "Two-Quarter Stress Projection", type: "bar", dataKey: "stressProjection" }
        ]
      }
    };
  }

  private async planFollowUpAgents(input: {
    ticker: string;
    creditAgreementUrl: string | null;
    calculations: CovenantCalculation[];
    externalContext: WebSearchResponse | null;
    creditMonitoring: CreditMonitoringResult;
  }): Promise<MonitoringScheduleRecommendation[]> {
    this.think("monitoring", "Deciding whether follow-up agents are needed for this run.", {
      ticker: input.ticker,
      earlyWarning: input.creditMonitoring.earlyWarning,
      materialEventCount: input.creditMonitoring.materialEvents.length,
      headroomDirection: input.creditMonitoring.headroomTrend.direction,
      hasExternalContext: Boolean(input.externalContext)
    });

    const plan = await llmClient.chatJson(
      [
        {
          role: "system",
          content:
            "You are the main credit monitoring agent. Decide whether to create background follow-up agents after a covenant review. Return strict JSON with schedules only when the evidence justifies follow-up work. Do not create default or placeholder schedules. Valid kinds: audit_rescan, sec_8k_scan, web_news_scan, amendment_scan. cadenceMinutes and runAt must match the urgency. Each reason must cite the risk signal that caused the schedule."
        },
        {
          role: "user",
          content: JSON.stringify({
            ticker: input.ticker,
            creditAgreementUrl: input.creditAgreementUrl,
            calculations: input.calculations,
            externalContext: input.externalContext,
            materialEvents: input.creditMonitoring.materialEvents,
            headroomTrend: input.creditMonitoring.headroomTrend,
            earlyWarning: input.creditMonitoring.earlyWarning,
            amendmentComparison: input.creditMonitoring.amendmentComparison
          })
        }
      ],
      () => ({ schedules: fallbackFollowUpSchedules(input) }),
      isFollowUpSchedulePlan
    );

    const schedules = normalizeFollowUpSchedules(plan.schedules, input);
    this.think("monitoring", schedules.length ? "Created follow-up agents from monitoring decision." : "No follow-up agents needed for this run.", {
      scheduleCount: schedules.length,
      schedules
    });
    return schedules;
  }

  private async scanCreditAgreement(creditAgreementUrl: string) {
    this.think("keyword_scan", "Scanning credit agreement for debt-rule sections with VultronRetrieverFlash.", {
      creditAgreementUrl
    });
    const scan = await scanCovenantKeywords(creditAgreementUrl);
    this.think("keyword_scan", "Completed covenant keyword scan.", {
      keywords: scan.keywords,
      hitCount: scan.hits.filter((hit) => hit.found).length
    });
    return scan;
  }

  private async extractRulebookWithVultr(
    request: AuditRequest,
    creditAgreementUrl: string | null,
    ruleContext: Awaited<ReturnType<typeof extractCovenantRulesContext>> | null
  ): Promise<CovenantRulebook | null> {
    if (!creditAgreementUrl && !ruleContext) return null;

    this.think("rule_extraction", "Extracting financial covenants with VultronRetrieverPrime context.", {
      creditAgreementUrl,
      ruleContext: ruleContext
        ? {
            query: ruleContext.query,
            citationCount: ruleContext.citations.length
          }
        : null
    });

    return llmClient.chatJson(
      [
        {
          role: "system",
          content:
            "Extract loan financial maintenance covenants into strict JSON: borrower, agreementName, extractedAt, rules. Rules require id, name, metric, operator, threshold, unit, period, citations. Use metric debt_to_ebitda for Total Net Leverage, Consolidated Leverage, First Lien Net Leverage, Secured Net Leverage, or debt/EBITDA covenants. Use interest_coverage for EBITDA/interest expense covenants. Use minimum_liquidity for liquidity covenants. For maximum leverage phrases such as greater than, not exceed, shall not permit above, use '<='. For minimum coverage phrases such as less than, use '>='. Include exact excerpts as citations. Do not return rules if no numeric threshold is present."
        },
        { role: "user", content: JSON.stringify({ request, creditAgreementUrl, ruleContext }) }
      ],
      () => null,
      isRulebook
    ).then((rulebook) => {
      if (!rulebook || rulebook.rules.length === 0) return null;
      this.think("rule_extraction", "Vultr extracted covenant rulebook.", {
        creditAgreementUrl,
        ruleCount: rulebook.rules.length,
        rules: rulebook.rules.map((rule) => ({ name: rule.name, operator: rule.operator, threshold: rule.threshold }))
      });
      return rulebook;
    });
  }

  private async planFilingRetrieval(
    ticker: string,
    rulebook: CovenantRulebook,
    company: Awaited<ReturnType<typeof resolveCompanyTicker>>
  ): Promise<FilingPlan> {
    const ruleBasedPlan = buildRuleBasedPlan(ticker, rulebook, company);
    if (ruleBasedPlan) {
      this.think("planning", "Built filing retrieval plan from extracted covenant metrics.", {
        ticker,
        cik: company?.cik,
        companyName: company?.title,
        retrievalQueries: ruleBasedPlan.retrievalQueries
      });
      return ruleBasedPlan;
    }

    this.think("planning", "Planning SEC filing retrieval based on extracted covenant rules.", {
      ticker,
      cik: company?.cik,
      companyName: company?.title,
      ruleCount: rulebook.rules.length
    });

    return llmClient.chatJson(
      [
        {
          role: "system",
          content:
            "Plan which SEC filing and table queries are needed for covenant testing. Return strict JSON with ticker, filingType, targetPeriod, requiredLineItems, retrievalQueries, rationale. Normalize units across SEC filings and credit agreements, reconcile conflicting tables, and gather historical variables needed for two-quarter stress testing."
        },
        { role: "user", content: JSON.stringify({ ticker, company, rulebook }) }
      ],
      () => fallbackPlan(ticker, rulebook, company),
      isFilingPlan
    );
  }

  private think(phase: AuditThought["phase"], message: string, payload?: Record<string, unknown>) {
    const thought = { phase, message, payload };
    this.thoughts.push(thought);
    this.onThought?.(thought);
  }
}

function buildRuleBasedPlan(
  ticker: string,
  rulebook: CovenantRulebook,
  company: Awaited<ReturnType<typeof resolveCompanyTicker>>
): FilingPlan | null {
  if (rulebook.rules.length === 0) return null;

  const requiredLineItems = new Set<string>();
  const retrievalQueries = new Set<string>();

  for (const rule of rulebook.rules) {
    if (rule.metric === "debt_to_ebitda") {
      requiredLineItems.add("total debt");
      requiredLineItems.add("EBITDA");
      retrievalQueries.add("total debt current maturities long term debt balance sheet");
      retrievalQueries.add("net income income tax expense interest expense depreciation amortization EBITDA reconciliation");
    }
    if (rule.metric === "interest_coverage") {
      requiredLineItems.add("EBITDA");
      requiredLineItems.add("interest expense");
      retrievalQueries.add("net income income tax expense interest expense depreciation amortization EBITDA reconciliation");
    }
    if (rule.metric === "minimum_liquidity") {
      requiredLineItems.add("cash and liquidity");
      retrievalQueries.add("cash cash equivalents availability liquidity revolving credit facility");
    }
  }

  if (retrievalQueries.size === 0) return null;

  return {
    ticker: ticker.toUpperCase(),
    cik: company?.cik,
    companyName: company?.title,
    filingType: "10-Q",
    targetPeriod: "latest",
    requiredLineItems: [...requiredLineItems],
    retrievalQueries: [...retrievalQueries],
    rationale: "Map extracted covenant metrics to the SEC filing line items needed for calculation."
  };
}

function fallbackRulebook(
  request: AuditRequest,
  creditAgreementUrl: string | null,
  ruleContext: Awaited<ReturnType<typeof extractCovenantRulesContext>> | null
): CovenantRulebook {
  return {
    borrower: request.ticker.toUpperCase(),
    agreementName: "Unresolved covenant rulebook",
    extractedAt: new Date().toISOString(),
    rules: ruleContext?.citations[0]
      ? [
          {
            id: "unresolved-covenant-review",
            name: "Covenant requires human review",
            metric: "custom",
            operator: ">=",
            threshold: 0,
            unit: "ratio",
            period: "trailing_twelve_months",
            citations: [ruleContext.citations[0]]
          }
        ]
      : []
  };
}

function fallbackPlan(
  ticker: string,
  rulebook: CovenantRulebook,
  company: Awaited<ReturnType<typeof resolveCompanyTicker>>
): FilingPlan {
  return {
    ticker: ticker.toUpperCase(),
    cik: company?.cik,
    companyName: company?.title,
    filingType: "10-Q",
    targetPeriod: "latest",
    requiredLineItems: ["Total Debt", "EBITDA"],
    retrievalQueries: rulebook.rules.flatMap((rule) =>
      rule.metric === "debt_to_ebitda"
        ? ["consolidated balance sheet total debt", "EBITDA reconciliation trailing twelve months"]
        : [rule.name]
    ),
    rationale: "Fetch the financial statement tables needed to calculate covenant compliance."
  };
}

function isRulebook(value: unknown): value is CovenantRulebook {
  const rulebook = value as CovenantRulebook;
  return Boolean(
    rulebook &&
      typeof rulebook.borrower === "string" &&
      typeof rulebook.agreementName === "string" &&
      Array.isArray(rulebook.rules)
  );
}

function isFilingPlan(value: unknown): value is FilingPlan {
  const plan = value as FilingPlan;
  return Boolean(
    plan &&
      typeof plan.ticker === "string" &&
      (plan.filingType === "10-Q" || plan.filingType === "10-K") &&
      Array.isArray(plan.requiredLineItems) &&
      plan.requiredLineItems.every((item) => typeof item === "string") &&
      Array.isArray(plan.retrievalQueries) &&
      plan.retrievalQueries.every((query) => typeof query === "string")
  );
}

type FollowUpSchedulePlan = {
  schedules: MonitoringScheduleRecommendation[];
};

function fallbackFollowUpSchedules(input: {
  ticker: string;
  creditAgreementUrl: string | null;
  calculations: CovenantCalculation[];
  externalContext: WebSearchResponse | null;
  creditMonitoring: CreditMonitoringResult;
}): MonitoringScheduleRecommendation[] {
  const schedules: MonitoringScheduleRecommendation[] = [];
  const nowMs = Date.now();
  const hasBreach = input.calculations.some((calculation) => !calculation.compliant);
  const nearLimit = input.calculations.some((calculation) => {
    if (calculation.threshold === 0 || calculation.actual <= 0) return false;
    return Math.abs(calculation.threshold - calculation.actual) / Math.abs(calculation.threshold) <= 0.1;
  });
  const materialDebtEvent = input.creditMonitoring.materialEvents.some((event) =>
    ["credit_agreement", "debt_financing", "default", "liquidity"].includes(event.category)
  );
  const elevatedRisk = ["medium", "high", "critical"].includes(input.creditMonitoring.earlyWarning.level);

  if (hasBreach || nearLimit || materialDebtEvent || input.externalContext) {
    schedules.push({
      kind: "sec_8k_scan",
      cadenceMinutes: hasBreach || input.creditMonitoring.earlyWarning.level === "critical" ? 6 * 60 : 24 * 60,
      runAt: new Date(nowMs + (hasBreach || input.creditMonitoring.earlyWarning.level === "critical" ? 6 : 24) * 60 * 60 * 1000).toISOString(),
      reason: hasBreach
        ? "Potential covenant breach requires near-term 8-K monitoring."
        : materialDebtEvent
          ? "Recent debt or credit-agreement event requires continued SEC event monitoring."
          : "Risk signal found during the review requires event monitoring.",
      input: { ticker: input.ticker }
    });
  }

  if (hasBreach || nearLimit || input.creditMonitoring.headroomTrend.direction === "deteriorating") {
    schedules.push({
      kind: "audit_rescan",
      cadenceMinutes: 7 * 24 * 60,
      runAt: new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString(),
      reason: hasBreach
        ? "Potential breach should be rechecked after the borrower provides updated support."
        : nearLimit
          ? "Covenant cushion is close enough to justify a full weekly rescan."
          : "Deteriorating headroom trend justifies a full weekly rescan.",
      input: { ticker: input.ticker, creditAgreementUrl: input.creditAgreementUrl }
    });
  }

  if (input.creditMonitoring.earlyWarning.level === "high" || input.creditMonitoring.earlyWarning.level === "critical") {
    schedules.push({
      kind: "web_news_scan",
      cadenceMinutes: input.creditMonitoring.earlyWarning.level === "critical" ? 15 : 60,
      runAt: new Date(nowMs + (input.creditMonitoring.earlyWarning.level === "critical" ? 15 : 60) * 60 * 1000).toISOString(),
      reason: `${input.creditMonitoring.earlyWarning.level} early-warning score warrants external news monitoring.`,
      input: { query: `${input.ticker} debt refinancing covenant default liquidity credit agreement` }
    });
  }

  if (materialDebtEvent || input.creditMonitoring.amendmentComparison?.changes.some((change) => change.direction === "tighter")) {
    schedules.push({
      kind: "amendment_scan",
      cadenceMinutes: 24 * 60,
      runAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
      reason: "Debt financing or tighter covenant terms should be checked for follow-on amendments.",
      input: { ticker: input.ticker, creditAgreementUrl: input.creditAgreementUrl }
    });
  }

  return elevatedRisk ? schedules : schedules.filter((schedule) => schedule.kind !== "web_news_scan");
}

function normalizeFollowUpSchedules(
  schedules: MonitoringScheduleRecommendation[],
  input: {
    ticker: string;
    creditAgreementUrl: string | null;
  }
): MonitoringScheduleRecommendation[] {
  const validKinds = new Set<MonitoringScheduleRecommendation["kind"]>(["audit_rescan", "sec_8k_scan", "web_news_scan", "amendment_scan"]);
  const seen = new Set<string>();
  return schedules
    .filter((schedule) => validKinds.has(schedule.kind) && Number.isFinite(schedule.cadenceMinutes) && schedule.cadenceMinutes > 0)
    .map((schedule) => ({
      ...schedule,
      runAt: Number.isNaN(new Date(schedule.runAt).getTime())
        ? new Date(Date.now() + schedule.cadenceMinutes * 60 * 1000).toISOString()
        : schedule.runAt,
      reason: schedule.reason.trim() || "The main agent found a credit monitoring risk signal.",
      input:
        schedule.kind === "web_news_scan"
          ? { query: String(schedule.input.query ?? `${input.ticker} debt covenant credit agreement`) }
          : { ticker: input.ticker, creditAgreementUrl: input.creditAgreementUrl, ...schedule.input }
    }))
    .filter((schedule) => {
      const key = schedule.kind;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isFollowUpSchedulePlan(value: unknown): value is FollowUpSchedulePlan {
  const plan = value as FollowUpSchedulePlan;
  return Boolean(plan && Array.isArray(plan.schedules) && plan.schedules.every(isFollowUpSchedule));
}

function isFollowUpSchedule(value: unknown): value is MonitoringScheduleRecommendation {
  const schedule = value as MonitoringScheduleRecommendation;
  return Boolean(
    schedule &&
      ["audit_rescan", "sec_8k_scan", "web_news_scan", "amendment_scan"].includes(schedule.kind) &&
      typeof schedule.cadenceMinutes === "number" &&
      typeof schedule.runAt === "string" &&
      typeof schedule.reason === "string" &&
      schedule.input &&
      typeof schedule.input === "object"
  );
}
