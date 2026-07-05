import type { WebSearchResponse, WebSearchResult } from "../types";

export const webSearchToolDefinition = {
  name: "web_search",
  description:
    "Searches the live web for recent company news, financing events, 8-K context, or other external facts that may affect covenant risk.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The web search query." },
      maxResults: { type: "number", description: "Maximum number of results to return." }
    },
    required: ["query"]
  }
} as const;

type SearxngResult = {
  title?: string;
  url?: string;
  content?: string;
  publishedDate?: string;
  engine?: string;
};

type BraveResult = {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  profile?: { name?: string };
};

export async function webSearch(query: string, maxResults = 5): Promise<WebSearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("query is required.");
  }

  const provider = (process.env.WEB_SEARCH_PROVIDER ?? "searxng").toLowerCase();
  const boundedMax = Math.min(Math.max(maxResults, 1), 10);

  if (provider === "brave" && process.env.BRAVE_SEARCH_API_KEY) {
    return braveSearch(normalizedQuery, boundedMax);
  }

  if (process.env.SEARXNG_BASE_URL) {
    return searxngSearch(normalizedQuery, boundedMax);
  }

  return {
    provider: "disabled",
    query: normalizedQuery,
    results: [
      {
        title: "Web search is not configured",
        url: "https://docs.searxng.org/dev/search_api.html",
        snippet:
          "Set SEARXNG_BASE_URL to a SearXNG instance with JSON output enabled, or set WEB_SEARCH_PROVIDER=brave and BRAVE_SEARCH_API_KEY."
      }
    ]
  };
}

async function searxngSearch(query: string, maxResults: number): Promise<WebSearchResponse> {
  const baseUrl = process.env.SEARXNG_BASE_URL;
  if (!baseUrl) throw new Error("SEARXNG_BASE_URL is required.");

  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`SearXNG search failed with status ${response.status}. Ensure JSON format is enabled.`);
  }

  const payload = (await response.json()) as { results?: SearxngResult[] };
  return {
    provider: "searxng",
    query,
    results: (payload.results ?? []).slice(0, maxResults).map((result): WebSearchResult => ({
      title: result.title ?? result.url ?? "Untitled result",
      url: result.url ?? "",
      snippet: result.content ?? "",
      publishedAt: result.publishedDate ?? null,
      source: result.engine ?? "searxng"
    }))
  };
}

async function braveSearch(query: string, maxResults: number): Promise<WebSearchResponse> {
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY ?? ""
    }
  });

  if (!response.ok) {
    throw new Error(`Brave search failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { web?: { results?: BraveResult[] } };
  return {
    provider: "brave",
    query,
    results: (payload.web?.results ?? []).slice(0, maxResults).map((result): WebSearchResult => ({
      title: result.title ?? result.url ?? "Untitled result",
      url: result.url ?? "",
      snippet: result.description ?? "",
      publishedAt: result.age ?? null,
      source: result.profile?.name ?? "brave"
    }))
  };
}
