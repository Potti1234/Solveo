import { CheckCircle2, ClipboardList, Search, Sparkles, Wrench, XCircle } from "lucide-react";
import type { CaseEvent, Citation } from "@/lib/api";
import { CitationList } from "@/components/CitationList";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function CaseTrace({ events }: { events: CaseEvent[] }) {
  if (!events.length) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold text-foreground">Agent activity is starting</div>
        <p className="mt-1 text-sm text-muted-foreground">The plan, evidence checks, decision, and actions will appear here as the run progresses.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {events.map((event) => (
        <article key={event.id} className="relative rounded-lg border border-border bg-card p-4 shadow-crisp">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <EventIcon type={event.event_type} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-foreground">{event.title}</h3>
                    <Badge variant={event.event_type === "error" ? "coral" : event.event_type === "decision" ? "teal" : "slate"}>
                      {event.event_type.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <time className="text-xs font-semibold text-muted-foreground">{new Date(event.created_at).toLocaleTimeString()}</time>
              </div>
              <EventPayload event={event} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  if (type === "plan") return <ClipboardList size={16} />;
  if (type === "tool_result") return <Search size={16} />;
  if (type === "decision") return <CheckCircle2 size={16} />;
  if (type === "action") return <Wrench size={16} />;
  if (type === "error") return <XCircle size={16} />;
  return <Sparkles size={16} />;
}

function EventPayload({ event }: { event: CaseEvent }) {
  if (event.event_type === "plan") {
    const steps = event.payload.steps ?? [];
    return (
      <ol className="mt-3 grid gap-2">
        {steps.map((step: any) => (
          <li key={step.id} className="rounded-md border border-border bg-background/70 px-3 py-2 text-sm">
            <strong className="font-semibold text-foreground">{step.tool}</strong>
            <span className="text-muted-foreground"> / {step.reason}</span>
          </li>
        ))}
      </ol>
    );
  }

  if (event.event_type === "tool_result") {
    const payload = event.payload;
    const citations = (payload.citations ?? []) as Citation[];
    const snippets = payload.data?.snippets ?? [];
    const records = payload.data?.records ?? [];
    const observations = payload.data?.observations ?? [];
    return (
      <div className="mt-3 grid gap-3">
        {snippets.length ? <CompactList title="Policy findings" items={snippets.map((item: any) => `${item.locator}: ${item.text}`)} /> : null}
        {records.length ? <CompactList title="Operational records" items={records.map((item: any) => `${item.ticket_id}: ${item.summary}`)} /> : null}
        {observations.length ? <CompactList title="Attachment observations" items={observations.map((item: any) => `${item.filename}: ${item.caption}`)} /> : null}
        <CitationList citations={citations} />
      </div>
    );
  }

  if (event.event_type === "decision") {
    return <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.payload.reasoning}</p>;
  }

  if (event.event_type === "action") {
    const actions = event.payload.actions_taken ?? [];
    if (actions.length) return <CompactList title="Actions created" items={actions} />;
    return <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.payload.quote ?? "Action recorded."}</p>;
  }

  return null;
}

function CompactList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-muted-foreground">{title}</div>
      <ul className="grid gap-2">
        {items.slice(0, 4).map((item, index) => (
          <li key={`${item}-${index}`} className="rounded-md bg-muted px-3 py-2 text-sm leading-5 text-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
