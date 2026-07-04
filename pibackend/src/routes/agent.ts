import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { cases, inboxMessages } from "../db/schema";
import { decodeCase, eventsForCase } from "../db/records";
import { toJson } from "../lib/json";
import { readCsv } from "../lib/csv";
import { createCaseForMessage, runCaseForMessage } from "../agent/runner";
import { llmClient } from "../services/llm";
import { acRe, inferIssueType, roomRe } from "../tools/common";

type GuestChatBody = {
  message?: string;
  guest_name?: string;
  room?: string;
};

export const agentRoutes = new Elysia({ prefix: "/api/agent" })
  .get("/runtime", () => ({
    backend: "pibackend",
    agent: "pi-agent-core",
    database: "drizzle-sqlite",
    model_provider: "vultr",
    live_model: llmClient.live,
    mode: llmClient.live ? "vultr-live" : "deterministic-fallback"
  }))
  .post("/guest-chat", async ({ body, set }) => {
    const payload = (body ?? {}) as GuestChatBody;
    const message = String(payload.message ?? "").trim();
    if (!message) {
      set.status = 400;
      return { detail: "Message is required." };
    }

    const room = normalizeRoom(payload.room) ?? inferRoomFromText(message);
    const booking = room ? bookingForRoom(room) : null;
    const guestName = String(payload.guest_name ?? booking?.guest_name ?? "Hotel Guest").trim();
    const issueType = inferIssueType(message);
    const subject = subjectFor(message, room, issueType);
    const messageId = `guest_chat_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    db.insert(inboxMessages)
      .values({
        id: messageId,
        receivedAt: new Date().toISOString(),
        channel: "web_chat",
        sender: booking?.email ?? "guest.chat@example.com",
        guestName,
        room,
        subject,
        body: message,
        attachmentsJson: toJson([]),
        status: "new"
      })
      .run();

    const caseId = createCaseForMessage(messageId);
    const result = await runCaseForMessage(messageId, caseId);
    const caseRecord = db.select().from(cases).where(eq(cases.id, caseId)).get();

    return {
      message_id: messageId,
      case_id: caseId,
      assistant_message: result.actions.response_draft,
      case: caseRecord ? decodeCase(caseRecord) : null,
      events: eventsForCase(caseId)
    };
  });

function normalizeRoom(room: string | undefined): string | null {
  if (!room) return null;
  return roomRe.exec(room)?.[1] ?? null;
}

function inferRoomFromText(text: string): string | null {
  return roomRe.exec(text)?.[1] ?? null;
}

function bookingForRoom(room: string) {
  const match = readCsv("bookings.csv").find(([, row]) => row.room === room && row.status === "checked_in");
  return match?.[1] ?? null;
}

function subjectFor(message: string, room: string | null, issueType: string): string {
  const roomLabel = room ? `Room ${room}` : "Guest room";
  if (acRe.test(message)) return `${roomLabel}: AC not working`;
  if (issueType === "plumbing") return `${roomLabel}: plumbing issue`;
  if (issueType === "housekeeping") return `${roomLabel}: room quality complaint`;
  if (issueType === "wifi") return `${roomLabel}: Wi-Fi issue`;
  return `${roomLabel}: guest complaint`;
}
