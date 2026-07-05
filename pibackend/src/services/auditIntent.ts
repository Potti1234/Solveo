import { searchCompanyTickers, resolveCompanyTicker } from "./sec";
import { llmClient } from "./vultr";

export type AuditIntent = {
  ticker: string;
  creditAgreementUrl?: string;
  workflow: "credit_review" | "sec_research";
};

type LlmIntent = {
  ticker?: string | null;
  companyName?: string | null;
  creditAgreementUrl?: string | null;
  workflow?: "credit_review" | "sec_research" | null;
};

export async function resolveAuditIntent(prompt: string, providedCreditAgreementUrl?: string): Promise<AuditIntent | null> {
  const creditAgreementUrl = extractUrl(prompt) ?? providedCreditAgreementUrl;
  const llmIntent = await llmClient.chatJson<LlmIntent>(
    [
      {
        role: "system",
        content:
          "Extract the public company ticker, optional SEC credit agreement URL, and workflow from an analyst instruction. Return strict JSON with ticker, companyName, creditAgreementUrl, workflow. Use workflow credit_review only for covenant, credit agreement, debt, leverage, liquidity, compliance certificate, or lender monitoring requests. Use sec_research for general SEC filing questions, business analysis, risk factors, revenue, segments, MD&A, legal proceedings, executive compensation, ownership, or other non-covenant filing research. If no ticker is explicit but a company name is present, set companyName. Do not guess unrelated tickers."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    () => fallbackIntent(prompt, creditAgreementUrl),
    isLlmIntent
  );

  const resolved = await resolveIntentTicker(llmIntent, prompt);
  if (!resolved) return null;

  return {
    ticker: resolved.ticker,
    creditAgreementUrl: llmIntent.creditAgreementUrl ?? creditAgreementUrl,
    workflow: llmIntent.workflow ?? classifyWorkflow(prompt, llmIntent.creditAgreementUrl ?? creditAgreementUrl)
  };
}

async function resolveIntentTicker(intent: LlmIntent, prompt: string) {
  if (intent.ticker) {
    const company = await resolveCompanyTicker(intent.ticker);
    if (company) return company;
  }

  for (const candidate of extractTickerCandidates(prompt)) {
    const company = await resolveCompanyTicker(candidate);
    if (company) return company;
  }

  if (intent.companyName) {
    const [company] = await searchCompanyTickers(intent.companyName, 1);
    if (company) return company;
  }

  const fallback = fallbackIntent(prompt);
  if (fallback.ticker) {
    const company = await resolveCompanyTicker(fallback.ticker);
    if (company) return company;
  }

  if (fallback.companyName) {
    const [company] = await searchCompanyTickers(fallback.companyName, 1);
    if (company) return company;
  }

  return null;
}

function fallbackIntent(prompt: string, creditAgreementUrl?: string): LlmIntent {
  const ticker = extractTickerCandidates(prompt)[0] ?? null;
  const companyName = extractCompanyName(prompt);
  return {
    ticker,
    companyName,
    creditAgreementUrl: extractUrl(prompt) ?? creditAgreementUrl ?? null,
    workflow: classifyWorkflow(prompt, creditAgreementUrl)
  };
}

function classifyWorkflow(prompt: string, creditAgreementUrl?: string | null): AuditIntent["workflow"] {
  const normalized = prompt.toLowerCase();
  if (creditAgreementUrl) return "credit_review";
  if (/\b(covenant|credit agreement|loan agreement|leverage|ebitda|debt|liquidity|compliance certificate|borrower|lender|default|headroom)\b/i.test(normalized)) {
    return "credit_review";
  }
  return "sec_research";
}

function extractTickerCandidates(prompt: string) {
  const withoutUrls = prompt.replace(/https?:\/\/\S+/g, " ");
  const ignored = new Set(["THIS", "THE", "WITH", "FOR", "SEC", "URL", "PDF", "FILE", "DEBT", "LOAN"]);
  const candidates: string[] = [];

  for (const match of withoutUrls.matchAll(/\b(?:ticker|symbol|for|company|borrower)\s*[:=]?\s*([A-Za-z][A-Za-z0-9.-]{0,7})\b/gi)) {
    candidates.push(match[1]);
  }

  for (const match of withoutUrls.matchAll(/\b[A-Z][A-Z0-9.-]{0,7}\b/g)) {
    candidates.push(match[0]);
  }

  return [...new Set(candidates.map(normalizeTickerCandidate).filter((candidate) => candidate && !ignored.has(candidate)))];
}

function extractCompanyName(prompt: string) {
  const match =
    prompt.match(/\b(?:company|borrower)\s*[:=]?\s*([A-Za-z][A-Za-z0-9 &.,'-]{2,80})/i)?.[1] ??
    prompt.match(/\bfor\s+([A-Z][A-Za-z0-9 &.,'-]{2,80})/)?.[1] ??
    prompt.match(/\b(?:analyze|review|check|monitor)\s+([A-Z][A-Za-z0-9 &.,'-]{2,80})/)?.[1];
  return match?.replace(/\s+(with|using|against|from|and)\b.*$/i, "").trim() ?? null;
}

function normalizeTickerCandidate(value: string) {
  return value.replace(/\./g, "-").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
}

function extractUrl(prompt: string) {
  return prompt.match(/https?:\/\/[^\s)]+/)?.[0] ?? null;
}

function isLlmIntent(value: unknown): value is LlmIntent {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    optionalString(row.ticker) &&
    optionalString(row.companyName) &&
    optionalString(row.creditAgreementUrl) &&
    (row.workflow === undefined || row.workflow === null || row.workflow === "credit_review" || row.workflow === "sec_research")
  );
}

function optionalString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}
