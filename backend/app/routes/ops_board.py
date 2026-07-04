from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter

from app.agent.actions import detect_patterns
from app.db import connect


router = APIRouter(prefix="/api/ops", tags=["ops"])


@router.get("")
def get_ops_board() -> dict[str, list[dict[str, Any]]]:
    conn = connect()
    try:
        detect_patterns(conn)
        board_rows = conn.execute("SELECT * FROM ops_board ORDER BY severity DESC, created_at DESC").fetchall()
        alert_rows = conn.execute("SELECT * FROM ops_alerts ORDER BY CASE severity WHEN 'critical' THEN 3 WHEN 'high' THEN 2 ELSE 1 END DESC, count DESC").fetchall()
        return {
            "board": [
                {
                    **dict(row),
                    "citations": json.loads(row["citations_json"] or "[]"),
                }
                for row in board_rows
            ],
            "alerts": [
                {
                    **dict(row),
                    "citations": json.loads(row["citations_json"] or "[]"),
                }
                for row in alert_rows
            ],
        }
    finally:
        conn.close()
