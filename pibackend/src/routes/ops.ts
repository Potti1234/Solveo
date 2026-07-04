import { Elysia } from "elysia";
import { db } from "../db/client";
import { opsAlerts, opsBoard } from "../db/schema";
import { parseJson } from "../lib/json";
import type { Citation } from "../types";
import { detectPatterns } from "../agent/actions";

export const opsRoutes = new Elysia({ prefix: "/api/ops" }).get("", () => {
  detectPatterns();
  const board = db
    .select()
    .from(opsBoard)
    .all()
    .sort((a, b) => b.severity - a.severity || b.createdAt.localeCompare(a.createdAt))
    .map((row) => ({
      id: row.id,
      case_id: row.caseId,
      severity: row.severity,
      verdict: row.verdict,
      summary: row.summary,
      citations_json: row.citationsJson,
      created_at: row.createdAt,
      citations: parseJson<Citation[]>(row.citationsJson, [])
    }));
  const alerts = db
    .select()
    .from(opsAlerts)
    .all()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.count - a.count)
    .map((row) => ({
      id: row.id,
      issue_type: row.issueType,
      location: row.location,
      count: row.count,
      severity: row.severity,
      summary: row.summary,
      citations_json: row.citationsJson,
      status: row.status,
      created_at: row.createdAt,
      citations: parseJson<Citation[]>(row.citationsJson, [])
    }));
  return { board, alerts };
});

function severityRank(severity: string): number {
  if (severity === "critical") return 3;
  if (severity === "high") return 2;
  return 1;
}
