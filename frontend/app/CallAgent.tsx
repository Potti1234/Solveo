"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSearch, Loader2, Mic, MicOff, Phone, PhoneCall, PhoneOff, Sparkles } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const HERO_MESSAGE_ID = "msg_ac_302";
const GREETING =
  "Hi, you've reached the Aurora Bay Resort concierge. I'm the AI guest agent. Please tell me your room number and what went wrong, and I'll look into it right away.";

type CallState = "ringing" | "greeting" | "waiting" | "recording" | "transcribing" | "investigating" | "speaking" | "ended";

type FeedItem =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "activity"; text: string };

export function CallButton() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CallState>("ringing");
  const [seconds, setSeconds] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [micError, setMicError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const voiceEnabledRef = useRef(false);
  const activeRef = useRef(false);
  const playingRef = useRef<HTMLAudioElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const seenEventsRef = useRef<Set<number>>(new Set());

  const pushFeed = useCallback((item: FeedItem) => {
    setFeed((prev) => [...prev, item]);
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [feed]);

  useEffect(() => {
    if (!open || state === "ringing" || state === "ended") return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [open, state]);

  const speak = useCallback(async (text: string) => {
    if (!activeRef.current) return;
    if (voiceEnabledRef.current) {
      try {
        const response = await fetch(`${API_URL}/api/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });
        if (response.ok) {
          const blob = await response.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          playingRef.current = audio;
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
          });
          playingRef.current = null;
          return;
        }
      } catch {
        // fall through to browser speech
      }
    }
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const runAgent = useCallback(
    async (messageId: string) => {
      setState("investigating");
      const started = await fetch(`${API_URL}/api/cases/from-message/${messageId}/run`, { method: "POST" });
      if (!started.ok) throw new Error("run failed");
      const { case_id: caseId } = (await started.json()) as { case_id: number };
      seenEventsRef.current = new Set();

      // Poll the live agent trace so the caller sees documents being searched.
      for (let i = 0; i < 120 && activeRef.current; i++) {
        const [caseRes, eventsRes] = await Promise.all([
          fetch(`${API_URL}/api/cases/${caseId}`, { cache: "no-store" }),
          fetch(`${API_URL}/api/cases/${caseId}/events`, { cache: "no-store" })
        ]);
        if (eventsRes.ok) {
          const events = (await eventsRes.json()) as { id: number; event_type: string; title: string }[];
          for (const event of events) {
            if (seenEventsRef.current.has(event.id) || event.event_type === "start") continue;
            seenEventsRef.current.add(event.id);
            pushFeed({ kind: "activity", text: friendlyEvent(event.event_type, event.title) });
          }
        }
        if (caseRes.ok) {
          const record = (await caseRes.json()) as { status: string; response_draft: string | null };
          if (record.status === "complete") {
            const reply =
              record.response_draft ??
              "I've logged your complaint and a member of our team will follow up shortly.";
            pushFeed({ kind: "agent", text: reply });
            setState("speaking");
            await speak(reply);
            if (activeRef.current) setState("waiting");
            return;
          }
          if (record.status === "failed") break;
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      if (!activeRef.current) return;
      const apology = "I'm sorry, something went wrong while investigating. Let me connect you with the front desk.";
      pushFeed({ kind: "agent", text: apology });
      setState("speaking");
      await speak(apology);
      if (activeRef.current) setState("waiting");
    },
    [pushFeed, speak]
  );

  const startCall = useCallback(async () => {
    activeRef.current = true;
    setOpen(true);
    setState("ringing");
    setSeconds(0);
    setFeed([]);
    setMicError(null);

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    playRingback(ctx);

    fetch(`${API_URL}/api/voice/config`)
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((config: { enabled: boolean }) => {
        voiceEnabledRef.current = Boolean(config.enabled);
      })
      .catch(() => {
        voiceEnabledRef.current = false;
      });

    await new Promise((resolve) => setTimeout(resolve, 4200));
    if (!activeRef.current) return;

    setState("greeting");
    pushFeed({ kind: "agent", text: GREETING });
    await speak(GREETING);
    if (activeRef.current) setState("waiting");
  }, [pushFeed, speak]);

  const startRecording = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.start();
      setState("recording");
    } catch {
      setMicError("Microphone unavailable. You can play the sample complaint instead.");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setState("transcribing");
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    try {
      const webm = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const wav = await blobToWav(webm, audioCtxRef.current ?? new AudioContext());
      const form = new FormData();
      form.append("file", wav, "guest-call.wav");
      const response = await fetch(`${API_URL}/api/voice/stt`, { method: "POST", body: form });
      if (!response.ok) throw new Error(await response.text());
      const { message_id: messageId, transcript } = (await response.json()) as { message_id: string; transcript: string };
      if (!transcript.trim()) {
        pushFeed({ kind: "agent", text: "Sorry, I didn't catch that. Could you say it again?" });
        setState("speaking");
        await speak("Sorry, I didn't catch that. Could you say it again?");
        if (activeRef.current) setState("waiting");
        return;
      }
      pushFeed({ kind: "user", text: transcript });
      await runAgent(messageId);
    } catch {
      if (!activeRef.current) return;
      setMicError("Transcription is unavailable (Gradium key not set?). Try the sample complaint instead.");
      setState("waiting");
    }
  }, [pushFeed, runAgent, speak]);

  const useSample = useCallback(async () => {
    setMicError(null);
    pushFeed({
      kind: "user",
      text: "Hi, this is the guest in room 302. The air conditioning was broken all night and the room was unbearably hot. I'd like this fixed and compensated."
    });
    try {
      await runAgent(HERO_MESSAGE_ID);
    } catch {
      pushFeed({ kind: "agent", text: "I couldn't reach the resort systems. Please check that the backend is running." });
      setState("waiting");
    }
  }, [pushFeed, runAgent]);

  const hangUp = useCallback(() => {
    activeRef.current = false;
    window.speechSynthesis?.cancel();
    playingRef.current?.pause();
    playingRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setOpen(false);
  }, []);

  useEffect(() => () => hangUp(), [hangUp]);

  return (
    <>
      <button
        type="button"
        onClick={startCall}
        className="flex h-14 w-full items-center justify-center gap-3 rounded-[8px] bg-[#16a34a] px-5 text-base font-bold text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)] transition hover:bg-[#15803d] active:translate-y-px sm:h-16 sm:text-lg"
      >
        <PhoneCall size={21} />
        Call the AI concierge
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0c1210]/97 text-white backdrop-blur-sm">
          <div className="flex flex-1 flex-col items-center overflow-hidden px-5 pt-10 sm:pt-14">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[#16a34a]/20 sm:h-28 sm:w-28">
              {state === "ringing" ? (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-[#16a34a]/30" />
                  <Phone size={38} className="text-[#4ade80]" />
                </>
              ) : (
                <Sparkles size={38} className="text-[#4ade80]" />
              )}
            </div>
            <h2 className="mt-4 text-2xl font-bold">Aurora Bay AI Concierge</h2>
            <p className="mt-1 text-sm font-semibold text-white/60">
              {state === "ringing" ? "Ringing..." : `${statusLabel(state)} · ${formatTime(seconds)}`}
            </p>

            <div
              ref={feedRef}
              className="mt-6 w-full max-w-lg flex-1 space-y-2 overflow-y-auto pb-4 [scrollbar-width:thin]"
            >
              {feed.map((item, index) =>
                item.kind === "activity" ? (
                  <div key={index} className="flex items-center gap-2 px-2 text-xs font-semibold text-[#4ade80]/90">
                    <FileSearch size={13} className="shrink-0" />
                    <span className="truncate">{item.text}</span>
                  </div>
                ) : (
                  <div
                    key={index}
                    className={`max-w-[85%] rounded-[10px] px-4 py-3 text-sm leading-6 ${
                      item.kind === "user" ? "ml-auto bg-[#16a34a] text-white" : "bg-white/10 text-white/95"
                    }`}
                  >
                    {item.text}
                  </div>
                )
              )}
              {state === "investigating" ? (
                <div className="flex items-center gap-2 px-2 text-xs font-semibold text-white/60">
                  <Loader2 size={13} className="animate-spin" />
                  Agent is investigating your complaint...
                </div>
              ) : null}
            </div>

            {micError ? <p className="mb-2 max-w-lg text-center text-xs font-semibold text-[#fda4af]">{micError}</p> : null}
          </div>

          <div className="flex shrink-0 items-center justify-center gap-5 pb-10 pt-4">
            {state === "waiting" ? (
              <>
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-[#16a34a] shadow-lg transition hover:bg-[#15803d]"
                  title="Tap to speak"
                >
                  <Mic size={26} />
                </button>
                <button
                  type="button"
                  onClick={useSample}
                  className="rounded-full bg-white/10 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white/80 transition hover:bg-white/20"
                >
                  Sample complaint
                </button>
              </>
            ) : null}
            {state === "recording" ? (
              <button
                type="button"
                onClick={stopRecording}
                className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-[#e11d48] shadow-lg"
                title="Tap when done speaking"
              >
                <MicOff size={26} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={hangUp}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#dc2626] shadow-lg transition hover:bg-[#b91c1c]"
              title="Hang up"
            >
              <PhoneOff size={26} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function statusLabel(state: CallState): string {
  switch (state) {
    case "greeting":
    case "speaking":
      return "Agent speaking";
    case "recording":
      return "Listening";
    case "transcribing":
      return "Transcribing";
    case "investigating":
      return "Investigating";
    default:
      return "Connected";
  }
}

function friendlyEvent(eventType: string, title: string): string {
  if (eventType === "plan") return "Planned the investigation";
  if (eventType === "plan_update") return title;
  if (eventType === "decision") return title;
  if (eventType === "action") return "Drafted a response and logged actions";
  if (title.startsWith("policy.search")) return "Searching policy documents...";
  if (title.startsWith("bookings.lookup")) return "Looking up your booking...";
  if (title.startsWith("maintenance.search")) return "Checking maintenance records...";
  if (title.startsWith("guest_history.lookup")) return "Reviewing guest history...";
  if (title.startsWith("vision.verify")) return "Verifying photo evidence...";
  if (title.startsWith("compensation.evaluate")) return "Calculating compensation...";
  return title;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function playRingback(ctx: AudioContext) {
  ctx.resume().catch(() => undefined);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const oscA = ctx.createOscillator();
  oscA.frequency.value = 440;
  const oscB = ctx.createOscillator();
  oscB.frequency.value = 480;
  oscA.connect(gain);
  oscB.connect(gain);
  const now = ctx.currentTime;
  for (const start of [0, 2]) {
    gain.gain.setValueAtTime(0.07, now + start);
    gain.gain.setValueAtTime(0, now + start + 1.4);
  }
  oscA.start(now);
  oscB.start(now);
  oscA.stop(now + 4);
  oscB.stop(now + 4);
}

async function blobToWav(blob: Blob, ctx: AudioContext): Promise<Blob> {
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const length = decoded.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const data = decoded.getChannelData(channel);
    for (let i = 0; i < length; i++) mono[i] += data[i] / decoded.numberOfChannels;
  }
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, decoded.sampleRate, true);
  view.setUint32(28, decoded.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}
