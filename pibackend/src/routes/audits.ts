import { Elysia } from "elysia";
import { AgentEngine } from "../agents/agentEngine";
import { resolveAuditIntent } from "../services/auditIntent";
import { renderAuditMarkdown } from "../services/auditReport";
import type { AuditRequest, AuditThought } from "../types";

export const auditRoutes = new Elysia({ prefix: "/api/audits" }).post("/intent", async ({ body, set }) => {
  const payload = (body ?? {}) as { prompt?: string; creditAgreementUrl?: string };
  const prompt = String(payload.prompt ?? "").trim();
  if (!prompt) {
    set.status = 400;
    return { detail: "prompt is required." };
  }

  const intent = await resolveAuditIntent(prompt, payload.creditAgreementUrl);
  if (!intent) {
    set.status = 400;
    return { detail: "Could not identify a public company ticker from the instruction." };
  }

  return intent;
}).post("/run", async ({ body, set }) => {
  const request = normalizeAuditRequest(body);
  if (!request) {
    set.status = 400;
    return { detail: "ticker is required." };
  }

  const engine = new AgentEngine();
  return engine.run(request);
}).post("/report", async ({ body, set }) => {
  const request = normalizeAuditRequest(body);
  if (!request) {
    set.status = 400;
    return { detail: "ticker is required." };
  }

  const engine = new AgentEngine();
  const result = await engine.run(request);
  return {
    audit: result,
    markdown: renderAuditMarkdown(result)
  };
}).post("/report/stream", ({ body, set }) => {
  const request = normalizeAuditRequest(body);
  if (!request) {
    set.status = 400;
    return { detail: "ticker is required." };
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const startedAt = new Date().toISOString();
      send("start", {
        phase: "start",
        message: `Starting credit workflow for ${request.ticker.toUpperCase()}.`,
        payload: { ticker: request.ticker, creditAgreementUrl: request.creditAgreementUrl ?? null },
        createdAt: startedAt
      });

      heartbeat = setInterval(() => {
        send("heartbeat", {
          phase: "working",
          message: "The agent is still working through a long document or external retrieval step.",
          createdAt: new Date().toISOString()
        });
      }, 8_000);

      const engine = new AgentEngine((thought: AuditThought) => {
        send("thought", {
          ...thought,
          createdAt: new Date().toISOString()
        });
      });

      engine
        .run(request)
        .then((result) => {
          send("result", {
            audit: result,
            markdown: renderAuditMarkdown(result),
            createdAt: new Date().toISOString()
          });
        })
        .catch((error) => {
          send("error", {
            phase: "error",
            message: error instanceof Error ? error.message : "The audit workflow failed.",
            createdAt: new Date().toISOString()
          });
        })
        .finally(() => {
          if (heartbeat) clearInterval(heartbeat);
          send("done", { createdAt: new Date().toISOString() });
          controller.close();
        });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
});

function normalizeAuditRequest(body: unknown): AuditRequest | null {
  const payload = (body ?? {}) as Partial<AuditRequest>;
  const ticker = String(payload.ticker ?? "").trim();
  if (!ticker) return null;

  return {
    ticker,
    creditAgreementUrl: payload.creditAgreementUrl,
    rulebook: payload.rulebook
  };
}
