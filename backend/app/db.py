from __future__ import annotations

import csv
import json
import os
import sqlite3
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SEED_DIR = PROJECT_ROOT / "seed"


def db_path() -> Path:
    configured = os.getenv("DATABASE_PATH")
    if configured:
        return Path(configured)
    return PROJECT_ROOT / "backend" / "concierge_court.db"


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(reset: bool = False) -> sqlite3.Connection:
    path = db_path()
    if reset and path.exists():
        path.unlink()
    conn = connect()
    create_schema(conn)
    seed_if_needed(conn)
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS inbox_messages (
            id TEXT PRIMARY KEY,
            received_at TEXT NOT NULL,
            channel TEXT NOT NULL,
            sender TEXT NOT NULL,
            guest_name TEXT NOT NULL,
            room TEXT,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            attachments_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'new'
        );

        CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            status TEXT NOT NULL,
            verdict TEXT,
            confidence REAL,
            reasoning TEXT,
            compensation_json TEXT,
            response_draft TEXT,
            escalate INTEGER NOT NULL DEFAULT 0,
            severity INTEGER NOT NULL DEFAULT 1,
            citations_json TEXT NOT NULL DEFAULT '[]',
            actions_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(message_id) REFERENCES inbox_messages(id)
        );

        CREATE TABLE IF NOT EXISTS case_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            event_type TEXT NOT NULL,
            title TEXT NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS generated_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            room TEXT,
            location TEXT,
            issue_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            summary TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'medium',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ops_board (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL UNIQUE,
            severity INTEGER NOT NULL,
            verdict TEXT NOT NULL,
            summary TEXT NOT NULL,
            citations_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ops_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_type TEXT NOT NULL,
            location TEXT NOT NULL,
            count INTEGER NOT NULL,
            severity TEXT NOT NULL,
            summary TEXT NOT NULL,
            citations_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(issue_type, location)
        );
        """
    )
    conn.commit()


def seed_if_needed(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM inbox_messages").fetchone()[0]
    if count:
        return
    for path in sorted((SEED_DIR / "inbox").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        conn.execute(
            """
            INSERT INTO inbox_messages
            (id, received_at, channel, sender, guest_name, room, subject, body, attachments_json, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
            """,
            (
                payload["id"],
                payload["received_at"],
                payload["channel"],
                payload["sender"],
                payload["guest_name"],
                payload.get("room"),
                payload["subject"],
                payload["body"],
                json.dumps(payload.get("attachments", [])),
            ),
        )
    conn.commit()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def fetch_message(conn: sqlite3.Connection, message_id: str) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM inbox_messages WHERE id = ?", (message_id,)).fetchone()
    if row is None:
        raise KeyError(f"Unknown inbox message: {message_id}")
    data = dict(row)
    data["attachments"] = json.loads(data.pop("attachments_json") or "[]")
    return data


def csv_rows_with_line_numbers(path: Path) -> list[tuple[int, dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [(line_no, row) for line_no, row in enumerate(reader, start=2)]
