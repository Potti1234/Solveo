import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../lib/paths";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type VectorSearchResult = {
  content: string;
  description?: string | null;
  score?: number | null;
};

export type VectorCollection = {
  id: string;
  name: string;
};

loadRootEnv();

export class VultrInferenceClient {
  private readonly apiKey = process.env.VULTR_API_KEY ?? "";
  private readonly baseUrl = (process.env.VULTR_INFERENCE_URL ?? process.env.VULTR_BASE_URL ?? "https://api.vultrinference.com/v1").replace(
    /\/$/,
    ""
  );
  private readonly reasoningModel =
    process.env.VULTR_REASONING_MODEL ?? process.env.VULTR_CHAT_MODEL ?? "deepseek-ai/DeepSeek-V4-Flash";
  private readonly timeoutMs = Number(process.env.VULTR_TIMEOUT_SECONDS ?? "8000");
  private readonly localMode = ["1", "true", "yes"].includes((process.env.VULTR_LOCAL_MODE ?? "").toLowerCase());

  get live(): boolean {
    return Boolean(this.apiKey) && !this.localMode;
  }

  get model(): string {
    return this.reasoningModel;
  }

  async chatJson<T>(
    messages: ChatMessage[],
    fallback: () => T,
    validate: (value: unknown) => value is T
  ): Promise<T> {
    if (!this.live) return fallback();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.reasoningModel,
          messages,
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });
      if (!response.ok) return fallback();

      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return fallback();

      const parsed = JSON.parse(content) as unknown;
      return validate(parsed) ? parsed : fallback();
    } catch {
      return fallback();
    } finally {
      clearTimeout(timeout);
    }
  }

  async ragJson<T>(
    collection: string,
    messages: ChatMessage[],
    fallback: () => T,
    validate: (value: unknown) => value is T
  ): Promise<T> {
    if (!this.live) return fallback();

    const payload = await this.postJson(
      "/chat/completions/RAG",
      {
        collection,
        model: this.reasoningModel,
        messages,
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" }
      },
      () => ({ choices: [] }),
      isChatCompletionPayload
    );
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return fallback();
    try {
      const parsed = JSON.parse(content) as unknown;
      return validate(parsed) ? parsed : fallback();
    } catch {
      return fallback();
    }
  }

  async createCollection(name: string): Promise<string | null> {
    if (!this.live) return null;

    const existing = await this.findCollectionByName(name);
    if (existing) return existing.id;

    const payload = await this.postJson(
      "/vector_store",
      { name },
      () => null,
      (value): value is Record<string, unknown> | null => value === null || Boolean(value && typeof value === "object")
    );
    if (!payload) return null;
    return extractId(payload);
  }

  async listCollections(): Promise<VectorCollection[]> {
    if (!this.live) return [];

    const payload = await this.getJson(
      "/vector_store",
      () => ({ collections: [] }),
      (value): value is { collections?: Array<Record<string, unknown>> } => Boolean(value && typeof value === "object")
    );
    return (payload.collections ?? [])
      .map((collection) => ({
        id: stringValue(collection.id) ?? "",
        name: stringValue(collection.name) ?? ""
      }))
      .filter((collection) => collection.id && collection.name);
  }

  async findCollectionByName(name: string): Promise<VectorCollection | null> {
    return (await this.listCollections()).find((collection) => collection.name === name) ?? null;
  }

  async addCollectionItem(collectionId: string, content: string, description: string): Promise<boolean> {
    if (!this.live) return false;

    const payload = await this.postJson(
      `/vector_store/${encodeURIComponent(collectionId)}/items`,
      { content, description, auto_chunk: true },
      () => null,
      (value): value is Record<string, unknown> | null => value === null || Boolean(value && typeof value === "object")
    );
    return Boolean(payload);
  }

  async listCollectionItems(collectionId: string): Promise<VectorSearchResult[]> {
    if (!this.live) return [];

    const payload = await this.getJson(
      `/vector_store/${encodeURIComponent(collectionId)}/items`,
      () => ({ items: [] }),
      (value): value is Record<string, unknown> => Boolean(value && typeof value === "object")
    );
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.data) ? payload.data : [];
    return items.map(normalizeSearchResult).filter((result) => result.content.length > 0);
  }

  async searchCollection(collectionId: string, input: string): Promise<VectorSearchResult[]> {
    if (!this.live) return [];

    const payload = await this.postJson(
      `/vector_store/${encodeURIComponent(collectionId)}/search`,
      { input },
      () => ({ data: [] }),
      (value): value is Record<string, unknown> => Boolean(value && typeof value === "object")
    );
    const candidates = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.results)
        ? payload.results
        : Array.isArray(payload.items)
          ? payload.items
          : [];

    return candidates.map(normalizeSearchResult).filter((result) => result.content.length > 0);
  }

  private async postJson<T>(
    path: string,
    body: Record<string, unknown>,
    fallback: () => T,
    validate: (value: unknown) => value is T
  ): Promise<T> {
    if (!this.live) return fallback();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) return fallback();
      const parsed = (await response.json()) as unknown;
      return validate(parsed) ? parsed : fallback();
    } catch {
      return fallback();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getJson<T>(path: string, fallback: () => T, validate: (value: unknown) => value is T): Promise<T> {
    if (!this.live) return fallback();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });
      if (!response.ok) return fallback();
      const parsed = (await response.json()) as unknown;
      return validate(parsed) ? parsed : fallback();
    } catch {
      return fallback();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const llmClient = new VultrInferenceClient();

function loadRootEnv() {
  const envPath = join(projectRoot, ".env");
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const index = line.indexOf("=");
    if (index < 1) continue;

    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

function extractId(payload: Record<string, unknown>): string | null {
  const direct = payload.id ?? payload.uuid ?? payload.collection;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") {
    const nested = (direct as Record<string, unknown>).id ?? (direct as Record<string, unknown>).uuid;
    if (typeof nested === "string") return nested;
  }
  const data = payload.data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).id ?? (data as Record<string, unknown>).uuid;
    if (typeof nested === "string") return nested;
  }
  return null;
}

function isChatCompletionPayload(value: unknown): value is { choices?: Array<{ message?: { content?: string } }> } {
  return Boolean(value && typeof value === "object");
}

function normalizeSearchResult(value: unknown): VectorSearchResult {
  if (!value || typeof value !== "object") return { content: "" };
  const row = value as Record<string, unknown>;
  const content =
    stringValue(row.content) ??
    stringValue(row.text) ??
    stringValue(row.document) ??
    stringValue(row.chunk) ??
    stringValue((row.item as Record<string, unknown> | undefined)?.content) ??
    "";

  return {
    content,
    description: stringValue(row.description) ?? stringValue((row.item as Record<string, unknown> | undefined)?.description) ?? null,
    score: numberValue(row.score) ?? numberValue(row.distance) ?? null
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
