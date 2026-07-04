import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { vultrDocumentCollections } from "../db/schema";
import type { Citation, CovenantKeywordScan, CovenantRule, CovenantRulebook, FinancialLineItem, RetrievalBlock } from "../types";
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
  const documentText = await fetchDocumentText(documentUrl);
  const textHits = keywordHitsFromText(documentUrl, documentText, keywords);
  if (textHits.some((hit) => hit.found)) {
    return {
      documentUrl,
      model: "flash",
      keywords,
      hits: textHits
    };
  }

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
      citations: [systemCitation(documentUrl, "flash-keyword-scan", `Scan for "${keyword}" with VultronRetrieverFlash.`)]
    }))
  };
}

export async function retrieveFinancialContext(request: RetrieverRequest): Promise<RetrievalBlock> {
  const documentLineItems = await inferLineItemsFromDocument(request.documentUrl, request.query);
  if (documentLineItems.length > 0) {
    return {
      query: request.query,
      reasoning: request.reasoning,
      model: request.model ?? "prime",
      lineItems: documentLineItems,
      citations: uniqueCitations(documentLineItems.flatMap((item) => item.citations))
    };
  }

  const collection = await ensureDocumentCollection(request.documentUrl);
  if (collection) {
    const rawResults = await searchExpanded(collection.collectionId, request.query);
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

    const inferredLineItems =
      extraction.lineItems.length > 0 ? extraction.lineItems : await inferLineItems(request.documentUrl, request.query, rawResults);

    return {
      query: request.query,
      reasoning: request.reasoning,
      model: request.model ?? "prime",
      lineItems: inferredLineItems,
      citations: extraction.citations.length > 0 ? extraction.citations : rawResults.slice(0, 5).map((result, index) => resultCitation(request.documentUrl, request.query, result, index)),
      rawResults: rawResults.slice(0, 8)
    };
  }

  return {
    query: request.query,
    reasoning: request.reasoning,
    model: request.model ?? "prime",
    lineItems: [],
    citations: [
      systemCitation(
        request.documentUrl,
        `${request.model ?? "prime"}-retriever-unavailable`,
        "Live document retrieval was unavailable for this request; no measured line items were extracted."
      )
    ]
  };
}

export async function extractCovenantRulebookFromDocument(documentUrl: string, borrower: string): Promise<CovenantRulebook | null> {
  const documentText = await fetchDocumentText(documentUrl, Number(process.env.COVENANT_EXTRACTION_MAX_DOCUMENT_CHARS ?? 1_500_000));
  const section = extractFinancialCovenantSection(documentText);
  if (!section) return null;

  const rules: CovenantRule[] = [];
  const leverageRule = extractRatioRule({
    documentUrl,
    section,
    name: "Total Net Leverage Ratio",
    metric: "debt_to_ebitda",
    operator: "<=",
    trigger: /Total\s+Net\s+Leverage\s+Ratio/i,
    comparator: /(?:greater\s+than|exceed)/i
  });
  if (leverageRule) rules.push(leverageRule);

  const coverageRule = extractRatioRule({
    documentUrl,
    section,
    name: "Interest Coverage Ratio",
    metric: "interest_coverage",
    operator: ">=",
    trigger: /Interest\s+Coverage\s+Ratio/i,
    comparator: /less\s+than/i
  });
  if (coverageRule) rules.push(coverageRule);

  if (rules.length === 0) return null;

  return {
    borrower,
    agreementName: "Credit agreement extracted financial covenants",
    extractedAt: new Date().toISOString(),
    rules
  };
}

async function searchExpanded(collectionId: string, query: string): Promise<VectorSearchResult[]> {
  const queries = expandedQueries(query);
  const seen = new Set<string>();
  const results: VectorSearchResult[] = [];

  for (const expandedQuery of queries) {
    for (const result of await llmClient.searchCollection(collectionId, expandedQuery)) {
      const key = result.content.slice(0, 240);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(result);
    }
  }

  return prioritizeResults(query, results).slice(0, 12);
}

