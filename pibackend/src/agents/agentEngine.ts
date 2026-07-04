import type {
  ActionPlan,
  AuditRequest,
  AuditRunResult,
  AuditThought,
  CodeExecutionResult,
  ComplianceMemo,
  CovenantCalculation,
  CovenantRulebook,
  FilingPlan,
  RetrievalBlock,
  WebSearchResponse
} from "../types";
import { discoverCreditAgreementExhibits, findLatestFiling, resolveCompanyTicker } from "../services/sec";
import { extractCovenantRulesContext, retrieveFinancialContext, scanCovenantKeywords } from "../services/retriever";
import { llmClient } from "../services/vultr";
import { calculateCovenants } from "../tools/calculator";
import { executeCode } from "../tools/executeCode";
import { buildMathVerificationScript, buildTwoQuarterProjectionScript } from "../tools/riskScripts";
import { webSearch } from "../tools/webSearch";

export class AgentEngine {
  private readonly thoughts: AuditThought[] = [];

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
    const ruleContext = creditAgreementUrl && keywordScan ? await extractCovenantRulesContext(creditAgreementUrl, keywordScan) : null;
    const rulebook = request.rulebook ?? (await this.extractRulebook(request, creditAgreementUrl, ruleContext));
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

    this.think("reporting", "Preparing audit-ready compliance memo with citations.");
    const hasMeasuredCalculations = calculations.some((calculation) => calculation.actual > 0);
    const memo: ComplianceMemo = {
      ticker: company?.ticker ?? request.ticker.toUpperCase(),
      status: calculations.some((calculation) => !calculation.compliant) ? "breach" : hasMeasuredCalculations ? "compliant" : "needs_review",
      summary:
        "Compliance memo includes script-backed math verification and two-quarter covenant stress projection. Wire retriever line items to move placeholder calculations into live document-derived analysis.",
      calculations,
      codeAnalyses,
      citations: [...retrievals, ...reflectiveChecks].flatMap((retrieval) => retrieval.citations)
    };

    return {
      thoughts: this.thoughts,
      creditAgreementUrl,
      keywordScan,
      rulebook,
      plan,
      retrievals,
      reflectiveChecks,
      externalContext,
      actionPlan,
      codeAnalyses,
      memo
    };
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

  private async extractRulebook(
    request: AuditRequest,
    creditAgreementUrl: string | null,
    ruleContext: Awaited<ReturnType<typeof extractCovenantRulesContext>> | null
  ): Promise<CovenantRulebook> {
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
            "Extract loan financial covenants into strict JSON: borrower, agreementName, extractedAt, rules. Rules require id, name, metric, operator, threshold, unit, period, citations. Think like a quant: identify formulas, units, and conditional covenant logic that may require code verification."
        },
        { role: "user", content: JSON.stringify({ request, creditAgreementUrl, ruleContext }) }
      ],
      () => fallbackRulebook(request, creditAgreementUrl, ruleContext),
      isRulebook
    );
  }

  private async planFilingRetrieval(
    ticker: string,
    rulebook: CovenantRulebook,
    company: Awaited<ReturnType<typeof resolveCompanyTicker>>
  ): Promise<FilingPlan> {
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
    this.thoughts.push({ phase, message, payload });
  }
}

function fallbackRulebook(
  request: AuditRequest,
  creditAgreementUrl: string | null,
  ruleContext: Awaited<ReturnType<typeof extractCovenantRulesContext>> | null
): CovenantRulebook {
  return {
    borrower: request.ticker.toUpperCase(),
    agreementName: "Credit agreement placeholder",
    extractedAt: new Date().toISOString(),
    rules: [
      {
        id: "max-debt-to-ebitda",
        name: "Maximum Debt to EBITDA",
        metric: "debt_to_ebitda",
        operator: "<=",
        threshold: 3.5,
        unit: "ratio",
        period: "trailing_twelve_months",
        citations: [
          {
            source: creditAgreementUrl ?? "credit-agreement-placeholder",
            locator: ruleContext?.citations[0]?.locator ?? "financial-covenants",
            excerpt:
              ruleContext?.citations[0]?.excerpt ??
              "Replace with VultronRetrieverPrime covenant extraction from Financial Covenants and Compliance Certificate sections."
          }
        ]
      }
    ]
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
