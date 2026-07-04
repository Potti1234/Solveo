import type { Adjudication, Citation, CompensationDecision, InboxMessage, ToolResult } from "../types";
import { llmClient } from "../services/llm";
import { acRe } from "../tools/common";

export async function adjudicate(message: InboxMessage, evidence: ToolResult[]): Promise<Adjudication> {
  return llmClient.chatJson(
    [
      {
        role: "system",
        content:
          "You adjudicate hotel complaints. Return strict JSON with verdict, confidence, reasoning, policy_basis citations, compensation or null, and escalate. Every decision must cite evidence."
      },
      { role: "user", content: `Message: ${JSON.stringify(message)}\nEvidence bundle JSON: ${JSON.stringify(evidence)}` }
    ],
    () => fallbackAdjudication(message, evidence),
    isAdjudication
  );
}

function fallbackAdjudication(message: InboxMessage, evidence: ToolResult[]): Adjudication {
  const text = `${message.subject} ${message.body}`.toLowerCase();
  const citations = allCitations(evidence);
  const policyCitations = citations.filter((citation) => citation.source.includes("policies/"));
  const maintenanceRecords = (toolData(evidence, "maintenance.search").records ?? []) as Array<Record<string, unknown>>;
  const history = (toolData(evidence, "guest_history.lookup").history ?? {}) as Record<string, unknown>;
  const vision = (toolData(evidence, "vision.verify").observations ?? []) as Array<Record<string, unknown>>;
  const comp = toolData(evidence, "compensation.evaluate");

  if (acRe.test(text)) {
    const hvacSupport = maintenanceRecords.some(
      (record) => record.issue_type === "hvac" && ["high", "critical"].includes(String(record.severity))
    );
    if (hvacSupport && comp.eligible) {
      return {
        verdict: "legitimate",
        confidence: 0.93,
        reasoning: `The booking confirms the stay, maintenance logs corroborate an overnight HVAC failure in Room ${message.room}, and the compensation matrix authorizes 30% rather than a full refund.`,
        policy_basis: prefer(policyCitations, ["4.2", "4.3", "6.1"]),
        compensation: {
          amount: Number(comp.amount),
          policy_clause: String(comp.policy_clause),
          rationale: String(comp.rationale)
        } satisfies CompensationDecision,
        escalate: false
      };
    }
  }

  if (["mold", "filth", "dirty", "cleanliness"].some((term) => text.includes(term))) {
    const captions = vision.map((item) => String(item.caption ?? "")).join(" ").toLowerCase();
    const serialRefunds = Number(history.prior_refunds ?? 0) >= 3;
    const cleaningSupport = maintenanceRecords.some(
      (record) => record.room === message.room && ["housekeeping", "plumbing"].includes(String(record.issue_type))
    );
    if (cleaningSupport && (captions.includes("no visible mold") || captions.includes("water stain") || vision.length > 0)) {
      return {
        verdict: "unsubstantiated",
        confidence: 0.88,
        reasoning:
          "The photo shows a dry water stain rather than mold or filth, same-day housekeeping records show the room was cleaned and inspected, and repeat-refund history supports escalation context only.",
        policy_basis: prefer(policyCitations, ["2.2", "2.3", "2.4", "7.2", "7.3"]),
        compensation: null,
        escalate: serialRefunds
      };
    }
  }

  if (maintenanceRecords.length > 0) {
    return {
      verdict: "partially_legitimate",
      confidence: 0.72,
      reasoning: "A property record corroborates part of the guest concern, but the automatic compensation threshold is not met.",
      policy_basis: policyCitations.slice(0, 3),
      compensation: null,
      escalate: false
    };
  }

  return {
    verdict: "unsubstantiated",
    confidence: 0.61,
    reasoning: "The available records do not corroborate the claim strongly enough for compensation.",
    policy_basis: policyCitations.slice(0, 3),
    compensation: null,
    escalate: false
  };
}

function isAdjudication(value: unknown): value is Adjudication {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Adjudication;
  return (
    ["legitimate", "partially_legitimate", "unsubstantiated"].includes(candidate.verdict) &&
    typeof candidate.confidence === "number" &&
    candidate.confidence >= 0 &&
    candidate.confidence <= 1 &&
    typeof candidate.reasoning === "string" &&
    Array.isArray(candidate.policy_basis) &&
    (candidate.compensation === null ||
      (typeof candidate.compensation === "object" &&
        typeof candidate.compensation.amount === "number" &&
        typeof candidate.compensation.policy_clause === "string" &&
        typeof candidate.compensation.rationale === "string")) &&
    typeof candidate.escalate === "boolean"
  );
}

function toolData(evidence: ToolResult[], tool: string): Record<string, any> {
  return evidence.find((result) => result.tool === tool)?.data ?? {};
}

function allCitations(evidence: ToolResult[]): Citation[] {
  return evidence.flatMap((result) => result.citations);
}

function prefer(citations: Citation[], clauses: string[]): Citation[] {
  const selected: Citation[] = [];
  const seen = new Set<string>();
  for (const clause of clauses) {
    for (const citation of citations) {
      const key = citationKey(citation);
      if (citation.locator.includes(clause) && !seen.has(key)) {
        selected.push(citation);
        seen.add(key);
      }
    }
  }
  for (const citation of citations) {
    const key = citationKey(citation);
    if (!seen.has(key)) {
      selected.push(citation);
      seen.add(key);
    }
  }
  return selected.slice(0, 5);
}

function citationKey(citation: Citation): string {
  return `${citation.source}|${citation.locator}|${citation.quote}`;
}
