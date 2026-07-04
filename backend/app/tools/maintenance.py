from __future__ import annotations

import sqlite3
from typing import Any

from app.models import Citation, ToolResult
from app.tools.common import citation_for_csv, infer_issue_type, infer_room, read_csv


def search(payload: dict[str, Any]) -> ToolResult:
    message = payload["message"]
    room = infer_room(message)
    text = f"{message.get('subject', '')} {message.get('body', '')}"
    issue_type = payload.get("issue_type") or infer_issue_type(text)
    floor = f"floor_{room[0]}" if room else None
    scored: list[tuple[int, int, dict[str, str]]] = []
    for line_no, row in read_csv("maintenance_log.csv"):
        score = 0
        if room and row.get("room") == room:
            score += 6
        if floor and row.get("location") == floor:
            score += 3
        if row.get("issue_type") == issue_type and (not room or row.get("room") == room or row.get("location") == floor):
            score += 4
        if issue_type == "housekeeping" and row.get("room") == room and row.get("issue_type") in {"housekeeping", "plumbing"}:
            score += 5
        if score:
            scored.append((score, line_no, row))
    scored.sort(key=lambda item: (item[0], item[2].get("created_at", "")), reverse=True)
    rows = [(line_no, row) for _, line_no, row in scored[:8]]
    citations = [citation_for_csv("maintenance_log.csv", line_no, row) for line_no, row in rows]
    return ToolResult(
        tool="maintenance.search",
        data={"issue_type": issue_type, "room": room, "records": [row for _, row in rows]},
        citations=citations,
    )


def create_ticket(
    conn: sqlite3.Connection,
    case_id: int,
    room: str | None,
    issue_type: str,
    summary: str,
    severity: str = "medium",
) -> Citation:
    location = f"floor_{room[0]}" if room and room[0].isdigit() else "property"
    cursor = conn.execute(
        """
        INSERT INTO generated_tickets (case_id, room, location, issue_type, summary, severity)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (case_id, room, location, issue_type, summary, severity),
    )
    conn.commit()
    return Citation(
        source="generated_tickets",
        locator=f"row {cursor.lastrowid}",
        quote=summary,
    )
