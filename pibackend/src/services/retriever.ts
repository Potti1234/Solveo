import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { vultrDocumentCollections } from "../db/schema";
import type { Citation, CovenantKeywordScan, FinancialLineItem, RetrievalBlock } from "../types";
import { llmClient, type VectorSearchResult } from "./vultr";

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
  const collection = await ensureDocumentCollection(documentUrl);

  if (collection) {
    const hits = [];
    for (const keyword of keywords) {
      const results = await llmClient.searchCollection(collection.collectionId, keyword);
      hits.push({
        keyword,
        found: results.length > 0,
        citations: results.length > 0 ? results.slice(0, 3).map((result, index) => resultCitation(documentUrl, keyword, result, index)) : []
      });
    }

    return {
      documentUrl,
      model: "flash",
      keywords,
      hits
    };
  }

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
  const collection = await ensureDocumentCollection(request.documentUrl);
  if (collection) {
    const rawResults = await llmClient.searchCollection(collection.collectionId, request.query);
    const extraction = await llmClient.ragJson(
      collection.collectionId,
      [
        {
          role: "system",
          content:
            "You extract financial covenant evidence from SEC filings and credit agreements. Return strict JSON with lineItems and citations. lineItems require name, value, unit, period, citations. citations require source, locator, excerpt. Use null/empty arrays when a number is not present."
        },
        {
          role: "user",
          content: JSON.stringify({
            documentUrl: request.documentUrl,
            query: request.query,
            reasoning: request.reasoning,
            searchResults: rawResults.slice(0, 8)
          })
        }
      ],
      () => fallbackExtraction(request.documentUrl, request.query, rawResults),
      isExtraction
    );

    return {
      query: request.query,
      reasoning: request.reasoning,
      model: request.model ?? "prime",
      lineItems: extraction.lineItems.length > 0 ? extraction.lineItems : inferLineItemsFromResults(request.documentUrl, request.query, rawResults),
      citations: extraction.citations.length > 0 ? extraction.citations : rawResults.slice(0, 5).map((result, index) => resultCitation(request.documentUrl, request.query, result, index)),
      rawResults: rawResults.slice(0, 8)
    };
  }

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

type DocumentCollection = {
  collectionId: string;
  collectionName: string;
};

type RetrieverExtraction = {
  lineItems: FinancialLineItem[];
  citations: Citation[];
};

async function ensureDocumentCollection(documentUrl: string): Promise<DocumentCollection | null> {
  if (!llmClient.live) return null;

  const existing = db
    .select()
    .from(vultrDocumentCollections)
    .where(eq(vultrDocumentCollections.documentUrl, documentUrl))
    .limit(1)
    .get();
  if (existing) {
    const existingItems = await llmClient.listCollectionItems(existing.collectionId);
    if (existingItems.length === 0) {
      await indexDocumentIntoCollection(existing.collectionId, documentUrl);
    }
    return { collectionId: existing.collectionId, collectionName: existing.collectionName };
  }

  const documentText = await fetchDocumentText(documentUrl);
  if (!documentText.trim()) return null;

  const contentHash = createHash("sha256").update(documentText).digest("hex");
  const collectionName = `vultr-audit-v2-${createHash("sha1").update(documentUrl).digest("hex").slice(0, 16)}`;
  const collectionId = await llmClient.createCollection(collectionName);
  if (!collectionId) return null;

  const indexed = await addDocumentChunks(collectionId, documentText, documentUrl);
  if (!indexed) return null;

  const now = new Date().toISOString();
  db.insert(vultrDocumentCollections)
    .values({
      documentUrl,
      collectionId,
      collectionName,
      contentHash,
      indexedAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: vultrDocumentCollections.documentUrl,
      set: { collectionId, collectionName, contentHash, updatedAt: now }
    })
    .run();

  return { collectionId, collectionName };
}

async function indexDocumentIntoCollection(collectionId: string, documentUrl: string): Promise<boolean> {
  const documentText = await fetchDocumentText(documentUrl);
  if (!documentText.trim()) return false;
  return addDocumentChunks(collectionId, documentText, documentUrl);
}

async function fetchDocumentText(documentUrl: string): Promise<string> {
  const response = await fetch(documentUrl, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT ?? "MyHackathonProject (email@example.com)",
      Accept: "text/html, text/plain, application/xhtml+xml, */*"
    }
  });
  if (!response.ok) return "";

  const text = await response.text();
  return normalizeDocumentText(text).slice(0, Number(process.env.VULTR_RETRIEVER_MAX_DOCUMENT_CHARS ?? 240_000));
}

