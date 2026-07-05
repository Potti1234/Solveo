import type { AuditResponse } from "./types";

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
