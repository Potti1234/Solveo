import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { caseEvents, cases, inboxMessages } from "../db/schema";
import { fetchMessage } from "../db/records";
import { toJson } from "../lib/json";
import type { AgentEvent } from "../types";
import { performActions } from "./actions";
import { adjudicate } from "./adjudicator";
import { executePlan } from "./investigator";
import { planInvestigation } from "./planner";

export function createCaseForMessage(messageId: string): number {
  const result = db.insert(cases).values({ messageId, status: "running", severity: 1 }).returning({ id: cases.id }).get();
  db.update(inboxMessages).set({ status: "investigating" }).where(eq(inboxMessages.id, messageId)).run();
  return result.id;
}

export async function runCaseForMessage(messageId: string, caseId = createCaseForMessage(messageId)) {
  try {
    const message = fetchMessage(messageId);
    const emit = (event: AgentEvent) => emitEvent(caseId, event);

    emit({ event_type: "start", title: "Opened investigation", payload: { message } });
    const plan = await planInvestigation(message);
    emit({ event_type: "plan", title: "Investigation plan", payload: plan });
    const evidence = executePlan(message, plan, emit);
    const decision = await adjudicate(message, evidence);
    emit({ event_type: "decision", title: `Decision: ${decision.verdict}`, payload: decision as unknown as Record<string, unknown> });
    const actionResult = await performActions(caseId, message, decision, evidence, emit);
    emit({
      event_type: "action",
      title: "Drafted response",
      payload: actionResult as unknown as Record<string, unknown>
    });

    db.update(cases)
      .set({
        status: "complete",
        verdict: decision.verdict,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        compensationJson: toJson(decision.compensation),
        responseDraft: actionResult.response_draft,
        escalate: decision.escalate ? 1 : 0,
        severity: maxSeverity(actionResult.actions_taken),
        citationsJson: toJson(actionResult.citations),
        actionsJson: toJson(actionResult.actions_taken),
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(cases.id, caseId))
      .run();
    db.update(inboxMessages).set({ status: "complete" }).where(eq(inboxMessages.id, messageId)).run();
    return { case_id: caseId, decision, actions: actionResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitEvent(caseId, { event_type: "error", title: "Investigation failed", payload: { error: message } });
    db.update(cases)
      .set({ status: "failed", reasoning: message, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(cases.id, caseId))
      .run();
    throw error;
  }
}

function emitEvent(caseId: number, event: AgentEvent) {
  db.insert(caseEvents)
    .values({
      caseId,
      eventType: event.event_type,
      title: event.title,
      payloadJson: toJson(event.payload ?? {})
    })
    .run();
}

function maxSeverity(actions: string[]): number {
  if (actions.some((action) => action.includes("Escalated"))) return 5;
  if (actions.some((action) => action.includes("Approved"))) return 4;
  return 2;
}
