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
  `);
}
