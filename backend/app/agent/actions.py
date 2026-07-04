from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import BaseModel

from app.db import csv_rows_with_line_numbers, SEED_DIR
from app.models import ActionResult, Adjudication, AgentEvent, Citation, InboxMessage
from app.services.llm import llm_client
from app.tools.common import citation_for_csv, infer_issue_type
from app.tools.maintenance import create_ticket


class DraftResponse(BaseModel):
    response: str


def perform_actions(
    conn: sqlite3.Connection,
    case_id: int,
    message: InboxMessage,
    decision: Adjudication,
    evidence: list[dict[str, Any]],
    emit,
) -> ActionResult:
    actions_taken: list[str] = []
    citations: list[Citation] = _dedupe([*decision.policy_basis, *_evidence_citations(evidence)])
    issue_type = infer_issue_type(f"{message.subject} {message.body}")

    if decision.verdict in {"legitimate", "partially_legitimate"} and issue_type in {"hvac", "plumbing", "housekeeping", "electrical", "access"}:
        ticket_citation = create_ticket(
            conn,
            case_id,
            message.room,
            issue_type,
            f"Case {case_id}: follow up on {message.subject}",
            "high" if issue_type == "hvac" else "medium",
        )
        citations.append(ticket_citation)
        actions_taken.append("Created maintenance ticket")
        emit(AgentEvent(event_type="action", title="Created maintenance ticket", payload=ticket_citation.model_dump()))

    if decision.compensation:
        actions_taken.append(f"Approved ${decision.compensation.amount:.2f} compensation under {decision.compensation.policy_clause}")
    if decision.escalate:
        actions_taken.append("Escalated evidence bundle to guest relations manager")
    actions_taken.append("Drafted guest response")

    draft = _draft_response(message, decision)
    severity = severity_for(decision, issue_type)
    conn.execute(
        """
        INSERT INTO ops_board (case_id, severity, verdict, summary, citations_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(case_id) DO UPDATE SET
            severity = excluded.severity,
            verdict = excluded.verdict,
            summary = excluded.summary,
            citations_json = excluded.citations_json
        """,
        (
            case_id,
            severity,
            decision.verdict,
            f"{message.room or 'Property'}: {message.subject} -> {decision.verdict}",
            json.dumps([citation.model_dump() for citation in citations]),
        ),
    )
    conn.commit()
    detect_patterns(conn)
    return ActionResult(response_draft=draft, actions_taken=actions_taken, citations=citations)


def severity_for(decision: Adjudication, issue_type: str) -> int:
    if decision.escalate:
        return 5
    if issue_type == "hvac" and decision.verdict == "legitimate":
        return 4
    if decision.verdict == "partially_legitimate":
        return 3
    return 2


def _evidence_citations(evidence: list[dict[str, Any]]) -> list[Citation]:
    citations: list[Citation] = []
    for result in evidence:
        citations.extend(Citation.model_validate(citation) for citation in result.get("citations", []))
    return citations


def _dedupe(citations: list[Citation]) -> list[Citation]:
    seen: set[tuple[str, str, str]] = set()
    unique: list[Citation] = []
    for citation in citations:
        key = (citation.source, citation.locator, citation.quote)
        if key in seen:
            continue
        seen.add(key)
        unique.append(citation)
    return unique


def detect_patterns(conn: sqlite3.Connection) -> None:
    window_end = _parse_time("2026-07-04T23:59:59Z")
    window_start = window_end - timedelta(days=7)
    groups: dict[tuple[str, str], list[Citation]] = defaultdict(list)

    for line_no, row in csv_rows_with_line_numbers(SEED_DIR / "maintenance_log.csv"):
        created = _parse_time(row["created_at"])
        if created < window_start:
            continue
        if row["status"] != "open" and created < window_start:
            continue
        key = (row["issue_type"], row["location"])
        groups[key].append(citation_for_csv("maintenance_log.csv", line_no, row))

    for row in conn.execute("SELECT * FROM generated_tickets").fetchall():
        created = _parse_time(row["created_at"].replace(" ", "T") + "Z")
        if created < window_start:
            continue
        key = (row["issue_type"], row["location"])
        groups[key].append(Citation(source="generated_tickets", locator=f"row {row['id']}", quote=row["summary"]))

    for (issue_type, location), citations in groups.items():
        if len(citations) < 3:
            continue
        severity = "critical" if len(citations) >= 5 or issue_type == "hvac" else "high"
        conn.execute(
            """
            INSERT INTO ops_alerts (issue_type, location, count, severity, summary, citations_json, status)
            VALUES (?, ?, ?, ?, ?, ?, 'active')
            ON CONFLICT(issue_type, location) DO UPDATE SET
                count = excluded.count,
                severity = excluded.severity,
                summary = excluded.summary,
                citations_json = excluded.citations_json,
                status = 'active'
            """,
            (
                issue_type,
                location,
                len(citations),
                severity,
                f"{len(citations)} {issue_type} records in {location} within 7 days",
                json.dumps([citation.model_dump() for citation in citations[:8]]),
            ),
        )
    conn.commit()


def _draft_response(message: InboxMessage, decision: Adjudication) -> str:
    return llm_client.chat_json(
        [
            {
                "role": "system",
                "content": "Draft a concise hotel guest-relations response. Return JSON: {\"response\":\"...\"}.",
            },
            {
                "role": "user",
                "content": f"Guest message: {message.model_dump_json()}\nDecision: {decision.model_dump_json()}",
            },
        ],
        DraftResponse,
        fallback=lambda: {"response": _fallback_response(message, decision)},
    ).response


def _fallback_response(message: InboxMessage, decision: Adjudication) -> str:
    name = message.guest_name.split()[0]
    if decision.verdict == "legitimate" and decision.compensation:
        return (
            f"Hi {name}, thank you for flagging this. We reviewed your booking and maintenance records and confirmed "
            f"the overnight AC failure in Room {message.room}. We cannot approve a full refund under policy, but we "
            f"have approved ${decision.compensation.amount:.2f} under {decision.compensation.policy_clause} and opened "
            "a maintenance follow-up."
        )
    if decision.verdict == "unsubstantiated":
        return (
            f"Hi {name}, thank you for sharing the concern. We reviewed the photo, housekeeping records, and room logs. "
            "The evidence does not substantiate mold or filth, so we are not able to approve compensation. A manager "
            "will still review the evidence bundle and follow up directly."
        )
    return (
        f"Hi {name}, thank you for the note. We found partial support in our property records and have routed the item "
        "to the right team for follow-up."
    )


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
