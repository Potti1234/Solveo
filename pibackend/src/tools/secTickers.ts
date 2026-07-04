import type { SecCompany } from "../types";
import { resolveCompanyTicker, searchCompanyTickers } from "../services/sec";

export async function lookupSecCompany(input: string): Promise<SecCompany | null> {
  return resolveCompanyTicker(input);
}

export async function searchSecCompanies(query: string, limit?: number): Promise<SecCompany[]> {
  return searchCompanyTickers(query, limit);
}
