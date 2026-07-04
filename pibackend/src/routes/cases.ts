import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { cases } from "../db/schema";
import { decodeCase, eventsForCase, fetchMessage, latestCaseForMessage } from "../db/records";
import { createCaseForMessage, runCaseForMessage } from "../agent/runner";

export const caseRoutes = new Elysia({ prefix: "/api/cases" })
  .post("/from-message/:messageId/run", async ({ params, query, set }) => {
    try {
      fetchMessage(params.messageId);
    } catch {
      set.status = 404;
      return { detail: "Inbox message not found" };
    }

    const caseId = createCaseForMessage(params.messageId);
    if (query.sync === "true" || query.sync === "1") {
      return await runCaseForMessage(params.messageId, caseId);
    }
    setTimeout(() => {
      runCaseForMessage(params.messageId, caseId).catch((error) => console.error(error));
    }, 200);
    return { case_id: caseId, status: "running" };
  })
  .get("/message/:messageId", ({ params }) => ({ case: latestCaseForMessage(params.messageId) }))
  .get("/:caseId", ({ params, set }) => {
    const row = db.select().from(cases).where(eq(cases.id, Number(params.caseId))).get();
    if (!row) {
      set.status = 404;
      return { detail: "Case not found" };
    }
    return decodeCase(row);
  })
  .get("/:caseId/events", ({ params }) => eventsForCase(Number(params.caseId)));
