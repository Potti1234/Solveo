import { db } from "../db/client";
import { generatedTickets } from "../db/schema";
import { readCsv } from "../lib/csv";
import type { Citation, ToolPayload, ToolResult } from "../types";
import { citationForCsv, inferIssueType, inferRoom } from "./common";

export function search(payload: ToolPayload): ToolResult {
  const room = inferRoom(payload.message);
  const text = `${payload.message.subject} ${payload.message.body}`;
  const issueType = typeof payload.issue_type === "string" ? payload.issue_type : inferIssueType(text);
  const floor = room ? `floor_${room[0]}` : null;

  const scored = readCsv("maintenance_log.csv")
    .map(([lineNo, row]) => {
      let score = 0;
      if (room && row.room === room) score += 6;
      if (floor && row.location === floor) score += 3;
      if (row.issue_type === issueType && (!room || row.room === room || row.location === floor)) score += 4;
      if (issueType === "housekeeping" && row.room === room && ["housekeeping", "plumbing"].includes(row.issue_type)) {
        score += 5;
      }
      return { score, lineNo, row };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.row.created_at.localeCompare(a.row.created_at))
    .slice(0, 8);

  return {
    tool: "maintenance.search",
    data: { issue_type: issueType, room, records: scored.map((item) => item.row) },
    citations: scored.map((item) => citationForCsv("maintenance_log.csv", item.lineNo, item.row))
  };
}

export function createTicket(
  caseId: number,
  room: string | null,
  issueType: string,
  summary: string,
  severity = "medium"
): Citation {
  const location = room && /^\d/.test(room) ? `floor_${room[0]}` : "property";
  const result = db
    .insert(generatedTickets)
    .values({ caseId, room, location, issueType, summary, severity })
    .returning({ id: generatedTickets.id })
    .get();
  return {
    source: "generated_tickets",
    locator: `row ${result.id}`,
    quote: summary
  };
}
