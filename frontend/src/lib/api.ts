import type { AuditResponse, AuditStreamEvent } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? import.meta.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export async function runAudit(input: { ticker: string; creditAgreementUrl?: string }): Promise<AuditResponse> {
  const response = await fetch(`${API_URL}/api/audits/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Audit request failed with status ${response.status}`);
  }

  return (await response.json()) as AuditResponse;
}

export async function resolveAuditIntent(input: { prompt: string; creditAgreementUrl?: string }): Promise<{ ticker: string; creditAgreementUrl?: string; workflow: "credit_review" | "sec_research" }> {
  const response = await fetch(`${API_URL}/api/audits/intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Intent resolution failed with status ${response.status}`);
  }

  return (await response.json()) as { ticker: string; creditAgreementUrl?: string; workflow: "credit_review" | "sec_research" };
}

export async function runAuditStream(
  input: { ticker: string; creditAgreementUrl?: string; prompt?: string; workflow?: "credit_review" | "sec_research" },
  onEvent: (event: AuditStreamEvent) => void
): Promise<AuditResponse> {
  const response = await fetch(`${API_URL}/api/audits/report/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(detail || `Streaming audit request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AuditResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const messages = buffer.split("\n\n");
    buffer = messages.pop() ?? "";

    for (const raw of messages) {
      const parsed = parseSseMessage(raw);
      if (!parsed) continue;
      onEvent(parsed);
      if (parsed.type === "result") {
        finalResult = { audit: parsed.audit, markdown: parsed.markdown };
      }
      if (parsed.type === "error") {
        throw new Error(parsed.message);
      }
    }
  }

  if (!finalResult) throw new Error("The streaming audit finished without a result.");
  return finalResult;
}

function parseSseMessage(raw: string): AuditStreamEvent | null {
  const event = raw
    .split("\n")
    .find((line) => line.startsWith("event: "))
    ?.slice("event: ".length)
    .trim();
  const data = raw
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .join("\n");

  if (!event || !data) return null;
  const payload = JSON.parse(data) as Omit<AuditStreamEvent, "type">;
  return { type: event, ...payload } as AuditStreamEvent;
}
