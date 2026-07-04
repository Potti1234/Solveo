import type { AuditRequest, AuditRunResult, AuditThought, ComplianceMemo, CovenantRulebook, FilingPlan } from "../types";
import { findLatestFiling, resolveCompanyTicker } from "../services/sec";
import { retrieveFinancialContext } from "../services/retriever";
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

    const rulebook = request.rulebook ?? (await this.extractRulebook(request));
    const plan = await this.planFilingRetrieval(company?.ticker ?? request.ticker, rulebook, company);
    const filing = await findLatestFiling(request.ticker, plan.filingType);

    const retrievals = [];
    for (const query of plan.retrievalQueries) {
      this.think("retrieval", `Searching SEC filing for: ${query}`, { query, filingUrl: filing.url });
      retrievals.push(
        await retrieveFinancialContext({
          documentUrl: filing.url,
          query,
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

    return { thoughts: this.thoughts, rulebook, plan, retrievals, memo };
  }

  private async extractRulebook(request: AuditRequest): Promise<CovenantRulebook> {
    this.think("rule_extraction", "Extracting financial covenants from credit agreement.", {
      creditAgreementUrl: request.creditAgreementUrl ?? null
    });

    return llmClient.chatJson(
      [
        {
          role: "system",
          content:
            "Extract loan financial covenants into strict JSON: borrower, agreementName, extractedAt, rules. Rules require id, name, metric, operator, threshold, unit, period, citations."
        },
        { role: "user", content: JSON.stringify(request) }
      ],
      () => fallbackRulebook(request),
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

function fallbackRulebook(request: AuditRequest): CovenantRulebook {
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
            source: request.creditAgreementUrl ?? "credit-agreement-placeholder",
            locator: "financial-covenants",
            excerpt: "Replace with VultronRetrieverPrime covenant extraction."
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
      Array.isArray(plan.retrievalQueries)
  );
}
