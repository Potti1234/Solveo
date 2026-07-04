import { eq, like, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { secCompanyTickers, syncState, type NewSecCompanyTicker } from "../db/schema";
import type { SecCompany } from "../types";

const SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const TICKER_SYNC_KEY = "sec_company_tickers_last_sync";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type SecFilingReference = {
  ticker: string;
  cik: number | null;
  filingType: "10-Q" | "10-K";
  accessionNumber: string;
  filedAt: string;
  url: string;
};

export async function findLatestFiling(ticker: string, filingType: "10-Q" | "10-K"): Promise<SecFilingReference> {
  const company = await resolveCompanyTicker(ticker);
  const normalizedTicker = company?.ticker ?? ticker.trim().toUpperCase();

  // Reference point for the pivot: replace this deterministic URL with SEC EDGAR
  // submissions data or SEC-API.io once the ingestion path is implemented.
  return {
    ticker: normalizedTicker,
    cik: company?.cik ?? null,
    filingType,
    accessionNumber: "placeholder",
    filedAt: new Date().toISOString(),
    url: company
      ? `https://www.sec.gov/edgar/browse/?CIK=${company.cikPadded}&owner=exclude&action=getcompany`
      : `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(normalizedTicker)}&forms=${filingType}`
  };
}

export async function resolveCompanyTicker(input: string): Promise<SecCompany | null> {
  await ensureCompanyTickerCache();

  const normalized = input.trim().toUpperCase();
  if (!normalized) return null;

  const exactTicker = db
    .select()
    .from(secCompanyTickers)
    .where(eq(secCompanyTickers.ticker, normalized))
    .limit(1)
    .get();
  if (exactTicker) return toSecCompany(exactTicker);

  const cik = Number(normalized);
  if (Number.isInteger(cik) && cik > 0) {
    const exactCik = db.select().from(secCompanyTickers).where(eq(secCompanyTickers.cik, cik)).limit(1).get();
    if (exactCik) return toSecCompany(exactCik);
  }

  return null;
}

export async function searchCompanyTickers(query: string, limit = 20): Promise<SecCompany[]> {
  await ensureCompanyTickerCache();

  const normalized = query.trim().toUpperCase();
  if (!normalized) return [];

  const boundedLimit = Math.min(Math.max(limit, 1), 50);
  const pattern = `%${escapeLike(normalized)}%`;

  const rows = db
    .select()
    .from(secCompanyTickers)
    .where(or(like(secCompanyTickers.ticker, pattern), like(secCompanyTickers.title, pattern)))
    .orderBy(
      sql`CASE
        WHEN ${secCompanyTickers.ticker} = ${normalized} THEN 0
        WHEN ${secCompanyTickers.ticker} LIKE ${`${normalized}%`} THEN 1
        ELSE 2
      END`,
      secCompanyTickers.ticker
    )
    .limit(boundedLimit)
    .all();

  return rows.map(toSecCompany);
}

export async function ensureCompanyTickerCache(ttlMs = DEFAULT_CACHE_TTL_MS): Promise<void> {
  const lastSync = db.select().from(syncState).where(eq(syncState.key, TICKER_SYNC_KEY)).limit(1).get();
  if (lastSync && Date.now() - Date.parse(lastSync.value) < ttlMs) {
    const hasRows = db.select({ count: sql<number>`count(*)` }).from(secCompanyTickers).get();
    if ((hasRows?.count ?? 0) > 0) return;
  }

  await syncCompanyTickers();
}

export async function syncCompanyTickers(): Promise<{ count: number; syncedAt: string }> {
  const response = await fetch(SEC_COMPANY_TICKERS_URL, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT ?? "Vultr-Audit local development contact@example.com",
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`SEC ticker sync failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, SecCompanyTickerPayload>;
  const syncedAt = new Date().toISOString();
  const rows = Object.values(payload).map((entry): NewSecCompanyTicker => {
    const cik = Number(entry.cik_str);
    return {
      cik,
      cikPadded: String(cik).padStart(10, "0"),
      ticker: String(entry.ticker).toUpperCase(),
      title: String(entry.title),
      source: SEC_COMPANY_TICKERS_URL,
      updatedAt: syncedAt
    };
  });

  db.transaction(() => {
    for (const row of rows) {
      db.insert(secCompanyTickers)
        .values(row)
        .onConflictDoUpdate({
          target: secCompanyTickers.cik,
          set: {
            cikPadded: row.cikPadded,
            ticker: row.ticker,
            title: row.title,
            source: row.source,
            updatedAt: row.updatedAt
          }
        })
        .run();
    }
    db.insert(syncState)
      .values({ key: TICKER_SYNC_KEY, value: syncedAt, updatedAt: syncedAt })
      .onConflictDoUpdate({
        target: syncState.key,
        set: { value: syncedAt, updatedAt: syncedAt }
      })
      .run();
  });

  return { count: rows.length, syncedAt };
}

type SecCompanyTickerPayload = {
  cik_str: number;
  ticker: string;
  title: string;
};

function toSecCompany(row: typeof secCompanyTickers.$inferSelect): SecCompany {
  return {
    cik: row.cik,
    cikPadded: row.cikPadded,
    ticker: row.ticker,
    title: row.title
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
