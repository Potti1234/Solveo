import { CaseView } from "./CaseView";
import type { CaseEvent, CaseRecord, InboxMessage } from "@/lib/api";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

async function readApi<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default async function CasePage({ params }: { params: { id: string } }) {
  const [message, latest, voice] = await Promise.all([
    readApi<InboxMessage>(`/api/inbox/${params.id}`),
    readApi<{ case: CaseRecord | null }>(`/api/cases/message/${params.id}`),
    readApi<{ enabled: boolean }>("/api/voice/config")
  ]);
  const caseRecord = latest?.case ?? null;
  const events = caseRecord ? (await readApi<CaseEvent[]>(`/api/cases/${caseRecord.id}/events`)) ?? [] : [];

  return (
    <CaseView
      id={params.id}
      initialMessage={message}
      initialCase={caseRecord}
      initialEvents={events}
      initialVoiceEnabled={Boolean(voice?.enabled)}
      initialError={message ? null : "Could not load the agent case. Check that the backend is running and try again."}
    />
  );
}
