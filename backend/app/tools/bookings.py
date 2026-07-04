from __future__ import annotations

from typing import Any

from app.models import ToolResult
from app.tools.common import citation_for_csv, infer_room, read_csv


def lookup(payload: dict[str, Any]) -> ToolResult:
    message = payload["message"]
    sender = message.get("sender", "").lower()
    room = infer_room(message)
    matches: list[tuple[int, dict[str, str]]] = []
    for line_no, row in read_csv("bookings.csv"):
        if row["email"].lower() == sender or (room and row["room"] == room):
            matches.append((line_no, row))
    matches.sort(key=lambda item: (item[1]["email"].lower() != sender, item[1]["status"] != "checked_in"))
    booking = matches[0][1] if matches else {}
    citations = [citation_for_csv("bookings.csv", line_no, row, "guest_name") for line_no, row in matches[:2]]
    return ToolResult(tool="bookings.lookup", data={"booking": booking, "room": room}, citations=citations)
