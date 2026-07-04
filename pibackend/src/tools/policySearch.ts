import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { seedDir } from "../lib/paths";
import type { Citation, ToolPayload, ToolResult } from "../types";

type PolicyChunk = {
  source: string;
  locator: string;
  text: string;
};

let cachedChunks: PolicyChunk[] | null = null;

export function search(payload: ToolPayload): ToolResult {
  const query =
    typeof payload.query === "string" && payload.query.trim()
      ? payload.query
      : `${payload.message.subject} ${payload.message.body}`;
  const topK = typeof payload.top_k === "number" ? payload.top_k : 4;
  const hits = chunks()
    .map((chunk) => ({ chunk, score: score(query, chunk.text) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    tool: "policy.search",
    data: {
      query,
      snippets: hits.map((hit) => ({
        source: hit.chunk.source,
        locator: hit.chunk.locator,
        text: hit.chunk.text,
        score: hit.score
      }))
    },
    citations: hits.map((hit) => citation(hit.chunk))
  };
}

function chunks(): PolicyChunk[] {
  if (cachedChunks) return cachedChunks;
  const policyDir = join(seedDir, "policies");
  cachedChunks = readdirSync(policyDir)
    .filter((file) => file.endsWith(".md"))
    .flatMap((file) => splitPolicy(join(policyDir, file)));
  return cachedChunks;
}

function splitPolicy(path: string): PolicyChunk[] {
  const source = relative(join(seedDir, ".."), path).replaceAll("\\", "/");
  const text = readFileSync(path, "utf8");
  const parts = text.split(/\n(?=##\s+)/g);
  return parts
    .filter((part) => part.startsWith("## "))
    .map((part) => {
      const [heading = "", ...body] = part.trim().split(/\n/);
      const locator = heading.replace(/^##\s+/, "").trim();
      return { source, locator, text: `${locator}\n${body.join("\n").trim()}` };
    });
}

function score(query: string, text: string): number {
  const terms = new Set(query.toLowerCase().split(/[^a-z0-9.]+/).filter((term) => term.length > 2));
  const haystack = text.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (haystack.includes(term)) total += term.includes("4.2") || term.includes("6.1") ? 4 : 1;
  }
  return total;
}

function citation(chunk: PolicyChunk): Citation {
  const body = chunk.text.split(/\n/).slice(1).join(" ").trim();
  return { source: chunk.source, locator: chunk.locator, quote: body };
}
