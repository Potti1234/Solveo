import type {
  AuditExplainability,
  AuditRequest,
  AuditRunResult,
  AuditThought,
  Citation,
  FilingPlan,
  RetrievalBlock,
  SecRecentFiling
} from "../types";
import { findRecentFilings, resolveCompanyTicker } from "../services/sec";
import { retrieveFinancialContext } from "../services/retriever";
import { llmClient } from "../services/vultr";

type SecResearchPlan = {
  filingForms: Array<"10-K" | "10-Q" | "8-K">;
  retrievalQueries: string[];
  rationale: string;
};

type SecResearchAnswer = {
  answer: string;
  keyFindings: string[];
  caveats: string[];
};

export class GeneralSecAgent {
  private readonly thoughts: AuditThought[] = [];

  constructor(private readonly onThought?: (thought: AuditThought) => void) {}

  async run(request: AuditRequest): Promise<AuditRunResult> {
    const prompt = request.prompt?.trim() || `Answer a general SEC filing question about ${request.ticker}.`;
    this.think("sec_lookup", "Resolving company against SEC company ticker index.", { ticker: request.ticker });
    const company = await resolveCompanyTicker(request.ticker);
    const ticker = company?.ticker ?? request.ticker.toUpperCase();

    this.think("planning", "Planning a general SEC filing research path from the user question.", { ticker, prompt });
    const plan = await this.planResearch(ticker, prompt);
    const filings = await findRecentFilings(ticker, plan.filingForms, 8);
    const selectedFilings = selectFilings(filings, plan.filingForms);

    this.think("retrieval", "Selected SEC filings for general research.", {
      selectedFilings: selectedFilings.map((filing) => ({
        form: filing.form,
        filingDate: filing.filingDate,
        url: filing.primaryDocumentUrl
      }))
    });

    const retrievals: RetrievalBlock[] = [];
    for (const filing of selectedFilings) {
      for (const query of plan.retrievalQueries) {
        this.think("retrieval", `Searching ${filing.form} filed ${filing.filingDate} for: ${query}`, {
          query,
          filingUrl: filing.primaryDocumentUrl
        });
        retrievals.push(
          await retrieveFinancialContext({
            documentUrl: filing.primaryDocumentUrl,
            query,
            model: "prime",
            reasoning: `General SEC filing research for: ${prompt}`
          })
        );
      }
    }

    this.think("reporting", "Synthesizing the SEC filing research answer with citations.", {
      retrievalCount: retrievals.length,
      citationCount: retrievals.flatMap((retrieval) => retrieval.citations).length
    });
    const answer = await this.synthesizeAnswer(prompt, ticker, selectedFilings, retrievals);
    const filingPlan = toFilingPlan(ticker, company?.cik, company?.title, plan, selectedFilings);
    const explainability = buildSecResearchExplainability({
      ticker,
      prompt,
      plan: filingPlan,
      retrievals,
      selectedFilings,
      answer
    });

    return {
      thoughts: this.thoughts,
      creditAgreementUrl: null,
      keywordScan: null,
      rulebook: {
        borrower: company?.title ?? ticker,
        agreementName: "General SEC filing research",
        extractedAt: new Date().toISOString(),
        rules: []
      },
      plan: filingPlan,
      retrievals,
      reflectiveChecks: [],
      externalContext: null,
      actionPlan: null,
      creditMonitoring: null,
      codeAnalyses: [],
      memo: {
        ticker,
        status: "needs_review",
        summary: answer.answer,
        calculations: [],
        citations: retrievals.flatMap((retrieval) => retrieval.citations)
      },
      explainability
    };
  }

  private async planResearch(ticker: string, prompt: string): Promise<SecResearchPlan> {
    return llmClient.chatJson(
      [
        {
          role: "system",
          content:
            "Plan SEC filing research for a user's question. Return strict JSON with filingForms, retrievalQueries, rationale. filingForms may include 10-K, 10-Q, and 8-K. Choose only the forms and 2-5 concise search queries needed to answer the question from filings. Do not force credit or covenant analysis unless the user asked for it."
        },
        { role: "user", content: JSON.stringify({ ticker, prompt }) }
      ],
      () => fallbackResearchPlan(prompt),
      isResearchPlan
    );
  }

  private async synthesizeAnswer(
    prompt: string,
    ticker: string,
    filings: SecRecentFiling[],
    retrievals: RetrievalBlock[]
  ): Promise<SecResearchAnswer> {
    const citations = retrievals.flatMap((retrieval) => retrieval.citations).slice(0, 16);
    return llmClient.chatJson(
      [
        {
          role: "system",
          content:
            "Answer the user's SEC filing question using only the supplied filing evidence. Return strict JSON with answer, keyFindings, caveats. Be direct and cite filing forms/dates in prose when available. If evidence is thin, say what could and could not be verified."
        },
        {
          role: "user",
          content: JSON.stringify({
            ticker,
            prompt,
            filings: filings.map((filing) => ({
              form: filing.form,
              filingDate: filing.filingDate,
              reportDate: filing.reportDate,
              url: filing.primaryDocumentUrl
            })),
            retrievals: retrievals.map((retrieval) => ({
              query: retrieval.query,
              lineItems: retrieval.lineItems,
              citations: retrieval.citations.slice(0, 5)
            }))
          })
        }
      ],
      () => fallbackAnswer(prompt, citations),
      isResearchAnswer
    );
  }

  private think(phase: AuditThought["phase"], message: string, payload?: Record<string, unknown>) {
    const thought = { phase, message, payload };
    this.thoughts.push(thought);
    this.onThought?.(thought);
  }
}

