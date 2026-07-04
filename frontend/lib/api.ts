export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