function normalizeDocumentText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function addDocumentChunks(collectionId: string, documentText: string, documentUrl: string): Promise<boolean> {
  const chunks = chunkText(documentText, Number(process.env.VULTR_RETRIEVER_CHUNK_CHARS ?? 12_000));
  if (chunks.length === 0) return false;

  let added = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const ok = await llmClient.addCollectionItem(
      collectionId,
      chunks[index],
      `SEC document chunk ${index + 1}/${chunks.length}: ${documentUrl}`
    );
    if (ok) added += 1;
  }
  return added > 0;
}

function chunkText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const hardEnd = Math.min(cursor + maxChars, text.length);
    const softEnd = text.lastIndexOf(" ", hardEnd);
    const end = softEnd > cursor + maxChars * 0.6 ? softEnd : hardEnd;
    const chunk = text.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    cursor = end + 1;
  }

  return chunks;
}

function resultCitation(documentUrl: string, query: string, result: VectorSearchResult, index: number): Citation {
  return {
    source: documentUrl,
    locator: `${query}#result-${index + 1}`,
    excerpt: result.content.slice(0, 500)
  };
}

function fallbackExtraction(documentUrl: string, query: string, rawResults: VectorSearchResult[]): RetrieverExtraction {
  return {
    lineItems: inferLineItemsFromResults(documentUrl, query, rawResults),
    citations: rawResults.slice(0, 5).map((result, index) => resultCitation(documentUrl, query, result, index))
  };
}

function inferLineItemsFromResults(documentUrl: string, query: string, rawResults: VectorSearchResult[]): FinancialLineItem[] {
  const text = rawResults.map((result) => result.content).join(" ");
  const items: FinancialLineItem[] = [];

  if (/total debt/i.test(query) || /debt/i.test(query)) {
    const value = firstNumberAfterLabel(text, /total\s+debt/i);
    if (value !== null) {
      items.push({
        name: "Total Debt",
        value,
        unit: "usd",
        period: "latest retrieved period",
        citations: [resultCitation(documentUrl, query, rawResults[0], 0)]
      });
    }
  }

  if (/ebitda/i.test(query)) {
    const value = firstNumberAfterLabel(text, /(?:adjusted\s+)?ebitda/i);
    if (value !== null) {
      items.push({
        name: "EBITDA",
        value,
        unit: "usd",
        period: "latest retrieved period",
        citations: [resultCitation(documentUrl, query, rawResults[0], 0)]
      });
    }
  }

  return items;
}

function parseFinancialNumber(value: string): number {
  return Number(value.replace(/[,\s]/g, ""));
}

function firstNumberAfterLabel(text: string, label: RegExp): number | null {
  const labelMatch = label.exec(text);
  if (!labelMatch || labelMatch.index < 0) return null;

  const afterLabel = text.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 80);
  const grouped = /(\d{1,3}(?:,\s*\d{3})+)/.exec(afterLabel);
  if (grouped) return parseFinancialNumber(grouped[1]);

  const plain = /(\d+(?:\.\d+)?)/.exec(afterLabel);
  return plain ? parseFinancialNumber(plain[1]) : null;
}

function isExtraction(value: unknown): value is RetrieverExtraction {
  if (!value || typeof value !== "object") return false;
  const payload = value as RetrieverExtraction;
  return (
    Array.isArray(payload.lineItems) &&
    payload.lineItems.every(isLineItem) &&
    Array.isArray(payload.citations) &&
    payload.citations.every(isCitation)
  );
}

function isLineItem(value: unknown): value is FinancialLineItem {
  if (!value || typeof value !== "object") return false;
  const item = value as FinancialLineItem;
  return (
    typeof item.name === "string" &&
    typeof item.value === "number" &&
    (item.unit === "usd" || item.unit === "ratio") &&
    typeof item.period === "string" &&
    Array.isArray(item.citations) &&
    item.citations.every(isCitation)
  );
}

function isCitation(value: unknown): value is Citation {
  if (!value || typeof value !== "object") return false;
  const citation = value as Citation;
  return typeof citation.source === "string" && typeof citation.locator === "string" && typeof citation.excerpt === "string";
}