function fallbackResearchPlan(prompt: string): SecResearchPlan {
  const normalized = prompt.toLowerCase();
  const filingForms: SecResearchPlan["filingForms"] = normalized.includes("recent") || normalized.includes("8-k") ? ["8-K", "10-Q", "10-K"] : ["10-K", "10-Q"];
  const retrievalQueries = [
    prompt,
    "business overview management discussion risk factors",
    "financial condition results of operations liquidity"
  ];
  return {
    filingForms,
    retrievalQueries: [...new Set(retrievalQueries)].slice(0, 4),
    rationale: "Use recent periodic filings and targeted text retrieval to answer the user's SEC filing question."
  };
}

function fallbackAnswer(prompt: string, citations: Citation[]): SecResearchAnswer {
  const topCitations = citations.slice(0, 4);
  return {
    answer:
      topCitations.length > 0
        ? `I found filing evidence relevant to "${prompt}". Review the cited excerpts for the direct support; live synthesis is unavailable in local mode.`
        : `I could not extract enough filing evidence to answer "${prompt}" from the available SEC retrieval path.`,
    keyFindings: topCitations.map((citation) => `${citation.locator}: ${citation.excerpt.slice(0, 240)}`),
    caveats: ["Local fallback synthesis was used; enable the live model for a fuller narrative answer."]
  };
}

function selectFilings(filings: SecRecentFiling[], forms: SecResearchPlan["filingForms"]): SecRecentFiling[] {
  const selected: SecRecentFiling[] = [];
  for (const form of forms) {
    const match = filings.find((filing) => filing.form === form);
    if (match) selected.push(match);
  }
  return selected.length > 0 ? selected : filings.slice(0, 2);
}

function toFilingPlan(
  ticker: string,
  cik: number | undefined,
  companyName: string | undefined,
  plan: SecResearchPlan,
  filings: SecRecentFiling[]
): FilingPlan {
  const primaryFiling = filings.find((filing) => filing.form === "10-Q" || filing.form === "10-K");
  return {
    ticker,
    cik,
    companyName,
    filingType: primaryFiling?.form === "10-K" ? "10-K" : "10-Q",
    targetPeriod: filings.map((filing) => `${filing.form} ${filing.filingDate}`).join(", ") || "latest available",
    requiredLineItems: [],
    retrievalQueries: plan.retrievalQueries,
    rationale: plan.rationale
  };
}

function buildSecResearchExplainability(input: {
  ticker: string;
  prompt: string;
  plan: FilingPlan;
  retrievals: RetrievalBlock[];
  selectedFilings: SecRecentFiling[];
  answer: SecResearchAnswer;
}): AuditExplainability {
  return {
    documents: input.selectedFilings.map((filing) => ({
      kind: "sec_filing",
      title: `${filing.form} filed ${filing.filingDate}`,
      url: filing.primaryDocumentUrl
    })),
    toolCalls: [
      {
        order: 1,
        tool: "sec.resolve_ticker",
        purpose: "Resolve the company to SEC metadata.",
        inputSummary: input.ticker,
        outputSummary: input.plan.companyName ?? input.ticker
      },
      {
        order: 2,
        tool: "sec.research_planner",
        purpose: "Choose filing forms and retrieval queries for the user's question.",
        inputSummary: input.prompt,
        outputSummary: input.plan.retrievalQueries.join("; ")
      },
      {
        order: 3,
        tool: "vultr.retriever.prime",
        purpose: "Search selected SEC filings for relevant excerpts.",
        inputSummary: input.selectedFilings.map((filing) => `${filing.form} ${filing.filingDate}`).join(", "),
        outputSummary: `${input.retrievals.flatMap((retrieval) => retrieval.citations).length} citation(s) returned.`
      },
      {
        order: 4,
        tool: "llm.sec_answer_synthesis",
        purpose: "Synthesize the answer from filing evidence.",
        inputSummary: input.prompt,
        outputSummary: input.answer.keyFindings.slice(0, 2).join(" ")
      }
    ],
    evidenceTrail: input.retrievals.flatMap((retrieval) =>
      retrieval.citations.map((citation) => ({
        label: retrieval.query,
        source: citation.source,
        locator: citation.locator,
        excerpt: citation.excerpt
      }))
    ),
    calculationTrail: [],
    codeVerification: [],
    decisionTrail: {
      status: "needs_review",
      summary: input.answer.answer,
      borrowerQuestions: input.answer.keyFindings
    },
    caveats: input.answer.caveats.length > 0 ? input.answer.caveats : ["General SEC research answer; no covenant compliance decision was requested."]
  };
}

function isResearchPlan(value: unknown): value is SecResearchPlan {
  const plan = value as SecResearchPlan;
  return Boolean(
    plan &&
      Array.isArray(plan.filingForms) &&
      plan.filingForms.every((form) => form === "10-K" || form === "10-Q" || form === "8-K") &&
      Array.isArray(plan.retrievalQueries) &&
      plan.retrievalQueries.every((query) => typeof query === "string") &&
      typeof plan.rationale === "string"
  );
}

function isResearchAnswer(value: unknown): value is SecResearchAnswer {
  const answer = value as SecResearchAnswer;
  return Boolean(
    answer &&
      typeof answer.answer === "string" &&
      Array.isArray(answer.keyFindings) &&
      answer.keyFindings.every((finding) => typeof finding === "string") &&
      Array.isArray(answer.caveats) &&
      answer.caveats.every((caveat) => typeof caveat === "string")
  );
}
