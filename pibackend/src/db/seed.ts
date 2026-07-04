import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "./client";
import { inboxMessages } from "./schema";
import { seedDir } from "../lib/paths";
import { toJson } from "../lib/json";
import type { Attachment } from "../types";

type SeedInboxPayload = {
  id: string;
  received_at: string;
  channel: string;
  sender: string;
  guest_name: string;
  room?: string;
  subject: string;
  body: string;
  attachments?: Attachment[];
};

export function seedIfNeeded() {
  const [{ count }] = db.select({ count: sql<number>`count(*)` }).from(inboxMessages).all();
  if (Number(count) > 0) return;

  for (const file of readdirSync(join(seedDir, "inbox")).filter((name) => name.endsWith(".json")).sort()) {
    const payload = JSON.parse(readFileSync(join(seedDir, "inbox", file), "utf8")) as SeedInboxPayload;
    db.insert(inboxMessages)
      .values({
        id: payload.id,
        receivedAt: payload.received_at,
        channel: payload.channel,
        sender: payload.sender,
        guestName: payload.guest_name,
        room: payload.room ?? null,
        subject: payload.subject,
        body: payload.body,
        attachmentsJson: toJson(payload.attachments ?? []),
        status: "new"
      })
      .run();
  }
}

export function resetInboxStatuses() {
  db.update(inboxMessages).set({ status: "new" }).where(eq(inboxMessages.status, "investigating")).run();
}
