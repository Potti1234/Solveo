"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Image as ImageIcon, Loader2, Upload, Voicemail } from "lucide-react";
import { API_URL, apiFetch, type InboxMessage } from "@/lib/api";
import { ChannelIcon } from "@/components/ChannelIcon";

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-normal text-ink">Unified Inbox</h1>
          <p className="mt-1 text-sm text-muted">{messages.length || "No"} guest messages queued across channels</p>
        </div>
        {voiceEnabled ? (
          <label className="icon-button cursor-pointer">
            {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
            Voicemail
            <input className="hidden" type="file" accept="audio/wav,audio/ogg,audio/opus" onChange={(event) => uploadVoicemail(event.target.files?.[0] ?? null)} />
          </label>
        ) : null}
      </div>

      {heroMessages.length ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {heroMessages.map((message) => (
            <InboxRow key={message.id} message={message} hero />
          ))}
        </section>
      ) : null}

      <section className="grid gap-3">
        {loading ? (
          <div className="rounded-lg border border-line bg-white p-5 text-sm text-muted">Loading inbox...</div>
        ) : (
          otherMessages.map((message) => <InboxRow key={message.id} message={message} />)
        )}
      </section>
    </div>
  );
}

function InboxRow({ message, hero = false }: { message: InboxMessage; hero?: boolean }) {
  return (
    <Link
      href={`/case/${message.id}`}
      className={`block rounded-lg border bg-white p-4 shadow-crisp transition hover:border-teal hover:bg-[#f0faf8] ${
        hero ? "border-teal" : "border-line"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-wash text-ink">
          <ChannelIcon channel={message.channel} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold tracking-normal text-ink">{message.subject}</h2>
            {hero ? (
              <span className="status-pill border-teal/30 bg-teal/5 text-teal">
                <AlertTriangle size={13} />
                Hero
              </span>
            ) : null}
            <span className="status-pill bg-white text-muted">{message.status}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted">{message.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted">
            <span>{message.guest_name}</span>
            {message.room ? <span>Room {message.room}</span> : null}
            <span>{message.channel.replace("_", " ")}</span>
            {message.attachments.length ? (
              <span className="inline-flex items-center gap-1">
                <ImageIcon size={14} />
                {message.attachments.length}
              </span>
            ) : null}
          </div>
        </div>
        {message.channel === "voicemail" ? <Voicemail className="mt-1 text-muted" size={18} /> : null}
      </div>
    </Link>
  );
}