function expandedQueries(query: string): string[] {
  const queries = [query];
  if (/debt/i.test(query)) {
    queries.push("total long-term debt");
    queries.push("lease and other obligations total debt");
    queries.push("notes due total debt current portion");
  }
  if (/ebitda/i.test(query)) {
    queries.push("net income interest expense income taxes depreciation amortization");
    queries.push("operating income depreciation amortization interest expense income tax");
    queries.push("adjusted EBITDA reconciliation");
  }
  return queries;
}

function prioritizeResults(query: string, results: VectorSearchResult[]): VectorSearchResult[] {
  return [...results].sort((a, b) => scoreResult(query, b.content) - scoreResult(query, a.content));
}

function scoreResult(query: string, content: string): number {
  const text = content.toLowerCase();
  let score = 0;
  if (/debt/i.test(query)) {
    if (text.includes("total debt")) score += 10;
    if (text.includes("total long-term debt")) score += 5;
    if (text.includes("current portion")) score += 3;
    if (text.includes("notes due")) score += 2;
  }
  if (/ebitda/i.test(query)) {
    if (text.includes("ebitda")) score += 10;
    if (text.includes("net income")) score += 4;
    if (text.includes("depreciation")) score += 3;
    if (text.includes("amortization")) score += 3;
    if (text.includes("interest expense")) score += 2;
    if (text.includes("income tax")) score += 2;
  }
  return score;
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

function systemCitation(source: string, locator: string, excerpt: string): Citation {
  return { source, locator, excerpt };
}

function keywordHitsFromText(documentUrl: string, text: string, keywords: readonly string[]): CovenantKeywordScan["hits"] {
  return keywords.map((keyword) => {
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index < 0) return { keyword, found: false, citations: [] };
    return {
      keyword,
      found: true,
      citations: [
        {
          source: documentUrl,
          locator: `document-text-keyword-${slug(keyword)}`,
          excerpt: excerptAt(text, index, 500)
        }
      ]
    };
  });
}

function extractFinancialCovenantSection(text: string): string | null {
  const matches = [...text.matchAll(/section\s+7\.11\s+financial\s+covenants?/gi)];
  const bodyMatch = matches.at(-1);
  if (bodyMatch?.index === undefined) return null;
  const rest = text.slice(bodyMatch.index);
  const endMatch = /article\s+viii|section\s+8\.01/i.exec(rest);
  return rest.slice(0, endMatch?.index ?? Math.min(rest.length, 8_000));
}

function extractRatioRule(input: {
  documentUrl: string;
  section: string;
  name: string;
  metric: CovenantRule["metric"];
  operator: CovenantRule["operator"];
  trigger: RegExp;
  comparator: RegExp;
}): CovenantRule | null {
  const triggerMatch = input.trigger.exec(input.section);
  if (triggerMatch?.index === undefined) return null;
  const afterTrigger = input.section.slice(triggerMatch.index, triggerMatch.index + 1_800);
  const comparatorMatch = input.comparator.exec(afterTrigger);
  if (comparatorMatch?.index === undefined) return null;
  const afterComparator = afterTrigger.slice(comparatorMatch.index);
  const ratioMatch = /(\d+(?:\.\d+)?)\s+to\s+1\.00/i.exec(afterComparator);
  if (!ratioMatch) return null;

  const threshold = Number(ratioMatch[1]);
  if (!Number.isFinite(threshold)) return null;

  return {
    id: slug(input.name),
    name: input.name,
    metric: input.metric,
    operator: input.operator,
    threshold,
    unit: "ratio",
    period: "trailing_twelve_months",
    citations: [
      {
        source: input.documentUrl,
        locator: `document-text-covenant-${slug(input.name)}`,
        excerpt: excerptAt(input.section, triggerMatch.index, 1_000)
      }
    ]
  };
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

async function fetchDocumentText(documentUrl: string, maxChars = Number(process.env.VULTR_RETRIEVER_MAX_DOCUMENT_CHARS ?? 240_000)): Promise<string> {
  const response = await fetch(documentUrl, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT ?? "MyHackathonProject (email@example.com)",
      Accept: "text/html, text/plain, application/xhtml+xml, */*"
    }
  });
  if (!response.ok) return "";

  const text = await response.text();
  return normalizeDocumentText(text).slice(0, maxChars);
}

