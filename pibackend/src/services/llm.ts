import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../lib/paths";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

loadRootEnv();

export class VultrLlmClient {
  private readonly apiKey = process.env.VULTR_API_KEY ?? "";
  private readonly baseUrl = (process.env.VULTR_BASE_URL ?? "https://api.vultrinference.com/v1").replace(/\/$/, "");
  private readonly chatModel = process.env.VULTR_CHAT_MODEL ?? "llama-3.1-70b-instruct";
  private readonly timeoutMs = Number(process.env.VULTR_TIMEOUT_SECONDS ?? "30000");
  private readonly demoMode = ["1", "true", "yes"].includes((process.env.VULTR_DEMO_MODE ?? "").toLowerCase());

  get live(): boolean {
    return Boolean(this.apiKey) && !this.demoMode;
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
          model: this.chatModel,
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
}

export const llmClient = new VultrLlmClient();

function loadRootEnv() {
  const path = join(projectRoot, ".env");
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}
