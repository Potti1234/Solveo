import type { AuditRequest, AuditRunResult, AuditThought, ComplianceMemo, CovenantRulebook, FilingPlan } from "../types";
import { discoverCreditAgreementExhibits, findLatestFiling, resolveCompanyTicker } from "../services/sec";
import { extractCovenantRulesContext, retrieveFinancialContext, scanCovenantKeywords } from "../services/retriever";
import { llmClient } from "../services/vultr";
import { calculateCovenants } from "../tools/calculator";

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

    this.think("reporting", "Preparing audit-ready compliance memo with citations.");
    const memo: ComplianceMemo = {
      ticker: company?.ticker ?? request.ticker.toUpperCase(),
      status: calculations.some((calculation) => !calculation.compliant) ? "breach" : "needs_review",
      summary:
        "Placeholder memo generated from the cleaned backend skeleton. Wire retriever line items to move this from needs_review to compliant/breach.",
      calculations,
      citations: retrievals.flatMap((retrieval) => retrieval.citations)
    };

    return { thoughts: this.thoughts, creditAgreementUrl, keywordScan, rulebook, plan, retrievals, memo };
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
            "Extract loan financial covenants into strict JSON: borrower, agreementName, extractedAt, rules. Rules require id, name, metric, operator, threshold, unit, period, citations."
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
            "Plan which SEC filing and table queries are needed for covenant testing. Return strict JSON with ticker, filingType, targetPeriod, requiredLineItems, retrievalQueries, rationale."
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
