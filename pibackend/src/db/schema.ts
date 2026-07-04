import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const inboxMessages = sqliteTable("inbox_messages", {
  id: text("id").primaryKey(),
  receivedAt: text("received_at").notNull(),
  channel: text("channel").notNull(),
  sender: text("sender").notNull(),
  guestName: text("guest_name").notNull(),
  room: text("room"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  attachmentsJson: text("attachments_json").notNull().default("[]"),
  status: text("status").notNull().default("new")
});

export const cases = sqliteTable("cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull(),
  status: text("status").notNull(),
  verdict: text("verdict"),
  confidence: real("confidence"),
  reasoning: text("reasoning"),
  compensationJson: text("compensation_json"),
  responseDraft: text("response_draft"),
  escalate: integer("escalate").notNull().default(0),
  severity: integer("severity").notNull().default(1),
  citationsJson: text("citations_json").notNull().default("[]"),
  actionsJson: text("actions_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const caseEvents = sqliteTable("case_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseId: integer("case_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  payloadJson: text("payload_json").notNull().default("{}")
});

export const generatedTickets = sqliteTable("generated_tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseId: integer("case_id").notNull(),
  room: text("room"),
  location: text("location"),
  issueType: text("issue_type").notNull(),
  status: text("status").notNull().default("open"),
  summary: text("summary").notNull(),
  severity: text("severity").notNull().default("medium"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const opsBoard = sqliteTable("ops_board", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseId: integer("case_id").notNull().unique(),
  severity: integer("severity").notNull(),
  verdict: text("verdict").notNull(),
  summary: text("summary").notNull(),
  citationsJson: text("citations_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const opsAlerts = sqliteTable(
  "ops_alerts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    issueType: text("issue_type").notNull(),
    location: text("location").notNull(),
    count: integer("count").notNull(),
    severity: text("severity").notNull(),
    summary: text("summary").notNull(),
    citationsJson: text("citations_json").notNull().default("[]"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [uniqueIndex("ops_alerts_issue_location_idx").on(table.issueType, table.location)]
);
