import { readCsv } from "../lib/csv";
import type { ToolPayload, ToolResult } from "../types";
import { citationForCsv, inferRoom } from "./common";

export function lookup(payload: ToolPayload): ToolResult {
  const sender = payload.message.sender.toLowerCase();
  const room = inferRoom(payload.message);
  const matches = readCsv("bookings.csv").filter(
    ([, row]) => row.email.toLowerCase() === sender || Boolean(room && row.room === room)
  );
  matches.sort((a, b) => {
    const aSender = a[1].email.toLowerCase() !== sender ? 1 : 0;
    const bSender = b[1].email.toLowerCase() !== sender ? 1 : 0;
    const aStatus = a[1].status !== "checked_in" ? 1 : 0;
    const bStatus = b[1].status !== "checked_in" ? 1 : 0;
    return aSender - bSender || aStatus - bStatus;
  });
  return {
    tool: "bookings.lookup",
    data: { booking: matches[0]?.[1] ?? {}, room },
    citations: matches.slice(0, 2).map(([lineNo, row]) => citationForCsv("bookings.csv", lineNo, row, "guest_name"))
  };
}
