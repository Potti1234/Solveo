from __future__ import annotations

from typing import Any

from app.models import ToolResult
from app.tools.common import citation_for_csv, read_csv


def lookup(payload: dict[str, Any]) -> ToolResult:
    message = payload["message"]
    sender = message.get("sender", "").lower()
    rows = [(line_no, row) for line_no, row in read_csv("guest_history.csv") if row["email"].lower() == sender]
    history = rows[0][1] if rows else {}
    citations = [citation_for_csv("guest_history.csv", line_no, row, "notes") for line_no, row in rows[:1]]
    return ToolResult(tool="guest_history.lookup", data={"history": history}, citations=citations)
