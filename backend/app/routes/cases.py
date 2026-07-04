from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.agent.runner import create_case_for_message, run_case_for_message
from app.db import connect, fetch_message


router = APIRouter(prefix="/api/cases", tags=["cases"])


@router.post("/from-message/{message_id}/run")
def run_from_message(message_id: str, background_tasks: BackgroundTasks, sync: bool = Query(False)) -> dict[str, Any]:
    conn = connect()
    try:
        fetch_message(conn, message_id)
        case_id = create_case_for_message(conn, message_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Inbox message not found")
    finally:
        conn.close()

    if sync:
        return run_case_for_message(message_id, case_id=case_id)
    background_tasks.add_task(run_case_for_message, message_id, case_id, 0.2)
    return {"case_id": case_id, "status": "running"}


@router.get("/message/{message_id}")
def latest_case_for_message(message_id: str) -> dict[str, Any]:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM cases WHERE message_id = ? ORDER BY id DESC LIMIT 1",
            (message_id,),
        ).fetchone()
        return {"case": _decode_case(row) if row else None}
    finally:
        conn.close()


@router.get("/{case_id}")
def get_case(case_id: int) -> dict[str, Any]:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Case not found")
        return _decode_case(row)
    finally:
        conn.close()


@router.get("/{case_id}/events")
def get_events(case_id: int) -> list[dict[str, Any]]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM case_events WHERE case_id = ? ORDER BY id ASC",
            (case_id,),
        ).fetchall()
        return [
            {
                "id": row["id"],
                "case_id": row["case_id"],
                "created_at": row["created_at"],
                "event_type": row["event_type"],
                "title": row["title"],
                "payload": json.loads(row["payload_json"] or "{}"),
            }
            for row in rows
        ]
    finally:
        conn.close()


def _decode_case(row) -> dict[str, Any]:
    data = dict(row)
    data["compensation"] = json.loads(data.pop("compensation_json") or "null")
    data["citations"] = json.loads(data.pop("citations_json") or "[]")
    data["actions"] = json.loads(data.pop("actions_json") or "[]")
    data["escalate"] = bool(data["escalate"])
    return data
