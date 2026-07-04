import type { AgentEvent, InboxMessage, InvestigationPlan, PlanStep, ToolResult } from "../types";
import { toolRegistry } from "../tools";

type Emit = (event: AgentEvent) => void;

export function executePlan(message: InboxMessage, plan: InvestigationPlan, emit: Emit): ToolResult[] {
  const evidence: ToolResult[] = [];
  const steps = [...plan.steps];
  let executed = 0;

  while (steps.length > 0 && executed < 8) {
    const step = steps.shift() as PlanStep;
    const tool = toolRegistry[step.tool];
    const result = tool({ ...step.input, message, evidence });
    evidence.push(result);
    executed += 1;
    emit({
      event_type: "tool_result",
      title: `${step.tool}: ${step.reason}`,
      payload: result as unknown as Record<string, unknown>
    });
    if (step.tool === "maintenance.search" && looksLikeCluster(result) && steps.length + executed < 8) {
      steps.unshift({
        id: "dynamic-ops-policy",
        tool: "policy.search",
        reason: "Maintenance evidence suggests a recurring location pattern; retrieve operations alert policy.",
        input: { query: "repeated issue alert issue type location three tickets seven days 6.1", top_k: 2 }
      });
      emit({
        event_type: "plan_update",
        title: "Added operations-pattern policy lookup",
        payload: { reason: "At least three related maintenance records were found for the same area." }
      });
    }
  }

  return evidence;
}

function looksLikeCluster(result: ToolResult): boolean {
  const records = (result.data.records as Array<Record<string, unknown>>) ?? [];
  const issueType = result.data.issue_type;
  const byLocation = new Map<string, number>();
  for (const record of records) {
    if (record.issue_type !== issueType) continue;
    const location = String(record.location ?? record.room ?? "property");
    byLocation.set(location, (byLocation.get(location) ?? 0) + 1);
  }
  return [...byLocation.values()].some((count) => count >= 3);
}
