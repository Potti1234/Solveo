import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const secCompanyTickers = sqliteTable(
  "sec_company_tickers",
  {
    cik: integer("cik").primaryKey(),
    cikPadded: text("cik_padded").notNull(),
    ticker: text("ticker").notNull(),
    title: text("title").notNull(),
    source: text("source").notNull().default("sec-company-tickers"),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    tickerUnique: uniqueIndex("sec_company_tickers_ticker_unique").on(table.ticker),
    tickerIndex: index("sec_company_tickers_ticker_idx").on(table.ticker),
    titleIndex: index("sec_company_tickers_title_idx").on(table.title)
  })
);

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type SecCompanyTicker = typeof secCompanyTickers.$inferSelect;
export type NewSecCompanyTicker = typeof secCompanyTickers.$inferInsert;
