import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { generatedTickets, opsAlerts, opsBoard } from "../db/schema";
import { readCsv } from "../lib/csv";
import { toJson } from "../lib/json";
import { llmClient } from "../services/llm";
import type { ActionResult, Adjudication, AgentEvent, Citation, InboxMessage, ToolResult } from "../types";
import { inferIssueType } from "../tools/common";
import { createTicket } from "../tools/maintenance";
import { citationForCsv } from "../tools/common";

type Emit = (event: AgentEvent) => void;

export async function performActions(
  caseId: number,
  message: InboxMessage,
  decision: Adjudication,
  evidence: ToolResult[],
  emit: Emit
): Promise<ActionResult> {
  const actionsTaken: string[] = [];
  const citations = dedupe([...decision.policy_basis, ...evidence.flatMap((result) => result.citations)]);
  const issueType = inferIssueType(`${message.subject} ${message.body}`);

  if (
    ["legitimate", "partially_legitimate"].includes(decision.verdict) &&
    ["hvac", "plumbing", "housekeeping", "electrical", "access"].includes(issueType)
  ) {
    const ticketCitation = createTicket(
      caseId,
      message.room,
      issueType,
      `Case ${caseId}: follow up on ${message.subject}`,
      issueType === "hvac" ? "high" : "medium"
    );
    citations.push(ticketCitation);
    actionsTaken.push("Created maintenance ticket");
    emit({ event_type: "action", title: "Created maintenance ticket", payload: ticketCitation });
  }

  if (decision.compensation) {
    actionsTaken.push(
      `Approved $${decision.compensation.amount.toFixed(2)} compensation under ${decision.compensation.policy_clause}`
    );
  }
  if (decision.escalate) actionsTaken.push("Escalated evidence bundle to guest relations manager");
  actionsTaken.push("Drafted guest response");

  const severity = severityFor(decision, issueType);
  db.insert(opsBoard)
    .values({
      caseId,
      severity,
      verdict: decision.verdict,
      summary: `${message.room ?? "Property"}: ${message.subject} -> ${decision.verdict}`,
      citationsJson: toJson(citations)
    })
    .onConflictDoUpdate({
      target: opsBoard.caseId,
      set: {
        severity,
        verdict: decision.verdict,
        summary: `${message.room ?? "Property"}: ${message.subject} -> ${decision.verdict}`,
        citationsJson: toJson(citations)
      }
    })
    .run();

  detectPatterns();
  return { response_draft: await draftResponse(message, decision), actions_taken: actionsTaken, citations };
}

export function severityFor(decision: Adjudication, issueType: string): number {
  if (decision.escalate) return 5;
  if (issueType === "hvac" && decision.verdict === "legitimate") return 4;
  if (decision.verdict === "partially_legitimate") return 3;
  return 2;
}

export function detectPatterns() {
  const windowEnd = new Date("2026-07-04T23:59:59Z");
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const groups = new Map<string, { issueType: string; location: string; citations: Citation[] }>();

  for (const [lineNo, row] of readCsv("maintenance_log.csv")) {
    const created = new Date(row.created_at);
    if (created < windowStart) continue;
    if (row.status !== "open" && created < windowStart) continue;
    addGroup(groups, row.issue_type, row.location, citationForCsv("maintenance_log.csv", lineNo, row));
  }

  for (const row of db.select().from(generatedTickets).all()) {
    const created = new Date(`${row.createdAt.replace(" ", "T")}Z`);
    if (created < windowStart) continue;
    addGroup(groups, row.issueType, row.location ?? "property", {
      source: "generated_tickets",
      locator: `row ${row.id}`,
      quote: row.summary
    });
  }

  for (const group of groups.values()) {
    if (group.citations.length < 3) continue;
    const severity = group.citations.length >= 5 || group.issueType === "hvac" ? "critical" : "high";
    db.insert(opsAlerts)
      .values({
        issueType: group.issueType,
        location: group.location,
        count: group.citations.length,
        severity,
        summary: `${group.citations.length} ${group.issueType} records in ${group.location} within 7 days`,
        citationsJson: toJson(group.citations.slice(0, 8)),
        status: "active"
      })
      .onConflictDoUpdate({
        target: [opsAlerts.issueType, opsAlerts.location],
        set: {
          count: group.citations.length,
          severity,
          summary: `${group.citations.length} ${group.issueType} records in ${group.location} within 7 days`,
          citationsJson: toJson(group.citations.slice(0, 8)),
          status: "active"
        }
      })
      .run();
  }
}

function addGroup(
  groups: Map<string, { issueType: string; location: string; citations: Citation[] }>,
  issueType: string,
  location: string,
  citation: Citation
) {
  const key = `${issueType}:${location}`;
  const group = groups.get(key) ?? { issueType, location, citations: [] };
  group.citations.push(citation);
  groups.set(key, group);
}

async function draftResponse(message: InboxMessage, decision: Adjudication): Promise<string> {
  const result = await llmClient.chatJson(
    [
      { role: "system", content: 'Draft a concise hotel guest-relations response. Return JSON: {"response":"..."}.' },
      { role: "user", content: `Guest message: ${JSON.stringify(message)}\nDecision: ${JSON.stringify(decision)}` }
    ],
    () => ({ response: fallbackResponse(message, decision) }),
    (value): value is { response: string } =>
      Boolean(value) && typeof value === "object" && typeof (value as { response?: unknown }).response === "string"
  );
  return result.response;
}

function fallbackResponse(message: InboxMessage, decision: Adjudication): string {
  const name = message.guest_name.split(" ")[0];
  if (decision.verdict === "legitimate" && decision.compensation) {
    return `Hi ${name}, thank you for flagging this. We reviewed your booking and maintenance records and confirmed the overnight AC failure in Room ${message.room}. We cannot approve a full refund under policy, but we have approved $${decision.compensation.amount.toFixed(2)} under ${decision.compensation.policy_clause} and opened a maintenance follow-up.`;
  }
  if (decision.verdict === "unsubstantiated") {
    return `Hi ${name}, thank you for sharing the concern. We reviewed the photo, housekeeping records, and room logs. The evidence does not substantiate mold or filth, so we are not able to approve compensation. A manager will still review the evidence bundle and follow up directly.`;
  }
  return `Hi ${name}, thank you for the note. We found partial support in our property records and have routed the item to the right team for follow-up.`;
}

function dedupe(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const unique: Citation[] = [];
  for (const citation of citations) {
    const key = `${citation.source}|${citation.locator}|${citation.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(citation);
  }
  return unique;
}
