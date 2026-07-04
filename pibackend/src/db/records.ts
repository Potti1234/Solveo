import { eq, desc } from "drizzle-orm";
import { db } from "./client";
import { caseEvents, cases, inboxMessages } from "./schema";
import { parseJson } from "../lib/json";
import type { Attachment, Citation, InboxMessage } from "../types";

export function decodeInbox(row: typeof inboxMessages.$inferSelect): InboxMessage & { status: string } {
  return {
    id: row.id,
    received_at: row.receivedAt,
    channel: row.channel,
    sender: row.sender,
    guest_name: row.guestName,
    room: row.room,
    subject: row.subject,
    body: row.body,
    attachments: parseJson<Attachment[]>(row.attachmentsJson, []),
    status: row.status
  };
}

export function decodeCase(row: typeof cases.$inferSelect) {
  return {
    id: row.id,
    message_id: row.messageId,
    status: row.status,
    verdict: row.verdict,
    confidence: row.confidence,
    reasoning: row.reasoning,
    compensation: parseJson(row.compensationJson, null),
    response_draft: row.responseDraft,
    escalate: Boolean(row.escalate),
    severity: row.severity,
    citations: parseJson<Citation[]>(row.citationsJson, []),
    actions: parseJson<string[]>(row.actionsJson, []),
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

export function fetchMessage(messageId: string): InboxMessage & { status: string } {
  const row = db.select().from(inboxMessages).where(eq(inboxMessages.id, messageId)).get();
  if (!row) throw new Error(`Unknown inbox message: ${messageId}`);
  return decodeInbox(row);
}

export function latestCaseForMessage(messageId: string) {
  const row = db.select().from(cases).where(eq(cases.messageId, messageId)).orderBy(desc(cases.id)).limit(1).get();
  return row ? decodeCase(row) : null;
}

export function eventsForCase(caseId: number) {
  return db
    .select()
    .from(caseEvents)
    .where(eq(caseEvents.caseId, caseId))
    .all()
    .map((row) => ({
      id: row.id,
      case_id: row.caseId,
      created_at: row.createdAt,
      event_type: row.eventType,
      title: row.title,
      payload: parseJson<Record<string, unknown>>(row.payloadJson, {})
    }));
}
