import type { RetrievalBlock } from "../types";

export type RetrieverRequest = {
  documentUrl: string;
  query: string;
  reasoning: string;
};

export async function retrieveFinancialContext(request: RetrieverRequest): Promise<RetrievalBlock> {
  // Reference point for VultronRetriever integration. The production version should
  // post the source document and query to Vultr, then normalize returned table cells
  // into FinancialLineItem records with page/paragraph citations.
  return {
    query: request.query,
    reasoning: request.reasoning,
    lineItems: [],
    citations: [
      {
        source: request.documentUrl,
        locator: "retriever-placeholder",
        excerpt: "Wire this to VultronRetriever for layout-aware SEC table extraction."
      }
    ]
  };
}
