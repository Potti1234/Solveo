"use client";

import Link from "next/link";
import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Clock3,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  ShieldAlert,
  Upload,
  Voicemail
} from "lucide-react";
import { API_URL, apiFetch, type InboxMessage } from "@/lib/api";
import { ChannelIcon } from "@/components/ChannelIcon";
import { AgentRuntimeBadge } from "@/components/AgentRuntimeBadge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const HERO_IDS = new Set(["msg_ac_302", "msg_mold_214"]);

export default function InboxPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setLoading(true);
    const [inbox, voice] = await Promise.all([
      apiFetch<InboxMessage[]>("/api/inbox"),
      apiFetch<{ enabled: boolean }>("/api/voice/config")
    ]);
    setMessages(inbox);
    setVoiceEnabled(voice.enabled);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  const heroMessages = useMemo(() => messages.filter((message) => HERO_IDS.has(message.id)), [messages]);
  const otherMessages = useMemo(() => messages.filter((message) => !HERO_IDS.has(message.id)), [messages]);
  const withAttachments = useMemo(() => messages.filter((message) => message.attachments.length > 0).length, [messages]);
  const channels = useMemo(() => new Set(messages.map((message) => message.channel)).size, [messages]);

  async function uploadVoicemail(file: File | null) {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${API_URL}/api/voice/stt`, { method: "POST", body: form });
    setUploading(false);
    if (!response.ok) return;
    await refresh();
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="teal">
              <Bot size={13} />
              Agents monitoring
            </Badge>
            <AgentRuntimeBadge compact />
            <Badge variant="default">Manager overview</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Command center</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Guest conversations, AI work, and manager review points in one operational queue.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary">
            <ShieldAlert size={16} />
            Review escalations
          </Button>
          {voiceEnabled ? (
            <label className={cn(buttonVariants({ variant: "default" }), "cursor-pointer")}>
              {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              Upload voicemail
              <input className="hidden" type="file" accept="audio/wav,audio/ogg,audio/opus" onChange={(event) => uploadVoicemail(event.target.files?.[0] ?? null)} />
            </label>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open conversations" value={messages.length || 0} detail="Across guest channels" icon={MessageSquareText} />
        <MetricCard label="Manager review" value={heroMessages.length || 0} detail="Pinned high-signal cases" icon={ShieldAlert} tone="violet" />
        <MetricCard label="Evidence attached" value={withAttachments} detail="Images or voicemail included" icon={ImageIcon} tone="amber" />
        <MetricCard label="Active channels" value={channels || 0} detail="Email, SMS, reviews, desk notes" icon={Bot} tone="teal" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Priority review</h2>
              <p className="text-sm text-muted-foreground">Cases where evidence, compensation, or guest impact needs manager attention.</p>
            </div>
            <Badge variant="violet">{heroMessages.length} waiting</Badge>
          </div>

          {loading ? (
            <LoadingRows count={2} />
          ) : heroMessages.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {heroMessages.map((message) => (
                <InboxRow key={message.id} message={message} priority />
              ))}
            </div>
          ) : (
            <EmptyPanel title="No priority conversations" body="When the AI finds high-risk cases, escalation patterns, or sensitive drafts, they will appear here." />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div>
              <h2 className="text-lg font-semibold text-foreground">All conversations</h2>
              <p className="text-sm text-muted-foreground">Compact work queue sorted by intake order.</p>
            </div>
            <Button variant="secondary" size="sm">Filter queue</Button>
          </div>

          <div className="grid gap-2">
            {loading ? <LoadingRows count={6} /> : otherMessages.map((message) => <InboxRow key={message.id} message={message} />)}
            {!loading && !messages.length ? <EmptyPanel title="No guest messages" body="New email, SMS, WhatsApp, review, front-desk, and voicemail items will land here." /> : null}
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent activity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <AgentRuntimeBadge />
              <ActivityLine label="Investigating claims" value="6 active" variant="teal" />
              <ActivityLine label="Drafts ready to review" value="3 drafts" variant="violet" />
              <ActivityLine label="Evidence checks pending" value="4 checks" variant="amber" />
              <ActivityLine label="Human takeover risk" value="2 chats" variant="coral" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manager quick links</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild variant="secondary" className="justify-between">
                <Link href="/ops">
                  Open operations board
                  <ArrowUpRight size={16} />
                </Link>
              </Button>
              <Button variant="secondary" className="justify-between">
                View AI drafts
                <ArrowUpRight size={16} />
              </Button>
              <Button variant="secondary" className="justify-between">
                Review policy gaps
                <ArrowUpRight size={16} />
              </Button>
            </CardContent>
          </Card>
        </aside>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default"
}: {
  label: string;
  value: number;
  detail: string;
  icon: ElementType;
  tone?: "default" | "teal" | "amber" | "violet";
}) {
  const iconTone = tone === "teal" ? "text-primary" : tone === "amber" ? "text-amber" : tone === "violet" ? "text-violet" : "text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">{detail}</div>
        </div>
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-md bg-muted", iconTone)}>
          <Icon size={17} />
        </span>
      </div>
    </Card>
  );
}

function InboxRow({ message, priority = false }: { message: InboxMessage; priority?: boolean }) {
  const statusVariant = priority ? "violet" : message.attachments.length ? "amber" : "default";
  return (
    <Link
      href={`/case/${message.id}`}
      className={cn(
        "group block rounded-lg border bg-card p-4 text-card-foreground shadow-crisp transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        priority ? "border-violet/35" : "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          <ChannelIcon channel={message.channel} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-5 text-foreground">{message.subject}</h3>
            <Badge variant={statusVariant}>{priority ? "Manager review" : message.status}</Badge>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{message.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold text-muted-foreground">
            <span>{message.guest_name}</span>
            {message.room ? <span>Room {message.room}</span> : null}
            <span>{formatChannel(message.channel)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 size={13} />
              {formatTime(message.received_at)}
            </span>
            {message.attachments.length ? (
              <span className="inline-flex items-center gap-1">
                <ImageIcon size={13} />
                {message.attachments.length} evidence
              </span>
            ) : null}
          </div>
        </div>
        {message.channel === "voicemail" ? <Voicemail className="mt-1 text-muted-foreground" size={18} /> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
        <Badge variant="teal">Open case</Badge>
        <Badge variant="default">Review AI work</Badge>
        {priority ? <Badge variant="violet">Can take over</Badge> : null}
      </div>
    </Link>
  );
}

function ActivityLine({ label, value, variant }: { label: string; value: string; variant: "teal" | "violet" | "amber" | "coral" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/70 px-3 py-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Badge variant={variant}>{value}</Badge>
    </div>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="p-4">
          <div className="flex gap-3">
            <Skeleton className="h-9 w-9" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
    </Card>
  );
}

function formatChannel(channel: string) {
  return channel.replace("_", " ");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recent";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
