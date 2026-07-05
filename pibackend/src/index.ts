import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createSchema } from "./db/client";
import { auditRoutes } from "./routes/audits";
import { secRoutes } from "./routes/sec";
import { toolRoutes } from "./routes/tools";
import { whatIfRoutes } from "./routes/whatIf";
import { llmClient } from "./services/vultr";

createSchema();

const port = Number(process.env.PORT ?? 8001);
const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = new Elysia()
  .use(
    cors({
      origin: corsOrigins,
      credentials: true
    })
  )
  .get("/api/health", () => ({ status: "ok" }))
  .get("/api/runtime", () => ({
    backend: "pibackend",
    product: "vultr-audit",
    model_provider: "vultr",
    live_model: llmClient.live,
    model: llmClient.model,
    timeout_seconds: llmClient.timeoutSeconds,
    max_output_tokens: llmClient.maxOutputTokens,
    mode: llmClient.live ? "vultr-live" : "deterministic-local"
  }))
  .use(auditRoutes)
  .use(secRoutes)
  .use(toolRoutes)
  .use(whatIfRoutes)
  .listen({ port, hostname: "0.0.0.0" });

console.log(`Vultr-Audit backend listening on http://localhost:${app.server?.port ?? port}`);
