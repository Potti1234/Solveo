from __future__ import annotations

import json
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import connect


router = APIRouter(prefix="/api/inbox", tags=["inbox"])


class CreateMessageRequest(BaseModel):
    body: str
    subject: str = "Typed test complaint"
    guest_name: str = "Test Guest"
    sender: str = "test@guest.local"
    room: str | None = None
    channel: str = "chat"


@router.post("")
def create_message(payload: CreateMessageRequest) -> dict[str, Any]:
    if not payload.body.strip():
        raise HTTPException(status_code=422, detail="Message body must not be empty")
    message_id = f"msg_text_{int(time.time() * 1000)}"
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO inbox_messages
            (id, received_at, channel, sender, guest_name, room, subject, body, attachments_json, status)
            VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, '[]', 'new')
            """,
            (message_id, payload.channel, payload.sender, payload.guest_name, payload.room, payload.subject, payload.body),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM inbox_messages WHERE id = ?", (message_id,)).fetchone()
        return _decode(row)
    finally:
        conn.close()


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
