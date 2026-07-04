import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { dbFile } from "../lib/paths";
import * as schema from "./schema";

mkdirSync(dirname(dbFile), { recursive: true });

const sqlite = new Database(dbFile);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });

export function createSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sec_company_tickers (
      cik INTEGER PRIMARY KEY,
      cik_padded TEXT NOT NULL,
      ticker TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'sec-company-tickers',
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS sec_company_tickers_ticker_unique
      ON sec_company_tickers (ticker);

    CREATE INDEX IF NOT EXISTS sec_company_tickers_ticker_idx
      ON sec_company_tickers (ticker);

    CREATE INDEX IF NOT EXISTS sec_company_tickers_title_idx
      ON sec_company_tickers (title);

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sec_filings (
      accession_number TEXT PRIMARY KEY,
      cik INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      company_name TEXT NOT NULL,
      form TEXT NOT NULL,
      filing_date TEXT NOT NULL,
      report_date TEXT,
      primary_document TEXT NOT NULL,
      primary_document_url TEXT NOT NULL,
      filing_directory_url TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sec_filings_cik_idx ON sec_filings (cik);
    CREATE INDEX IF NOT EXISTS sec_filings_ticker_idx ON sec_filings (ticker);
    CREATE INDEX IF NOT EXISTS sec_filings_form_idx ON sec_filings (form);
    CREATE INDEX IF NOT EXISTS sec_filings_filing_date_idx ON sec_filings (filing_date);

    CREATE TABLE IF NOT EXISTS sec_filing_documents (
      id TEXT PRIMARY KEY,
      accession_number TEXT NOT NULL,
      cik INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER,
      url TEXT NOT NULL,
      is_exhibit_10_1 INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sec_filing_documents_accession_idx
      ON sec_filing_documents (accession_number);

    CREATE INDEX IF NOT EXISTS sec_filing_documents_exhibit_10_1_idx
      ON sec_filing_documents (is_exhibit_10_1);
  `);
}
