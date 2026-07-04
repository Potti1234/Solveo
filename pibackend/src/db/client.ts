import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { dbFile } from "../lib/paths";
import * as schema from "./schema";

mkdirSync(dirname(dbFile), { recursive: true });

export const sqlite = new Database(dbFile);
sqlite.run("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function createSchema() {
  sqlite.exec(`
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
  `);
}
