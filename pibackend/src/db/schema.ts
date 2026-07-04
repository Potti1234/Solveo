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

export const secFilings = sqliteTable(
  "sec_filings",
  {
    accessionNumber: text("accession_number").primaryKey(),
    cik: integer("cik").notNull(),
    ticker: text("ticker").notNull(),
    companyName: text("company_name").notNull(),
    form: text("form").notNull(),
    filingDate: text("filing_date").notNull(),
    reportDate: text("report_date"),
    primaryDocument: text("primary_document").notNull(),
    primaryDocumentUrl: text("primary_document_url").notNull(),
    filingDirectoryUrl: text("filing_directory_url").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    cikIndex: index("sec_filings_cik_idx").on(table.cik),
    tickerIndex: index("sec_filings_ticker_idx").on(table.ticker),
    formIndex: index("sec_filings_form_idx").on(table.form),
    filingDateIndex: index("sec_filings_filing_date_idx").on(table.filingDate)
  })
);

export const secFilingDocuments = sqliteTable(
  "sec_filing_documents",
  {
    id: text("id").primaryKey(),
    accessionNumber: text("accession_number").notNull(),
    cik: integer("cik").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    size: integer("size"),
    url: text("url").notNull(),
    isExhibit101: integer("is_exhibit_10_1").notNull().default(0),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    accessionIndex: index("sec_filing_documents_accession_idx").on(table.accessionNumber),
    exhibitIndex: index("sec_filing_documents_exhibit_10_1_idx").on(table.isExhibit101)
  })
);

export const vultrDocumentCollections = sqliteTable(
  "vultr_document_collections",
  {
    documentUrl: text("document_url").primaryKey(),
    collectionId: text("collection_id").notNull(),
    collectionName: text("collection_name").notNull(),
    contentHash: text("content_hash").notNull(),
    indexedAt: text("indexed_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    collectionIndex: index("vultr_document_collections_collection_idx").on(table.collectionId)
  })
);

export type SecCompanyTicker = typeof secCompanyTickers.$inferSelect;
export type NewSecCompanyTicker = typeof secCompanyTickers.$inferInsert;
export type SecFiling = typeof secFilings.$inferSelect;
export type NewSecFiling = typeof secFilings.$inferInsert;
export type SecFilingDocument = typeof secFilingDocuments.$inferSelect;
export type NewSecFilingDocument = typeof secFilingDocuments.$inferInsert;
export type VultrDocumentCollection = typeof vultrDocumentCollections.$inferSelect;
export type NewVultrDocumentCollection = typeof vultrDocumentCollections.$inferInsert;
