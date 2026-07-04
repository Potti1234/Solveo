import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { inboxMessages } from "../db/schema";
import { decodeInbox } from "../db/records";

export const inboxRoutes = new Elysia({ prefix: "/api/inbox" })
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
