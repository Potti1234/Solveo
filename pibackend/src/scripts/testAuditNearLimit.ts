import { createSchema } from "../db/client";
import { AgentEngine } from "../agents/agentEngine";
import type { CovenantRulebook } from "../types";

createSchema();

const rulebook: CovenantRulebook = {
  borrower: "AAPL",
  agreementName: "Near-limit test rulebook",
  extractedAt: new Date().toISOString(),
  rules: [
    {
      id: "minimum-liquidity",
      name: "Minimum Liquidity",
      metric: "minimum_liquidity",
      operator: ">=",
      threshold: 100,
      unit: "usd",
      period: "quarterly",
      citations: [{ source: "test", locator: "test", excerpt: "Minimum liquidity must be at least 100." }]
    }
  ]
};

const result = await new AgentEngine().run({ ticker: "AAPL", rulebook });
console.log(
  JSON.stringify(
    {
      externalContext: result.externalContext,
      actionPlan: result.actionPlan,
      reflectiveChecks: result.reflectiveChecks.length
    },
    null,
    2
  )
);
