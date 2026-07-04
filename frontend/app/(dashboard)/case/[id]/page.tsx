"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Play, RefreshCcw, Volume2 } from "lucide-react";
import { API_URL, apiFetch, assetUrl, type CaseEvent, type CaseRecord, type InboxMessage } from "@/lib/api";
import { CaseTrace } from "@/components/CaseTrace";
import { DecisionCard } from "@/components/DecisionCard";
import { ChannelIcon } from "@/components/ChannelIcon";

export default function CasePage({ params }: { params: { id: string } }) {
  const [message, setMessage] = useState<InboxMessage | null>(null);
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [booting, setBooting] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const started = useRef(false);

  const loadCase = useCallback(async (id: number) => {
    const [record, eventRows] = await Promise.all([
      apiFetch<CaseRecord>(`/api/cases/${id}`),
      apiFetch<CaseEvent[]>(`/api/cases/${id}/events`)
    ]);
    setCaseRecord(record);
    setEvents(eventRows);
  }, []);

  const startRun = useCallback(async () => {
    started.current = true;
    const startedCase = await apiFetch<{ case_id: number; status: string }>(`/api/cases/from-message/${params.id}/run`, { method: "POST" });
    setCaseId(startedCase.case_id);
    await loadCase(startedCase.case_id);
  }, [loadCase, params.id]);

  useEffect(() => {
    let active = true;
    async function boot() {
      setBooting(true);
      const [msg, latest, voice] = await Promise.all([
        apiFetch<InboxMessage>(`/api/inbox/${params.id}`),
        apiFetch<{ case: CaseRecord | null }>(`/api/cases/message/${params.id}`),
        apiFetch<{ enabled: boolean }>("/api/voice/config")
      ]);
      if (!active) return;
      setMessage(msg);
      setVoiceEnabled(voice.enabled);
      if (latest.case) {
        setCaseId(latest.case.id);
        await loadCase(latest.case.id);
      } else if (!started.current) {
        await startRun();
      }
      if (active) setBooting(false);
    }
    boot().catch(() => setBooting(false));
    return () => {
      active = false;
    };
  }, [loadCase, params.id, startRun]);

  useEffect(() => {
    if (!caseId) return;
    if (caseRecord?.status === "complete" || caseRecord?.status === "failed") return;
    const timer = window.setInterval(() => {
      loadCase(caseId).catch(() => undefined);
    }, 900);
    return () => window.clearInterval(timer);
  }, [caseId, caseRecord?.status, loadCase]);

  async function rerun() {
    setEvents([]);
    setCaseRecord(null);
    started.current = false;
    await startRun();
  }

  async function speak() {
    if (!caseRecord?.response_draft) return;
    setSpeaking(true);
    const response = await fetch(`${API_URL}/api/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: caseRecord.response_draft })
    });
    setSpeaking(false);
    if (!response.ok) return;
    const blob = await response.blob();
    new Audio(URL.createObjectURL(blob)).play();
  }

  if (booting && !message) {
    return <div className="rounded-lg border border-line bg-white p-5 text-sm text-muted">Opening case...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <Link href="/inbox" className="icon-button">
          <ArrowLeft size={16} />
          Inbox
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {voiceEnabled && caseRecord?.response_draft ? (
            <button className="icon-button" onClick={speak} disabled={speaking}>
              {speaking ? <Loader2 className="animate-spin" size={16} /> : <Volume2 size={16} />}
              Read
            </button>
          ) : null}
          <button className="icon-button" onClick={rerun}>
            <RefreshCcw size={16} />
            Rerun
          </button>
        </div>
      </div>

      {message ? (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="rounded-lg border border-line bg-white p-5 shadow-crisp">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-wash text-ink">
                  <ChannelIcon channel={message.channel} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold tracking-normal text-ink">{message.subject}</h1>
                    <span className="status-pill bg-white text-muted">{caseRecord?.status ?? "starting"}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ink">{message.body}</p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-muted">
                    <span>{message.guest_name}</span>
                    {message.room ? <span>Room {message.room}</span> : null}
                    <span>{message.sender}</span>
                  </div>
                </div>
              </div>
              {!caseId ? (
                <button className="icon-button primary mt-4" onClick={startRun}>
                  <Play size={16} />
                  Run
                </button>
              ) : null}
            </div>

            {caseRecord ? <DecisionCard record={caseRecord} /> : null}

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-normal text-ink">Agent Trace</h2>
                {caseRecord?.status === "running" || !caseRecord ? (
                  <span className="status-pill border-teal/30 bg-teal/5 text-teal">
                    <Loader2 className="animate-spin" size={13} />
                    Live
                  </span>
                ) : null}
              </div>
              <CaseTrace events={events} />
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-line bg-white p-4 shadow-crisp">
              <h2 className="text-sm font-bold uppercase tracking-normal text-muted">Evidence</h2>
              <div className="mt-3 grid gap-3">
                {message.attachments.length ? (
                  message.attachments.map((attachment) => (
                    <figure key={attachment.filename} className="overflow-hidden rounded-lg border border-line bg-wash">
                      <img className="h-48 w-full object-cover" src={assetUrl(attachment.path)} alt={attachment.filename} />
                      <figcaption className="px-3 py-2 text-xs font-semibold text-muted">{attachment.filename}</figcaption>
                    </figure>
                  ))
                ) : (
                  <p className="text-sm text-muted">No attachments</p>
                )}
              </div>
            </section>
            {caseRecord?.actions?.length ? (
              <section className="rounded-lg border border-line bg-white p-4 shadow-crisp">
                <h2 className="text-sm font-bold uppercase tracking-normal text-muted">Actions</h2>
                <ul className="mt-3 grid gap-2">
                  {caseRecord.actions.map((action) => (
                    <li key={action} className="rounded-lg bg-wash px-3 py-2 text-sm text-ink">
                      {action}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </section>
      ) : null}
    </div>
  );
}
