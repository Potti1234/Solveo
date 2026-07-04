"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, CheckCircle2, Hotel, Loader2, Send, ShieldCheck, UserRound } from "lucide-react";
import { sendGuestChat, type GuestChatResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ChatMessage = {
  role: "guest" | "assistant";
  content: string;
};

const exampleMessage = "I have a complaint about my room 202. The AC is not working and the room is too warm.";

export default function GuestChatPage() {
  const [input, setInput] = useState(exampleMessage);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi, I can help with room issues and send the details to the hotel team. Tell me your room number and what is wrong."
    }
  ]);
  const [result, setResult] = useState<GuestChatResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestStatus = useMemo(() => {
    if (!result?.case) return null;
    if (result.case.escalate) return "A manager will review this case.";
    if (result.case.actions.length) return result.case.actions[0];
    return "The hotel team has received the case.";
  }, [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages((current) => [...current, { role: "guest", content: text }]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await sendGuestChat(text);
      setResult(response);
      setMessages((current) => [...current, { role: "assistant", content: response.assistant_message }]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The chat could not submit the complaint.";
      setError(message);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "I could not send this to the hotel team. Please try again in a moment."
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <section className="flex min-h-[calc(100vh-48px)] flex-col rounded-lg border border-border bg-card shadow-crisp">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-white">
                <Hotel size={18} />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold">Concierge Court guest chat</h1>
                <p className="text-sm text-muted-foreground">Test complaint intake for hotel guests</p>
              </div>
            </div>
            <Badge variant={result ? "teal" : "default"}>
              {result ? <CheckCircle2 size={13} /> : <Bot size={13} />}
              {result ? "Case created" : "AI desk"}
            </Badge>
          </header>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto grid max-w-3xl gap-3">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={message.role === "guest" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      message.role === "guest"
                        ? "max-w-[82%] rounded-lg bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground"
                        : "max-w-[82%] rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground"
                    }
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold opacity-80">
                      {message.role === "guest" ? <UserRound size={13} /> : <Bot size={13} />}
                      {message.role === "guest" ? "You" : "Concierge Court"}
                    </div>
                    {message.content}
                  </div>
                </div>
              ))}
              {loading ? (
                <div className="flex justify-start">
                  <div className="max-w-[82%] rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Loader2 className="animate-spin" size={14} />
                      Checking booking, policy, and maintenance records...
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <form onSubmit={submit} className="border-t border-border p-4">
            <div className="mx-auto flex max-w-3xl gap-2">
              <label className="sr-only" htmlFor="guest-message">
                Message
              </label>
              <textarea
                id="guest-message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Tell us your room number and what happened."
                className="min-h-11 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                rows={2}
              />
              <Button type="submit" disabled={loading || !input.trim()} className="h-auto self-stretch">
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                Send
              </Button>
            </div>
            {error ? <p className="mx-auto mt-2 max-w-3xl text-sm text-destructive">{error}</p> : null}
          </form>
        </section>

        <aside className="grid content-start gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={16} />
              What this test does
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sending the message creates a real guest complaint, runs the Pi backend investigation, and adds the case to the manager dashboard.
            </p>
          </Card>

          {result ? (
            <Card className="p-4">
              <div className="text-sm font-semibold">Created case</div>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Case</span>
                  <span className="font-semibold">#{result.case_id}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Verdict</span>
                  <Badge variant={result.case?.verdict === "legitimate" ? "teal" : result.case?.verdict === "unsubstantiated" ? "coral" : "amber"}>
                    {result.case?.verdict?.replace("_", " ") ?? "pending"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Trace events</span>
                  <span className="font-semibold">{result.events.length}</span>
                </div>
              </div>
              {latestStatus ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{latestStatus}</p> : null}
              <Button asChild variant="secondary" className="mt-4 w-full justify-between">
                <Link href={`/case/${result.message_id}`}>
                  Open manager case
                  <ArrowUpRight size={16} />
                </Link>
              </Button>
            </Card>
          ) : (
            <Card className="p-4">
              <div className="text-sm font-semibold">Try this message</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{exampleMessage}</p>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => setInput(exampleMessage)}>
                Use example
              </Button>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}
