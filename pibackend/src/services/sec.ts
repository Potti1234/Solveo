export type SecFilingReference = {
  ticker: string;
  filingType: "10-Q" | "10-K";
  accessionNumber: string;
  filedAt: string;
  url: string;
};

export async function findLatestFiling(ticker: string, filingType: "10-Q" | "10-K"): Promise<SecFilingReference> {
  const normalizedTicker = ticker.trim().toUpperCase();

  // Reference point for the pivot: replace this deterministic URL with SEC EDGAR
  // submissions data or SEC-API.io once the ingestion path is implemented.
  return {
    ticker: normalizedTicker,
    filingType,
    accessionNumber: "placeholder",
    filedAt: new Date().toISOString(),
    url: `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(normalizedTicker)}&forms=${filingType}`
  };
}
