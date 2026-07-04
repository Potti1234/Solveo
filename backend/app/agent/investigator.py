from __future__ import annotations

import sqlite3
from collections.abc import Callable

from app.models import AgentEvent, InboxMessage, InvestigationPlan, PlanStep, ToolResult
from app.tools import bookings, compensation, guest_history, maintenance, policy_search, vision


ToolFn = Callable[[dict], ToolResult]
EventEmitter = Callable[[AgentEvent], None]


TOOL_REGISTRY: dict[str, ToolFn] = {
    "bookings.lookup": bookings.lookup,
    "maintenance.search": maintenance.search,
    "policy.search": policy_search.search,
    "guest_history.lookup": guest_history.lookup,
    "vision.verify": vision.verify,
    "compensation.evaluate": compensation.evaluate,
}


def execute_plan(
    conn: sqlite3.Connection,
    message: InboxMessage,
    plan: InvestigationPlan,
    emit: EventEmitter,
) -> list[dict]:
    evidence: list[dict] = []
    steps = list(plan.steps)
    executed = 0
    while steps and executed < 8:
        step = steps.pop(0)
        tool = TOOL_REGISTRY[step.tool]
        payload = {**step.input, "message": message.model_dump(), "evidence": evidence}
        result = tool(payload)
        evidence.append(result.model_dump())
        executed += 1
        emit(
            AgentEvent(
                event_type="tool_result",
                title=f"{step.tool}: {step.reason}",
                payload=result.model_dump(),
            )
        )
        if step.tool == "maintenance.search" and _looks_like_cluster(result) and len(steps) + executed < 8:
            steps.insert(
                0,
                PlanStep(
                    id="dynamic-ops-policy",
                    tool="policy.search",
                    reason="Maintenance evidence suggests a recurring location pattern; retrieve operations alert policy.",
                    input={"query": "repeated issue alert issue type location three tickets seven days §6.1", "top_k": 2},
                ),
            )
            emit(
                AgentEvent(
                    event_type="plan_update",
                    title="Added operations-pattern policy lookup",
                    payload={"reason": "At least three related maintenance records were found for the same area."},
                )
            )
    return evidence


def _looks_like_cluster(result: ToolResult) -> bool:
    records = result.data.get("records", [])
    issue = result.data.get("issue_type")
    by_location: dict[str, int] = {}
    for record in records:
        if record.get("issue_type") != issue:
            continue
        location = record.get("location") or record.get("room") or "property"
        by_location[location] = by_location.get(location, 0) + 1
    return any(count >= 3 for count in by_location.values())
