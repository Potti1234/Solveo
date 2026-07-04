from __future__ import annotations

import json
import sqlite3
import time
from typing import Any

from app.agent.actions import perform_actions
from app.agent.adjudicator import adjudicate
from app.agent.investigator import execute_plan
from app.agent.planner import plan_investigation
from app.db import connect, fetch_message
from app.models import AgentEvent, InboxMessage


def create_case_for_message(conn: sqlite3.Connection, message_id: str) -> int:
    cursor = conn.execute(
        "INSERT INTO cases (message_id, status, severity) VALUES (?, 'running', 1)",
        (message_id,),
    )
    conn.execute("UPDATE inbox_messages SET status = 'investigating' WHERE id = ?", (message_id,))
    conn.commit()
    return int(cursor.lastrowid)


def run_case_for_message(message_id: str, case_id: int | None = None, demo_delay: float = 0.0) -> dict[str, Any]:
    conn = connect()
    if case_id is None:
        case_id = create_case_for_message(conn, message_id)
    try:
        message = InboxMessage.model_validate(fetch_message(conn, message_id))

        def emit(event: AgentEvent) -> None:
            emit_event(conn, case_id, event)
            if demo_delay:
                time.sleep(demo_delay)

        emit(AgentEvent(event_type="start", title="Opened investigation", payload={"message": message.model_dump()}))
        plan = plan_investigation(message)
        emit(AgentEvent(event_type="plan", title="Investigation plan", payload=plan.model_dump()))
        evidence = execute_plan(conn, message, plan, emit)
        decision = adjudicate(message, evidence)
        emit(AgentEvent(event_type="decision", title=f"Decision: {decision.verdict}", payload=decision.model_dump()))
        action_result = perform_actions(conn, case_id, message, decision, evidence, emit)
        emit(AgentEvent(event_type="action", title="Drafted response", payload=action_result.model_dump()))

        conn.execute(
            """
            UPDATE cases
            SET status = 'complete',
                verdict = ?,
                confidence = ?,
                reasoning = ?,
                compensation_json = ?,
                response_draft = ?,
                escalate = ?,
                severity = ?,
                citations_json = ?,
                actions_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                decision.verdict,
                decision.confidence,
                decision.reasoning,
                json.dumps(decision.compensation.model_dump() if decision.compensation else None),
                action_result.response_draft,
                int(decision.escalate),
                _max_severity(action_result.actions_taken),
                json.dumps([citation.model_dump() for citation in action_result.citations]),
                json.dumps(action_result.actions_taken),
                case_id,
            ),
        )
        conn.execute("UPDATE inbox_messages SET status = 'complete' WHERE id = ?", (message_id,))
        conn.commit()
        return {"case_id": case_id, "decision": decision.model_dump(), "actions": action_result.model_dump()}
    except Exception as exc:
        emit_event(conn, case_id, AgentEvent(event_type="error", title="Investigation failed", payload={"error": str(exc)}))
        conn.execute("UPDATE cases SET status = 'failed', reasoning = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (str(exc), case_id))
        conn.commit()
        raise
    finally:
        conn.close()


def emit_event(conn: sqlite3.Connection, case_id: int, event: AgentEvent) -> None:
    conn.execute(
        "INSERT INTO case_events (case_id, event_type, title, payload_json) VALUES (?, ?, ?, ?)",
        (case_id, event.event_type, event.title, json.dumps(event.payload)),
    )
    conn.commit()


def _max_severity(actions: list[str]) -> int:
    if any("Escalated" in action for action in actions):
        return 5
    if any("Approved" in action for action in actions):
        return 4
    return 2