function normalizeDocumentText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
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

async function inferLineItems(documentUrl: string, query: string, rawResults: VectorSearchResult[]): Promise<FinancialLineItem[]> {
  const fromResults = inferLineItemsFromResults(documentUrl, query, rawResults);
  if (!/ebitda/i.test(query) || fromResults.some((item) => item.name === "EBITDA")) return fromResults;

  const documentText = await fetchDocumentText(documentUrl);
  const fromDocument = inferEbitdaComponentsFromText(documentUrl, documentText);
  return mergeLineItems(fromResults, fromDocument);
}

async function inferLineItemsFromDocument(documentUrl: string, query: string): Promise<FinancialLineItem[]> {
  if (!/debt|ebitda|net income|interest|tax|depreciation|amortization|coverage/i.test(query)) return [];
  const documentText = await fetchDocumentText(documentUrl);
  if (!documentText) return [];

  const items: FinancialLineItem[] = [];
  if (/debt/i.test(query)) {
    const debtItem = inferTotalDebtFromText(documentUrl, documentText);
    if (debtItem) items.push(debtItem);
  }

  if (/ebitda|net income|interest|tax|depreciation|amortization|coverage/i.test(query)) {
    items.push(...inferEbitdaComponentsFromText(documentUrl, documentText));
  }

  return mergeLineItems([], items);
}

function inferLineItemsFromResults(documentUrl: string, query: string, rawResults: VectorSearchResult[]): FinancialLineItem[] {
  const text = rawResults.map((result) => result.content).join(" ");
  const items: FinancialLineItem[] = [];
  const multiplier = inferFinancialScale(text, documentUrl);

  if (/total debt/i.test(query) || /debt/i.test(query)) {
    const value = firstNumberAfterLabel(text, /total\s+debt/i);
    if (value !== null) {
      items.push({
        name: "Total Debt",
        value: value * multiplier,
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
        value: value * multiplier,
        unit: "usd",
        period: "latest retrieved period",
        citations: [resultCitation(documentUrl, query, rawResults[0], 0)]
      });
    }
  }

  return items;
}

function inferTotalDebtFromText(documentUrl: string, text: string): FinancialLineItem | null {
  const multiplier = inferFinancialScale(text, documentUrl);
  const match = /total\s+debt\s+\$?\s*(\d{1,3}(?:,\s*\d{3})+|\d+(?:\.\d+)?)/i.exec(text);
  if (match?.index === undefined) return null;

  return {
    name: "Total Debt",
    value: parseFinancialNumber(match[1]) * multiplier,
    unit: "usd",
    period: "latest retrieved period",
    citations: [
      {
        source: documentUrl,
        locator: "document-text-total-debt",
        excerpt: excerptAt(text, match.index, 500)
      }
    ]
  };
}

