from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException

from app.db import connect


router = APIRouter(prefix="/api/inbox", tags=["inbox"])


@router.get("")
def list_inbox() -> list[dict[str, Any]]:
    conn = connect()
    try:
        rows = conn.execute("SELECT * FROM inbox_messages ORDER BY received_at DESC").fetchall()
        return [_decode(row) for row in rows]
    finally:
        conn.close()


@router.get("/{message_id}")
def get_message(message_id: str) -> dict[str, Any]:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM inbox_messages WHERE id = ?", (message_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Inbox message not found")
        return _decode(row)
    finally:
        conn.close()


def _decode(row) -> dict[str, Any]:
    data = dict(row)
    data["attachments"] = json.loads(data.pop("attachments_json") or "[]")
    return data
