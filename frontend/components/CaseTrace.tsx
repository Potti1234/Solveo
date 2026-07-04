import { CheckCircle2, ClipboardList, Search, Sparkles, Wrench, XCircle } from "lucide-react";
import type { CaseEvent, Citation } from "@/lib/api";
import { CitationList } from "@/components/CitationList";

export function CaseTrace({ events }: { events: CaseEvent[] }) {
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <article key={event.id} className="rounded-lg border border-line bg-white p-4 shadow-crisp">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-wash text-ink">
              <EventIcon type={event.event_type} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-ink">{event.title}</h3>
                <span className="text-xs font-semibold text-muted">{new Date(event.created_at).toLocaleTimeString()}</span>
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
          <li key={step.id} className="rounded-lg border border-line bg-wash px-3 py-2 text-sm">
            <strong>{step.tool}</strong>
            <span className="text-muted"> · {step.reason}</span>
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
      <div className="mt-3 space-y-3">
        {snippets.length ? <CompactList items={snippets.map((item: any) => `${item.locator}: ${item.text}`)} /> : null}
        {records.length ? <CompactList items={records.map((item: any) => `${item.ticket_id}: ${item.summary}`)} /> : null}
        {observations.length ? <CompactList items={observations.map((item: any) => `${item.filename}: ${item.caption}`)} /> : null}
        <CitationList citations={citations} />
      </div>
    );
  }

  if (event.event_type === "decision") {
    return <p className="mt-2 text-sm leading-6 text-muted">{event.payload.reasoning}</p>;
  }

  if (event.event_type === "action") {
    const actions = event.payload.actions_taken ?? [];
    if (actions.length) return <CompactList items={actions} />;
    return <p className="mt-2 text-sm leading-6 text-muted">{event.payload.quote ?? "Action recorded."}</p>;
  }

  return null;
}

function CompactList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2">
      {items.slice(0, 4).map((item, index) => (
        <li key={`${item}-${index}`} className="rounded-lg bg-wash px-3 py-2 text-sm leading-5 text-ink">
          {item}
        </li>
      ))}
    </ul>
  );
}