function inferEbitdaComponentsFromText(documentUrl: string, text: string): FinancialLineItem[] {
  const items: FinancialLineItem[] = [];
  const multiplier = inferFinancialScale(text, documentUrl);
  const components = [
    { name: "Net Income", label: /net\s+income(?!\s+attributable)/i, valueIndex: 2 },
    { name: "Interest Expense", label: /interest\s+expense/i, valueIndex: 2 },
    { name: "Income Tax Expense", label: /income\s+tax\s+expense/i, valueIndex: 2 },
    { name: "Depreciation", label: /depreciation(?!\s+and\s+amortization)/i, valueIndex: 0 },
    { name: "Amortization", label: /amortization/i, valueIndex: 0 }
  ];

  for (const component of components) {
    const parsed = statementValueAfterLabel(text, component.label, component.valueIndex);
    if (!parsed) continue;
    items.push({
      name: component.name,
      value: parsed.value * multiplier,
      unit: "usd",
      period: parsed.period,
      citations: [
        {
          source: documentUrl,
          locator: `document-text-${slug(component.name)}`,
          excerpt: parsed.excerpt.slice(0, 500)
        }
      ]
    });
  }

  const byName = new Map(items.map((item) => [item.name, item.value]));
  const required = ["Net Income", "Interest Expense", "Income Tax Expense", "Depreciation", "Amortization"];
  if (required.every((name) => byName.has(name))) {
    const value = required.reduce((sum, name) => sum + (byName.get(name) ?? 0), 0);
    items.push({
      name: "EBITDA",
      value,
      unit: "usd",
      period: "derived from latest available nine-month period",
      citations: items.flatMap((item) => item.citations).slice(0, 5)
    });
  }

  return items;
}

function parseFinancialNumber(value: string): number {
  return Number(value.replace(/[,\s]/g, ""));
}

function firstNumberAfterLabel(text: string, label: RegExp): number | null {
  const matcher = new RegExp(label.source, label.flags.includes("i") ? "gi" : "g");
  const candidates: number[] = [];
  let labelMatch: RegExpExecArray | null;

  while ((labelMatch = matcher.exec(text)) !== null) {
    const afterLabel = text.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 120);
    const grouped = /(\d{1,3}(?:,\s*\d{3})+)/.exec(afterLabel);
    if (grouped) {
      candidates.push(parseFinancialNumber(grouped[1]));
      continue;
    }

    const plain = /(\d+(?:\.\d+)?)/.exec(afterLabel);
    if (plain) candidates.push(parseFinancialNumber(plain[1]));
  }

  const meaningful = candidates.find((candidate) => candidate > 100);
  return meaningful ?? candidates[0] ?? null;
}

function statementValueAfterLabel(text: string, label: RegExp, valueIndex: number): { value: number; period: string; excerpt: string } | null {
  const matcher = new RegExp(label.source, label.flags.includes("i") ? "gi" : "g");
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    const excerpt = text.slice(Math.max(0, match.index - 120), match.index + 420);
    const afterLabel = text.slice(match.index + match[0].length, match.index + match[0].length + 180);
    const values = financialNumbers(afterLabel);
    if (values.length === 0) continue;

    return {
      value: values[valueIndex] ?? values[0],
      period: valueIndex === 2 ? "nine months ended current year" : "latest current period",
      excerpt
    };
  }

  return null;
}

function financialNumbers(text: string): number[] {
  const matches = text.matchAll(/\(?\s*\$?\s*(\d{1,3}(?:,\s*\d{3})+|\d+(?:\.\d+)?)\s*\)?/g);
  return [...matches].map((match) => parseFinancialNumber(match[1])).filter((value) => Number.isFinite(value));
}

function mergeLineItems(primary: FinancialLineItem[], secondary: FinancialLineItem[]): FinancialLineItem[] {
  const byName = new Map<string, FinancialLineItem>();
  for (const item of [...primary, ...secondary]) {
    byName.set(item.name, item);
  }
  return [...byName.values()];
}

function inferFinancialScale(text: string, documentUrl: string): number {
  if (/\b(in|amounts in|dollars in)\s+millions\b/i.test(text)) return 1_000_000;
  if (/\b(in|amounts in|dollars in)\s+thousands\b/i.test(text)) return 1_000;
  if (/\/Archives\/edgar\/data\//i.test(documentUrl)) return 1_000_000;
  return 1;
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

function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const result: Citation[] = [];
  for (const citation of citations) {
    const key = `${citation.source}:${citation.locator}:${citation.excerpt.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(citation);
  }
  return result;
}

function excerptAt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - Math.floor(length / 3));
  return text.slice(start, Math.min(text.length, start + length)).trim();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
