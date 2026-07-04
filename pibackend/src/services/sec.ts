import { eq, like, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  secCompanyTickers,
  secFilingDocuments,
  secFilings,
  syncState,
  type NewSecCompanyTicker,
  type NewSecFiling,
  type NewSecFilingDocument
} from "../db/schema";
import type { ExhibitDiscovery, SecCompany, SecFilingDocument, SecRecentFiling } from "../types";

const SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_SUBMISSIONS_BASE_URL = "https://data.sec.gov/submissions";
const SEC_ARCHIVES_BASE_URL = "https://www.sec.gov/Archives/edgar/data";
const TICKER_SYNC_KEY = "sec_company_tickers_last_sync";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const COVENANT_EXHIBIT_FORMS = new Set(["10-K", "8-K"]);

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
  const recentFilings = company ? await fetchRecentFilings(company, 80) : [];
  const recentFiling =
    recentFilings.find((filing) => filing.form === filingType) ??
    recentFilings.find((filing) => filing.form === "10-Q" || filing.form === "10-K") ??
    null;

  return {
    ticker: normalizedTicker,
    cik: company?.cik ?? null,
    filingType: (recentFiling?.form === "10-K" || recentFiling?.form === "10-Q" ? recentFiling.form : filingType) as "10-Q" | "10-K",
    accessionNumber: recentFiling?.accessionNumber ?? "placeholder",
    filedAt: recentFiling?.filingDate ?? new Date().toISOString(),
    url:
      recentFiling?.primaryDocumentUrl ??
      (company
        ? `https://www.sec.gov/edgar/browse/?CIK=${company.cikPadded}&owner=exclude&action=getcompany`
        : `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(normalizedTicker)}&forms=${filingType}`)
  };
}

export async function discoverCreditAgreementExhibits(ticker: string, limit = 20): Promise<ExhibitDiscovery> {
  const company = await resolveCompanyTicker(ticker);
  if (!company) throw new Error(`SEC ticker not found: ${ticker}`);

  const recentFilings = await fetchRecentFilings(company, limit);
  const targetFilings = recentFilings.filter((filing) => COVENANT_EXHIBIT_FORMS.has(filing.form));
  const exhibitCandidates: SecFilingDocument[] = [];

  for (const filing of targetFilings) {
    const documents = await fetchFilingDocuments(filing);
    exhibitCandidates.push(...documents.filter((document) => document.isExhibit101));
  }

  return {
    company,
    filings: targetFilings,
    exhibitCandidates
  };
}

export async function fetchRecentFilings(company: SecCompany, limit = 40): Promise<SecRecentFiling[]> {
  const response = await secFetch(`${SEC_SUBMISSIONS_BASE_URL}/CIK${company.cikPadded}.json`);
  const payload = (await response.json()) as SecSubmissionPayload;
  const recent = payload.filings.recent;
  const count = Math.min(limit, recent.accessionNumber.length);
  const syncedAt = new Date().toISOString();
  const filings: SecRecentFiling[] = [];

  for (let index = 0; index < count; index += 1) {
    const accessionNumber = String(recent.accessionNumber[index]);
    const primaryDocument = String(recent.primaryDocument[index] ?? "");
    const filing = {
      accessionNumber,
      cik: company.cik,
      ticker: company.ticker,
      companyName: company.title,
      form: String(recent.form[index] ?? ""),
      filingDate: String(recent.filingDate[index] ?? ""),
      reportDate: recent.reportDate[index] ? String(recent.reportDate[index]) : null,
      primaryDocument,
      primaryDocumentUrl: buildArchiveUrl(company.cik, accessionNumber, primaryDocument),
      filingDirectoryUrl: buildFilingDirectoryUrl(company.cik, accessionNumber)
    };
    filings.push(filing);
  }

  cacheRecentFilings(filings, syncedAt);
  return filings;
}

export async function fetchFilingDocuments(filing: SecRecentFiling): Promise<SecFilingDocument[]> {
  const response = await secFetch(`${filing.filingDirectoryUrl}/index.json`);
  const payload = (await response.json()) as SecFilingIndexPayload;
  const syncedAt = new Date().toISOString();
  const documents = payload.directory.item.map((item) => {
    const name = String(item.name);
    return {
      accessionNumber: filing.accessionNumber,
      cik: filing.cik,
      name,
      type: String(item.type ?? ""),
      size: item.size ? Number(item.size) : null,
      url: buildArchiveUrl(filing.cik, filing.accessionNumber, name),
      isExhibit101: isExhibit101Name(name)
    };
  });

  cacheFilingDocuments(documents, syncedAt);
  return documents;
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
  const response = await secFetch(SEC_COMPANY_TICKERS_URL);

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

type SecSubmissionPayload = {
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
};

type SecFilingIndexPayload = {
  directory: {
    item: Array<{
      name: string;
      type?: string;
      size?: string;
    }>;
  };
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

function cacheRecentFilings(filings: SecRecentFiling[], updatedAt: string) {
  db.transaction(() => {
    for (const filing of filings) {
      const row: NewSecFiling = { ...filing, updatedAt };
      db.insert(secFilings)
        .values(row)
        .onConflictDoUpdate({
          target: secFilings.accessionNumber,
          set: {
            cik: row.cik,
            ticker: row.ticker,
            companyName: row.companyName,
            form: row.form,
            filingDate: row.filingDate,
            reportDate: row.reportDate,
            primaryDocument: row.primaryDocument,
            primaryDocumentUrl: row.primaryDocumentUrl,
            filingDirectoryUrl: row.filingDirectoryUrl,
            updatedAt
          }
        })
        .run();
    }
  });
}

function cacheFilingDocuments(documents: SecFilingDocument[], updatedAt: string) {
  db.transaction(() => {
    for (const document of documents) {
      const row: NewSecFilingDocument = {
        id: `${document.accessionNumber}:${document.name}`,
        accessionNumber: document.accessionNumber,
        cik: document.cik,
        name: document.name,
        type: document.type,
        size: document.size,
        url: document.url,
        isExhibit101: document.isExhibit101 ? 1 : 0,
        updatedAt
      };
      db.insert(secFilingDocuments)
        .values(row)
        .onConflictDoUpdate({
          target: secFilingDocuments.id,
          set: {
            type: row.type,
            size: row.size,
            url: row.url,
            isExhibit101: row.isExhibit101,
            updatedAt
          }
        })
        .run();
    }
  });
}

async function secFetch(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT ?? "MyHackathonProject (email@example.com)",
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`SEC request failed with status ${response.status}: ${url}`);
  }

  return response;
}

function buildArchiveUrl(cik: number, accessionNumber: string, filename: string): string {
  return `${buildFilingDirectoryUrl(cik, accessionNumber)}/${filename}`;
}

function buildFilingDirectoryUrl(cik: number, accessionNumber: string): string {
  return `${SEC_ARCHIVES_BASE_URL}/${cik}/${accessionNumber.replaceAll("-", "")}`;
}

function isExhibit101Name(filename: string): boolean {
  const normalized = filename.toLowerCase().replace(/[_\s.]+/g, "-");
  return (
    normalized.includes("ex-10-1") ||
    normalized.includes("exhibit-10-1") ||
    normalized.includes("10-1") ||
    normalized.includes("101")
  );
}
