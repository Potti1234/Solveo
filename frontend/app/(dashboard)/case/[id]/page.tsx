"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Loader2, Play, RefreshCcw, ShieldAlert, UserRound, Volume2 } from "lucide-react";
import { API_URL, apiFetch, assetUrl, type CaseEvent, type CaseRecord, type InboxMessage } from "@/lib/api";
import { CaseTrace } from "@/components/CaseTrace";
import { DecisionCard } from "@/components/DecisionCard";
import { ChannelIcon } from "@/components/ChannelIcon";
import { AgentRuntimeBadge } from "@/components/AgentRuntimeBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
    return <CaseSkeleton />;
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="secondary" size="icon" aria-label="Back to inbox">
            <Link href="/inbox">
              <ArrowLeft size={16} />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={caseRecord?.status === "complete" ? "teal" : caseRecord?.status === "failed" ? "coral" : "amber"}>
                {caseRecord?.status ?? "starting"}
              </Badge>
              {caseRecord?.escalate ? <Badge variant="violet">Manager review</Badge> : <Badge variant="default">AI handling</Badge>}
              <AgentRuntimeBadge compact />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{message?.subject ?? "Case detail"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {message ? `${message.guest_name}${message.room ? ` / Room ${message.room}` : ""} / ${message.sender}` : "Loading case context"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {voiceEnabled && caseRecord?.response_draft ? (
            <Button variant="secondary" onClick={speak} disabled={speaking}>
              {speaking ? <Loader2 className="animate-spin" size={16} /> : <Volume2 size={16} />}
              Read draft
            </Button>
          ) : null}
          <Button variant="secondary" onClick={rerun}>
            <RefreshCcw size={16} />
            Rerun investigation
          </Button>
          <Button variant="violet">
            <UserRound size={16} />
            Take over chat
          </Button>
        </div>
      </header>

      {message ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-5">
            <Card className="overflow-hidden">
              <div className="border-b border-border bg-muted/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-card text-foreground">
                      <ChannelIcon channel={message.channel} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold leading-tight text-foreground">Guest conversation</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{formatChannel(message.channel)} intake from {message.guest_name}</p>
                    </div>
                  </div>
                  {!caseId ? (
                    <Button onClick={startRun}>
                      <Play size={16} />
                      Start investigation
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="p-4">
                <p className="max-w-4xl text-sm leading-6 text-foreground">{message.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="default">{message.sender}</Badge>
                  {message.room ? <Badge variant="default">Room {message.room}</Badge> : null}
                  <Badge variant="default">{formatChannel(message.channel)}</Badge>
                </div>
              </div>
            </Card>

            {caseRecord ? <DecisionCard record={caseRecord} /> : null}

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Agent activity timeline</h2>
                  <p className="text-sm text-muted-foreground">Pi agent plans, tool results, evidence, decisions, and actions in audit order.</p>
                </div>
                {caseRecord?.status === "running" || !caseRecord ? (
                  <Badge variant="teal">
                    <Loader2 className="animate-spin" size={13} />
                    Live
                  </Badge>
                ) : null}
              </div>
              <CaseTrace events={events} />
            </section>
          </div>

          <aside className="grid content-start gap-4">
            <AgentRuntimeBadge />

            <Card>
              <CardHeader>
                <CardTitle>Manager controls</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button variant="violet" className="justify-start">
                  <UserRound size={16} />
                  Take over chat
                </Button>
                <Button variant="secondary" className="justify-start">
                  <ShieldAlert size={16} />
                  Escalate case
                </Button>
                <Button variant="secondary" className="justify-start" onClick={rerun}>
                  <RefreshCcw size={16} />
                  Rerun investigation
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evidence</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {message.attachments.length ? (
                  message.attachments.map((attachment) => (
                    <figure key={attachment.filename} className="overflow-hidden rounded-lg border border-border bg-muted">
                      <img className="h-48 w-full object-cover" src={assetUrl(attachment.path)} alt={`Evidence attachment ${attachment.filename}`} />
                      <figcaption className="border-t border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">{attachment.filename}</figcaption>
                    </figure>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">No attachments were included with this message.</p>
                )}
              </CardContent>
            </Card>

            {caseRecord?.actions?.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>Follow-up work</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2">
                    {caseRecord.actions.map((action) => (
                      <li key={action} className="rounded-md bg-muted px-3 py-2 text-sm leading-5 text-foreground">
                        {action}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </section>
      ) : null}
    </div>
  );
}

function CaseSkeleton() {
  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Card className="p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-3 h-4 w-5/6" />
      </Card>
    </div>
  );
}

function formatChannel(channel: string) {
  return channel.replace("_", " ");
}
