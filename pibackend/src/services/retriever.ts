import type { Citation, CovenantKeywordScan, RetrievalBlock } from "../types";

export type RetrieverRequest = {
  documentUrl: string;
  query: string;
  reasoning: string;
  model?: "flash" | "prime";
};

export const COVENANT_DISCOVERY_KEYWORDS = [
  "Financial Covenants",
  "Consolidated Leverage Ratio",
  "Fixed Charge Coverage Ratio",
  "Negative Covenants",
  "Compliance Certificate",
  "Form of Compliance Certificate"
] as const;

export async function scanCovenantKeywords(documentUrl: string): Promise<CovenantKeywordScan> {
  const keywords = [...COVENANT_DISCOVERY_KEYWORDS];

  return {
    documentUrl,
    model: "flash",
    keywords,
    hits: keywords.map((keyword) => ({
      keyword,
      found: false,
      citations: [placeholderCitation(documentUrl, "flash-keyword-scan", `Scan for "${keyword}" with VultronRetrieverFlash.`)]
    }))
  };
}

export async function retrieveFinancialContext(request: RetrieverRequest): Promise<RetrievalBlock> {
  // Reference point for VultronRetriever integration. The production version should
  // post the source document and query to Vultr, then normalize returned table cells
  // into FinancialLineItem records with page/paragraph citations.
  return {
    query: request.query,
    reasoning: request.reasoning,
    model: request.model ?? "prime",
    lineItems: [],
    citations: [placeholderCitation(request.documentUrl, `${request.model ?? "prime"}-retriever-placeholder`, "Wire this to VultronRetriever for layout-aware extraction.")]
  };
}

export async function extractCovenantRulesContext(documentUrl: string, keywordScan: CovenantKeywordScan): Promise<RetrievalBlock> {
  const query = COVENANT_DISCOVERY_KEYWORDS.join(" OR ");
  return retrieveFinancialContext({
    documentUrl,
    query,
    model: "prime",
    reasoning:
      "Use VultronRetrieverPrime on the pages identified by the Flash keyword scan to extract covenant limits, definitions, and compliance certificate language."
  }).then((block) => ({
    ...block,
    citations: [...block.citations, ...keywordScan.hits.flatMap((hit) => hit.citations)]
  }));
}

function placeholderCitation(source: string, locator: string, excerpt: string): Citation {
  return { source, locator, excerpt };
}
