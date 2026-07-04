from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.db import SEED_DIR, csv_rows_with_line_numbers
from app.models import Citation


ROOM_RE = re.compile(r"\b(?:room\s*)?([1-4][0-9]{2})\b", re.IGNORECASE)
AC_RE = re.compile(r"\b(ac|a/c|air conditioning|air-conditioner|thermostat|cooling|hot|warm)\b", re.IGNORECASE)


def infer_room(payload: dict[str, Any]) -> str | None:
    if payload.get("room"):
        return str(payload["room"])
    text = f"{payload.get('subject', '')} {payload.get('body', '')}"
    match = ROOM_RE.search(text)
    return match.group(1) if match else None


def infer_issue_type(text: str) -> str:
    lowered = text.lower()
    if AC_RE.search(text):
        return "hvac"
    if any(word in lowered for word in ["mold", "filth", "dirty", "clean", "stain", "caulk"]):
        return "housekeeping"
    if any(word in lowered for word in ["sink", "shower", "tub", "toilet", "drain", "water"]):
        return "plumbing"
    if any(word in lowered for word in ["wifi", "wi-fi", "internet"]):
        return "wifi"
    if any(word in lowered for word in ["key", "door", "lock"]):
        return "access"
    if "noise" in lowered or "loud" in lowered or "vibration" in lowered:
        return "noise"
    if any(word in lowered for word in ["lamp", "outlet", "usb", "power"]):
        return "electrical"
    return "guest_relations"


def read_csv(name: str) -> list[tuple[int, dict[str, str]]]:
    return csv_rows_with_line_numbers(SEED_DIR / name)


def citation_for_csv(name: str, line_no: int, row: dict[str, str], quote_key: str = "summary") -> Citation:
    row_id = row.get("ticket_id") or row.get("booking_id") or row.get("guest_id") or f"line {line_no}"
    quote = row.get(quote_key) or "; ".join(f"{key}={value}" for key, value in row.items() if value)
    return Citation(source=name, locator=f"line {line_no} row {row_id}", quote=quote)


def seed_path(relative: str) -> Path:
    return SEED_DIR.parent / relative
