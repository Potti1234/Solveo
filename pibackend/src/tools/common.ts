import type { Citation, InboxMessage } from "../types";
import type { CsvRow } from "../lib/csv";

export const roomRe = /\b(?:room\s*)?([1-4][0-9]{2})\b/i;
export const acRe = /\b(ac|a\/c|air conditioning|air-conditioner|thermostat|cooling|hot|warm)\b/i;

export function inferRoom(message: Partial<InboxMessage>): string | null {
  if (message.room) return String(message.room);
  const text = `${message.subject ?? ""} ${message.body ?? ""}`;
  return roomRe.exec(text)?.[1] ?? null;
}

export function inferIssueType(text: string): string {
  const lowered = text.toLowerCase();
  if (acRe.test(text)) return "hvac";
  if (["mold", "filth", "dirty", "clean", "stain", "caulk"].some((word) => lowered.includes(word))) {
    return "housekeeping";
  }
  if (["sink", "shower", "tub", "toilet", "drain", "water"].some((word) => lowered.includes(word))) {
    return "plumbing";
  }
  if (["wifi", "wi-fi", "internet"].some((word) => lowered.includes(word))) return "wifi";
  if (["key", "door", "lock"].some((word) => lowered.includes(word))) return "access";
  if (lowered.includes("noise") || lowered.includes("loud") || lowered.includes("vibration")) return "noise";
  if (["lamp", "outlet", "usb", "power"].some((word) => lowered.includes(word))) return "electrical";
  return "guest_relations";
}

export function citationForCsv(name: string, lineNo: number, row: CsvRow, quoteKey = "summary"): Citation {
  const rowId = row.ticket_id || row.booking_id || row.guest_id || `line ${lineNo}`;
  const quote =
    row[quoteKey] ||
    Object.entries(row)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  return { source: name, locator: `line ${lineNo} row ${rowId}`, quote };
}
