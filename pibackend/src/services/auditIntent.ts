import { searchCompanyTickers, resolveCompanyTicker } from "./sec";
import { llmClient } from "./vultr";
import type { SecCompany } from "../types";

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

type CompanyChoice = {
  ticker?: string | null;
};

export async function resolveAuditIntent(prompt: string, providedCreditAgreementUrl?: string): Promise<AuditIntent | null> {
  const creditAgreementUrl = extractUrl(prompt) ?? providedCreditAgreementUrl;
  const llmIntent = await extractIntentWithLlm(prompt, creditAgreementUrl, false);

  let resolved = await resolveIntentTicker(llmIntent, prompt);
  let finalIntent = llmIntent;

  if (!resolved || !finalIntent.workflow) {
    finalIntent = await extractIntentWithLlm(prompt, creditAgreementUrl, true);
    resolved = await resolveIntentTicker(finalIntent, prompt);
  }

  if (!resolved) return null;

  return {
    ticker: resolved.ticker,
    creditAgreementUrl: finalIntent.creditAgreementUrl ?? creditAgreementUrl,
    workflow: finalIntent.workflow ?? "credit_review"
  };
}

async function extractIntentWithLlm(prompt: string, creditAgreementUrl: string | undefined, retry: boolean): Promise<LlmIntent> {
  return llmClient.chatJson<LlmIntent>(
    [
      {
        role: "system",
        content:
          "Extract the public company ticker, optional SEC credit agreement URL, and workflow from an analyst instruction. Return strict JSON with ticker, companyName, creditAgreementUrl, workflow. Use workflow credit_review only for covenant, credit agreement, debt, leverage, liquidity, compliance certificate, or lender monitoring requests. Use sec_research for general SEC filing questions, business analysis, risk factors, revenue, segments, MD&A, legal proceedings, executive compensation, ownership, or other non-covenant filing research. If no ticker is explicit but a company name is present, set companyName. Tickers may be lowercase in the prompt, for example 'from mck' means ticker MCK. Do not guess unrelated tickers."
      },
      ...(retry
        ? [
            {
              role: "assistant" as const,
              content: "The first extraction did not resolve against the SEC ticker table. Retry carefully using the candidate tokens."
            },
            {
              role: "user" as const,
              content: JSON.stringify({
                prompt,
                tickerCandidates: extractTickerCandidates(prompt),
                possibleCompanyNames: extractCompanyNameCandidates(prompt),
                creditAgreementUrl
              })
            }
          ]
        : []),
      {
        role: "user",
        content: prompt
      }
    ],
    () => fallbackIntent(prompt, creditAgreementUrl),
    isLlmIntent
  );
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
    const company = await resolveCompanyNameWithSecSearch(intent.companyName, prompt);
    if (company) return company;
  }

  const fallback = fallbackIntent(prompt);
  if (fallback.ticker) {
    const company = await resolveCompanyTicker(fallback.ticker);
    if (company) return company;
  }

  if (fallback.companyName) {
    const company = await resolveCompanyNameWithSecSearch(fallback.companyName, prompt);
    if (company) return company;
  }

  for (const companyName of extractCompanyNameCandidates(prompt)) {
    const company = await resolveCompanyNameWithSecSearch(companyName, prompt);
    if (company) return company;
  }

  return null;
}

function fallbackIntent(prompt: string, creditAgreementUrl?: string): LlmIntent {
  const ticker = extractTickerCandidates(prompt)[0] ?? null;
  const companyName = extractCompanyNameCandidates(prompt)[0] ?? null;
  return {
    ticker,
    companyName,
    creditAgreementUrl: extractUrl(prompt) ?? creditAgreementUrl ?? null,
    workflow: null
  };
}

