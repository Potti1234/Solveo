import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { ToolName, ToolPayload, ToolResult } from "../types";
import * as bookings from "./bookings";
import * as compensation from "./compensation";
import * as guestHistory from "./guestHistory";
import * as maintenance from "./maintenance";
import * as policySearch from "./policySearch";
import * as vision from "./vision";

export const toolRegistry: Record<ToolName, (payload: ToolPayload) => ToolResult> = {
  "bookings.lookup": bookings.lookup,
  "maintenance.search": maintenance.search,
  "policy.search": policySearch.search,
  "guest_history.lookup": guestHistory.lookup,
  "vision.verify": vision.verify,
  "compensation.evaluate": compensation.evaluate
};

const loosePayloadSchema = Type.Object(
  {},
  {
    additionalProperties: true
  }
);

export const piTools: AgentTool<typeof loosePayloadSchema, ToolResult>[] = Object.entries(toolRegistry).map(
  ([name, fn]) => ({
    name,
    label: name,
    description: `Solveo domain tool: ${name}`,
    parameters: loosePayloadSchema,
    async execute(toolCallId, params) {
      const result = fn(params as ToolPayload);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: result,
        terminate: false
      };
    }
  })
);
