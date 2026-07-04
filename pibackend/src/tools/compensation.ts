import type { Citation, ToolPayload, ToolResult } from "../types";

export function evaluate(payload: ToolPayload): ToolResult {
  const booking = latestBooking(payload.evidence);
  const maintenanceRecords = recordsForTool(payload.evidence, "maintenance.search");
  const policyCitations = policyCitationsFor(payload.evidence);
  const hasOvernightHvac = maintenanceRecords.some(
    (record) =>
      record.issue_type === "hvac" &&
      ["high", "critical"].includes(String(record.severity)) &&
      (String(record.summary ?? "").toLowerCase().includes("overnight") || record.status === "open")
  );

  if (booking && hasOvernightHvac) {
    const amount = Math.round(Number(booking.total_amount ?? 0) * 30) / 100;
    const clause = policyCitations.find((citation) => citation.locator.includes("4.2"));
    return {
      tool: "compensation.evaluate",
      data: {
        eligible: true,
        amount,
        policy_clause: "\u00a74.2",
        rationale: "Corroborated overnight HVAC failure qualifies for 30% of affected stay value."
      },
      citations: clause ? [clause] : []
    };
  }

  return {
    tool: "compensation.evaluate",
    data: {
      eligible: false,
      amount: 0,
      policy_clause: null,
      rationale: "No automatic compensation threshold met."
    },
    citations: []
  };
}

function latestBooking(evidence: ToolResult[]): Record<string, unknown> {
  return (evidence.find((result) => result.tool === "bookings.lookup")?.data.booking as Record<string, unknown>) ?? {};
}

function recordsForTool(evidence: ToolResult[], tool: string): Array<Record<string, unknown>> {
  return (evidence.find((result) => result.tool === tool)?.data.records as Array<Record<string, unknown>>) ?? [];
}

function policyCitationsFor(evidence: ToolResult[]): Citation[] {
  return evidence.filter((result) => result.tool === "policy.search").flatMap((result) => result.citations);
}
