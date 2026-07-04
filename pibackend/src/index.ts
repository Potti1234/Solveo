import { join } from "node:path";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createSchema } from "./db/client";
import { seedIfNeeded } from "./db/seed";
import { seedDir } from "./lib/paths";
import { detectPatterns } from "./agent/actions";
import { caseRoutes } from "./routes/cases";
import { inboxRoutes } from "./routes/inbox";
import { opsRoutes } from "./routes/ops";
import { voiceRoutes } from "./routes/voice";

createSchema();
seedIfNeeded();
detectPatterns();

const port = Number(process.env.PORT ?? 8001);

const app = new Elysia()
  .use(
    cors({
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      credentials: true
    })
  )
  .get("/assets/images/:filename", ({ params, set }) => {
    const filename = params.filename.split(/[\\/]/).pop() ?? "";
    const file = Bun.file(join(seedDir, "images", filename));
    if (!file.size) {
      set.status = 404;
      return { detail: "Asset not found" };
    }
    return file;
  })
  .get("/api/health", () => ({ status: "ok" }))
  .use(inboxRoutes)
  .use(caseRoutes)
  .use(opsRoutes)
  .use(voiceRoutes)
  .listen(port);

console.log(`Solveo Pi backend listening on http://localhost:${app.server?.port ?? port}`);
