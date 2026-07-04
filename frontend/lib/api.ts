export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export type Attachment = {
  filename: string;
  path: string;
  kind: string;
};

export type InboxMessage = {
  id: string;
  received_at: string;
  channel: string;
  sender: string;
  guest_name: string;
  room: string | null;
  subject: string;
  body: string;
  status: string;
  attachments: Attachment[];
};

export type Citation = {
  source: string;
  locator: string;
  quote: string;
};

export type CaseRecord = {
  id: number;
  message_id: string;
  status: string;
  verdict: string | null;
  confidence: number | null;
  reasoning: string | null;
  compensation: null | { amount: number; policy_clause: string; rationale: string };
  response_draft: string | null;
  escalate: boolean;
  severity: number;
  citations: Citation[];
  actions: string[];
};

export type CaseEvent = {
  id: number;
  case_id: number;
  created_at: string;
  event_type: string;
  title: string;
  payload: Record<string, any>;
};

export type AgentRuntime = {
  backend: string;
  agent: string;
  database: string;
  model_provider: string;
  live_model: boolean;
  mode: string;
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export function assetUrl(path: string): string {
  const filename = path.split("/").pop();
  return `${API_URL}/assets/images/${filename}`;
}

export async function getAgentRuntime(): Promise<AgentRuntime> {
  try {
    return await apiFetch<AgentRuntime>("/api/agent/runtime");
  } catch {
    return {
      backend: API_URL.includes("8001") ? "pibackend" : "fastapi",
      agent: API_URL.includes("8001") ? "pi-agent-core" : "python-runner",
      database: API_URL.includes("8001") ? "drizzle-sqlite" : "sqlite",
      model_provider: "vultr",
      live_model: false,
      mode: "runtime-check-unavailable"
    };
  }
}
