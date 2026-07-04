import { Elysia } from "elysia";
import { llmClient } from "../services/llm";

export const agentRoutes = new Elysia({ prefix: "/api/agent" }).get("/runtime", () => ({
  backend: "pibackend",
  agent: "pi-agent-core",
  database: "drizzle-sqlite",
  model_provider: "vultr",
  live_model: llmClient.live,
  mode: llmClient.live ? "vultr-live" : "deterministic-fallback"
}));
