import { Elysia } from "elysia";
import { executeCode, executeCodeToolDefinition } from "../tools/executeCode";
import type { CodeExecutionRequest } from "../types";

export const toolRoutes = new Elysia({ prefix: "/api/tools" })
  .get("/definitions", () => ({ tools: [executeCodeToolDefinition] }))
  .post("/execute-code", async ({ body, set }) => {
    try {
      const payload = (body ?? {}) as Partial<CodeExecutionRequest>;
      return await executeCode({
        language: payload.language ?? "python",
        code: String(payload.code ?? "")
      });
    } catch (error) {
      set.status = 400;
      return { detail: error instanceof Error ? error.message : String(error) };
    }
  });
