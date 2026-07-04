"use client";

// Temporary page for testing the agent pipeline with typed text (no voice).
// Safe to delete once voice calling is verified.

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Send } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

type EventRow = { id: number; event_type: string; title: string; payload: Record<string, any> };
type CaseRecord = {
  id: number;
  status: string;
  verdict: string | null;
  confidence: number | null;
  reasoning: string | null;
  response_draft: string | null;
  compensation: null | { amount: number; policy_clause: string; rationale: string };
  actions: string[];
};

const SAMPLE =
  "Hi, this is the guest in room 302. The air conditioning was broken all night and the room was unbearably hot. I'd like this fixed and compensated.";

export default function TestAgentPage() {
  const [text, setText] = useState(SAMPLE);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [messageId, setMessageId] = useState<string | null>(null);
  const runToken = useRef(0);

  async function run() {
    const token = ++runToken.current;
    setRunning(true);
    setError(null);
    setEvents([]);
    setRecord(null);
    setMessageId(null);
    try {
      const created = await fetch(`${API_URL}/api/inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text })
      });
      if (!created.ok) throw new Error(await created.text());
      const message = (await created.json()) as { id: string };
      setMessageId(message.id);

      const started = await fetch(`${API_URL}/api/cases/from-message/${message.id}/run`, { method: "POST" });
      if (!started.ok) throw new Error(await started.text());
      const { case_id: caseId } = (await started.json()) as { case_id: number };

      for (let i = 0; i < 150; i++) {
        if (runToken.current !== token) return;
        const [caseRes, eventsRes] = await Promise.all([
          fetch(`${API_URL}/api/cases/${caseId}`, { cache: "no-store" }),
          fetch(`${API_URL}/api/cases/${caseId}/events`, { cache: "no-store" })
        ]);
        if (eventsRes.ok) setEvents((await eventsRes.json()) as EventRow[]);
        if (caseRes.ok) {
          const current = (await caseRes.json()) as CaseRecord;
          setRecord(current);
          if (current.status === "complete" || current.status === "failed") break;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Request failed. Is the backend running on port 8000?");
    } finally {
      if (runToken.current === token) setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-[#182026]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent test console</h1>
          <p className="text-sm text-[#5c6a72]">Temporary page — runs the full agent pipeline from typed text, no voice.</p>
        </div>
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[#5c6a72] hover:text-[#182026]">
          <ArrowLeft size={16} />
          Home
        </Link>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        className="w-full rounded-lg border border-[#d7dee2] bg-white p-3 text-sm leading-6 outline-none focus:border-[#16a34a]"
        placeholder="Type a guest complaint..."
      />
      <button
        onClick={run}
        disabled={running || !text.trim()}
        className="mt-3 flex items-center gap-2 rounded-lg bg-[#16a34a] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#15803d] disabled:opacity-50"
      >
        {running ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {running ? "Agent running..." : "Run agent"}
      </button>

      {error ? (
        <div className="mt-4 whitespace-pre-wrap rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {messageId ? (
        <p className="mt-4 text-xs font-semibold text-[#5c6a72]">
          Message <code>{messageId}</code>
          {record ? (
            <>
              {" "}· case #{record.id} · status <span className="font-bold">{record.status}</span>
            </>
          ) : null}
        </p>
      ) : null}

      {events.length ? (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#5c6a72]">Agent trace</h2>
          <ol className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border border-[#d7dee2] bg-white p-3">
                <p className="text-xs font-bold uppercase text-[#16a34a]">{event.event_type}</p>
                <p className="mt-1 text-sm font-semibold">{event.title}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-[#5c6a72]">payload</summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-[#f4f7f8] p-2 text-xs">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {record?.status === "complete" ? (
        <section className="mt-4 rounded-lg border border-[#16a34a]/40 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#16a34a]">Decision</h2>
          <p className="mt-2 text-sm">
            <span className="font-bold">{record.verdict}</span>
            {record.confidence != null ? ` · confidence ${Math.round(record.confidence * 100)}%` : null}
          </p>
          {record.compensation ? (
            <p className="mt-1 text-sm">
              Compensation: ${record.compensation.amount} ({record.compensation.policy_clause})
            </p>
          ) : null}
          {record.reasoning ? <p className="mt-2 text-sm text-[#5c6a72]">{record.reasoning}</p> : null}
          {record.response_draft ? (
            <div className="mt-3 rounded-lg bg-[#f4f7f8] p-3 text-sm leading-6">{record.response_draft}</div>
          ) : null}
          {record.actions?.length ? (
            <ul className="mt-3 list-inside list-disc text-sm text-[#5c6a72]">
              {record.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {record?.status === "failed" ? (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Run failed: {record.reasoning ?? "unknown error"}
        </div>
      ) : null}
    </main>
  );
}