function extractTickerCandidates(prompt: string) {
  const withoutUrls = prompt.replace(/https?:\/\/\S+/g, " ");
  const ignored = new Set(["THIS", "THE", "WITH", "FOR", "SEC", "URL", "PDF", "FILE", "DEBT", "LOAN"]);
  const candidates: string[] = [];

  for (const match of withoutUrls.matchAll(/\b(?:ticker|symbol|for|from|company|borrower|analyze|review|check|monitor|research)\s*[:=]?\s*([A-Za-z][A-Za-z0-9.-]{0,7})\b/gi)) {
    candidates.push(match[1]);
  }

  for (const match of withoutUrls.matchAll(/\b[A-Z][A-Z0-9.-]{0,7}\b/g)) {
    candidates.push(match[0]);
  }

  return [...new Set(candidates.map(normalizeTickerCandidate).filter((candidate) => candidate && !ignored.has(candidate)))];
}

function extractCompanyNameCandidates(prompt: string) {
  const withoutUrls = prompt.replace(/https?:\/\/\S+/g, " ");
  const candidates: string[] = [];
  const patterns = [
    /\b(?:company|borrower)\s*[:=]?\s*([A-Za-z][A-Za-z0-9 &.,'-]{2,80})/gi,
    /\b(?:for|from|of|about)\s+([A-Za-z][A-Za-z0-9 &.,'-]{2,80})/gi,
    /\b(?:analyze|review|check|monitor|research)\s+([A-Za-z][A-Za-z0-9 &.,'-]{2,80})/gi
  ];

  for (const pattern of patterns) {
    for (const match of withoutUrls.matchAll(pattern)) {
      const candidate = cleanCompanyCandidate(match[1]);
      if (candidate) candidates.push(candidate);
    }
  }

  return [...new Set(candidates)];
}

function cleanCompanyCandidate(value: string) {
  const cleaned = value
    .replace(/\s+(with|using|against|from|for|of|about|and|on|in|over|during|to|that|what|which|who|where|when|why|how)\b.*$/i, "")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
  const ignored = new Set(["the", "last", "recent", "attached", "credit", "review", "agreement", "filings", "reports", "report"]);
  if (!cleaned || ignored.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function normalizeTickerCandidate(value: string) {
  return value.replace(/\./g, "-").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
}

function extractUrl(prompt: string) {
  return prompt.match(/https?:\/\/[^\s)]+/)?.[0] ?? null;
}

async function resolveCompanyNameWithSecSearch(companyName: string, prompt: string): Promise<SecCompany | null> {
  const candidates = await searchCompanyTickers(companyName, 8);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const choice = await llmClient.chatJson<CompanyChoice>(
    [
      {
        role: "system",
        content:
          "Choose the SEC company that best matches the user's company reference. Return strict JSON with ticker. Choose only from the provided SEC candidates. If none fit, return ticker null."
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt,
          companyReference: companyName,
          secCandidates: candidates.map((company) => ({
            ticker: company.ticker,
            title: company.title,
            cik: company.cik
          }))
        })
      }
    ],
    () => ({ ticker: fallbackCompanyTicker(companyName, candidates) }),
    isCompanyChoice
  );

  const ticker = choice.ticker?.toUpperCase();
  if (!ticker) return null;
  return candidates.find((company) => company.ticker === ticker) ?? null;
}

function fallbackCompanyTicker(companyName: string, candidates: SecCompany[]) {
  const normalizedReference = normalizeCompanyText(companyName);
  const exact = candidates.find((company) => normalizeCompanyText(company.title) === normalizedReference);
  if (exact) return exact.ticker;

  const startsWithReference = candidates.find((company) => normalizeCompanyText(company.title).startsWith(`${normalizedReference} `));
  if (startsWithReference) return startsWithReference.ticker;

  return candidates[0]?.ticker ?? null;
}

function normalizeCompanyText(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(incorporated|inc|corp|corporation|company|co|ltd|plc|group|holdings|class|common|stock)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function isCompanyChoice(value: unknown): value is CompanyChoice {
  if (!value || typeof value !== "object") return false;
  return optionalString((value as Record<string, unknown>).ticker);
}

function optionalString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}
