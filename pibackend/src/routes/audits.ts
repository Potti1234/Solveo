import { Elysia } from "elysia";
import { AgentEngine } from "../agents/agentEngine";
import { renderAuditMarkdown } from "../services/auditReport";
import type { AuditRequest } from "../types";

export const auditRoutes = new Elysia({ prefix: "/api/audits" }).post("/run", async ({ body, set }) => {
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
