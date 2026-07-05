import { searchCompanyTickers, resolveCompanyTicker } from "./sec";
import { llmClient } from "./vultr";

export type AuditIntent = {
  ticker: string;
  creditAgreementUrl?: string;
};

type LlmIntent = {
  ticker?: string | null;
  companyName?: string | null;
  creditAgreementUrl?: string | null;
};

export async function resolveAuditIntent(prompt: string, providedCreditAgreementUrl?: string): Promise<AuditIntent | null> {
  const creditAgreementUrl = extractUrl(prompt) ?? providedCreditAgreementUrl;
  const llmIntent = await llmClient.chatJson<LlmIntent>(
    [
      {
        role: "system",
        content:
          "Extract the public company ticker and optional SEC credit agreement URL from a bank analyst instruction. Return strict JSON with ticker, companyName, creditAgreementUrl. If no ticker is explicit but a company name is present, set companyName. Do not guess unrelated tickers."
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
    creditAgreementUrl: llmIntent.creditAgreementUrl ?? creditAgreementUrl
  };
}

async function resolveIntentTicker(intent: LlmIntent, prompt: string) {
  if (intent.ticker) {
    const company = await resolveCompanyTicker(intent.ticker);
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
  const ticker = extractContextTicker(prompt);
  const companyName = extractCompanyName(prompt);
  return {
    ticker,
    companyName,
    creditAgreementUrl: extractUrl(prompt) ?? creditAgreementUrl ?? null
  };
}

function extractContextTicker(prompt: string) {
  const direct =
    prompt.match(/\b(?:ticker|symbol)\s*[:=]?\s*([A-Za-z.]{1,8})\b/i)?.[1] ??
    prompt.match(/\b(?:analyze|review|check|monitor)\s+([A-Za-z.]{1,8})\b/i)?.[1];
  if (!direct) return null;

  const normalized = direct.replace(/\./g, "-").toUpperCase();
  const ignored = new Set(["THIS", "THE", "WITH", "FOR", "SEC", "URL", "PDF", "FILE", "DEBT", "LOAN"]);
  return ignored.has(normalized) ? null : normalized;
}

function extractCompanyName(prompt: string) {
  const match =
    prompt.match(/\b(?:company|borrower)\s*[:=]?\s*([A-Za-z][A-Za-z0-9 &.,'-]{2,80})/i)?.[1] ??
    prompt.match(/\b(?:analyze|review|check|monitor)\s+([A-Z][A-Za-z0-9 &.,'-]{2,80})/i)?.[1];
  return match?.replace(/\s+(with|using|against|from|and)\b.*$/i, "").trim() ?? null;
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
    optionalString(row.creditAgreementUrl)
  );
}

function optionalString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}
