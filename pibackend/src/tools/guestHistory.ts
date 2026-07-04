import { readCsv } from "../lib/csv";
import type { ToolPayload, ToolResult } from "../types";
import { citationForCsv } from "./common";

export function lookup(payload: ToolPayload): ToolResult {
  const sender = payload.message.sender.toLowerCase();
  const rows = readCsv("guest_history.csv").filter(([, row]) => row.email.toLowerCase() === sender);
  return {
    tool: "guest_history.lookup",
    data: { history: rows[0]?.[1] ?? {} },
    citations: rows.slice(0, 1).map(([lineNo, row]) => citationForCsv("guest_history.csv", lineNo, row, "notes"))
  };
}
