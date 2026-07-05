import { createSchema } from "../db/client";
import { AgentEngine } from "../agents/agentEngine";
import { renderAuditMarkdown } from "../services/auditReport";

createSchema();

const ticker = process.argv[2] ?? "MCK";
const creditAgreementUrl = process.argv[3];
const result = await new AgentEngine().run({ ticker, creditAgreementUrl });

console.log(renderAuditMarkdown(result));
