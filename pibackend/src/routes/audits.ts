import { Elysia } from "elysia";
import { AgentEngine } from "../agents/agentEngine";
import { GeneralSecAgent } from "../agents/generalSecAgent";
import { resolveAuditIntent, type AuditIntentContext } from "../services/auditIntent";
import { renderAuditMarkdown } from "../services/auditReport";
import type { AuditRequest, AuditThought } from "../types";

export const auditRoutes = new Elysia({ prefix: "/api/audits" }).post("/intent", async ({ body, set }) => {
  const payload = (body ?? {}) as { prompt?: string; creditAgreementUrl?: string; context?: AuditIntentContext };
  const prompt = String(payload.prompt ?? "").trim();
  if (!prompt) {
    set.status = 400;
    return { detail: "prompt is required." };
  }

  const intent = await resolveAuditIntent(prompt, payload.creditAgreementUrl, payload.context);
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

  const engine = createEngine(request);
  return engine.run(request);
}).post("/report", async ({ body, set }) => {
  const request = normalizeAuditRequest(body);
  if (!request) {
    set.status = 400;
    return { detail: "ticker is required." };
  }

  const engine = createEngine(request);
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
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
        }
      };

      const startedAt = new Date().toISOString();
      send("start", {
        phase: "start",
        message:
          request.workflow === "sec_research"
            ? `Starting SEC filing research for ${request.ticker.toUpperCase()}.`
            : `Starting credit workflow for ${request.ticker.toUpperCase()}.`,
        payload: {
          ticker: request.ticker,
          workflow: request.workflow ?? "credit_review",
          creditAgreementUrl: request.creditAgreementUrl ?? null,
          prompt: request.prompt ?? null
        },
        createdAt: startedAt
      });

      heartbeat = setInterval(() => {
        send("heartbeat", {
          phase: "working",
          message: "The agent is still working through a long document or external retrieval step.",
          createdAt: new Date().toISOString()
        });
      }, 8_000);

      const engine = createEngine(request, (thought: AuditThought) => {
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
          if (!closed) {
            send("done", { createdAt: new Date().toISOString() });
            try {
              controller.close();
            } catch {
              closed = true;
            }
          }
        });
    },
    cancel() {
      closed = true;
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
    prompt: typeof payload.prompt === "string" ? payload.prompt : undefined,
    workflow: payload.workflow === "sec_research" ? "sec_research" : "credit_review",
    rulebook: payload.rulebook
  };
}

function createEngine(request: AuditRequest, onThought?: (thought: AuditThought) => void) {
  return request.workflow === "sec_research" ? new GeneralSecAgent(onThought) : new AgentEngine(onThought);
}
