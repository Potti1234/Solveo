import { Elysia, t } from "elysia";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { inboxMessages } from "../db/schema";
import { decodeInbox } from "../db/records";

export const inboxRoutes = new Elysia({ prefix: "/api/inbox" })
  .post(
    "",
    ({ body, set }) => {
      if (!body.body.trim()) {
        set.status = 422;
        return { detail: "Message body must not be empty" };
      }
      const messageId = `msg_text_${Date.now()}`;
      db.insert(inboxMessages)
        .values({
          id: messageId,
          receivedAt: sql`datetime('now')`,
          channel: body.channel ?? "chat",
          sender: body.sender ?? "test@guest.local",
          guestName: body.guest_name ?? "Test Guest",
          room: body.room ?? null,
          subject: body.subject ?? "Typed test complaint",
          body: body.body,
          attachmentsJson: "[]",
          status: "new"
        })
        .run();
      const row = db.select().from(inboxMessages).where(eq(inboxMessages.id, messageId)).get();
      return decodeInbox(row!);
    },
    {
      body: t.Object({
        body: t.String(),
        subject: t.Optional(t.String()),
        guest_name: t.Optional(t.String()),
        sender: t.Optional(t.String()),
        room: t.Optional(t.Union([t.String(), t.Null()])),
        channel: t.Optional(t.String())
      })
    }
  )
  .get("", () =>
    db
      .select()
      .from(inboxMessages)
      .all()
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map(decodeInbox)
  )
  .get("/:messageId", ({ params, set }) => {
    const row = db.select().from(inboxMessages).where(eq(inboxMessages.id, params.messageId)).get();
    if (!row) {
      set.status = 404;
      return { detail: "Inbox message not found" };
    }
    return decodeInbox(row);
  });
