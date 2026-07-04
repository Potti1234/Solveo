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

const app = new Elysia()
  .use(
    cors({
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      credentials: true
    })
  )
  .get("/api/health", () => ({ status: "ok" }))
  .get("/api/runtime", () => ({
    backend: "pibackend",
    product: "vultr-audit",
    model_provider: "vultr",
    live_model: llmClient.live,
    mode: llmClient.live ? "vultr-live" : "deterministic-placeholder"
  }))
  .use(auditRoutes)
  .use(secRoutes)
  .use(toolRoutes)
  .use(whatIfRoutes)
  .listen(port);

console.log(`Vultr-Audit backend listening on http://localhost:${app.server?.port ?? port}`);
