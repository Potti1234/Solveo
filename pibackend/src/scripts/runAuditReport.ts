import { createSchema } from "../db/client";
import { AgentEngine } from "../agents/agentEngine";
import { renderAuditMarkdown } from "../services/auditReport";

createSchema();

const ticker = process.argv[2] ?? "MCK";
const result = await new AgentEngine().run({ ticker });

console.log(renderAuditMarkdown(result));
