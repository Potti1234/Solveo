import type { InboxMessage, InvestigationPlan, PlanStep } from "../types";
import { llmClient } from "../services/llm";
import { acRe } from "../tools/common";

export async function planInvestigation(message: InboxMessage): Promise<InvestigationPlan> {
  return llmClient.chatJson(
    [
      {
        role: "system",
        content:
          "You are a hotel complaint investigator. Return strict JSON with a steps array. Each step has id, tool, reason, and input. Allowed tools: bookings.lookup, maintenance.search, policy.search, guest_history.lookup, vision.verify, compensation.evaluate."
      },
      { role: "user", content: JSON.stringify(message) }
    ],
    () => fallbackPlan(message),
    isInvestigationPlan
  );
}

function fallbackPlan(message: InboxMessage): InvestigationPlan {
  const text = `${message.subject} ${message.body}`.toLowerCase();
  const policyQuery = acRe.test(text)
    ? "overnight AC broken full refund compensation essential comfort failure 4.2"
    : "photo evidence cleanliness mold same-day cleaning serial refund escalation";

  const steps: PlanStep[] = [
    { id: "plan-1", tool: "bookings.lookup", reason: "Confirm the active booking and stay value.", input: {} },
    { id: "plan-2", tool: "maintenance.search", reason: "Retrieve room, issue, and location logs.", input: {} },
    {
      id: "plan-3",
      tool: "policy.search",
      reason: "Find compensation and evidence policy clauses.",
      input: { query: policyQuery, top_k: 4 }
    },
    {
      id: "plan-4",
      tool: "guest_history.lookup",
      reason: "Check prior refund context without using it as sole evidence.",
      input: {}
    }
  ];
  if (message.attachments.length > 0) {
    steps.push({ id: "plan-5", tool: "vision.verify", reason: "Verify attached photo evidence.", input: {} });
  }
  steps.push({
    id: "plan-6",
    tool: "compensation.evaluate",
    reason: "Calculate policy-bound compensation if eligible.",
    input: {}
  });
  return { steps: steps.slice(0, 8) };
}

function isInvestigationPlan(value: unknown): value is InvestigationPlan {
  if (!value || typeof value !== "object" || !Array.isArray((value as InvestigationPlan).steps)) return false;
  const allowed = new Set([
    "bookings.lookup",
    "maintenance.search",
    "policy.search",
    "guest_history.lookup",
    "vision.verify",
    "compensation.evaluate"
  ]);
  return (value as InvestigationPlan).steps.every(
    (step) =>
      step &&
      typeof step.id === "string" &&
      allowed.has(step.tool) &&
      typeof step.reason === "string" &&
      typeof step.input === "object" &&
      step.input !== null
  );
}
