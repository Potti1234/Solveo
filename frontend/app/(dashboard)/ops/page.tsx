"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, Loader2 } from "lucide-react";
import { apiFetch, type Citation } from "@/lib/api";
import { CitationList } from "@/components/CitationList";

type AlertRow = {
  id: number;
  issue_type: string;
  location: string;
  count: number;
  severity: string;
  summary: string;
  citations: Citation[];
};

type BoardRow = {
  id: number;
  case_id: number;
  severity: number;
  verdict: string;
  summary: string;
  citations: Citation[];
};

export default function OpsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ alerts: AlertRow[]; board: BoardRow[] }>("/api/ops")
      .then((data) => {
        setAlerts(data.alerts);
        setBoard(data.board);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="border-b border-line pb-4">
        <h1 className="text-2xl font-bold tracking-normal text-ink">Operations Board</h1>
        <p className="mt-1 text-sm text-muted">Severity-ranked decisions and pattern alerts</p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-line bg-white p-5 text-sm text-muted">
          <Loader2 className="mr-2 inline animate-spin" size={16} />
          Loading board...
        </div>
      ) : null}

      <section className="grid gap-3">
        {alerts.map((alert) => (
          <article key={alert.id} className="rounded-lg border border-coral/30 bg-white p-4 shadow-crisp">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-coral">
                  <AlertTriangle size={17} />
                  {alert.severity} alert
                </div>
                <h2 className="mt-2 text-lg font-bold tracking-normal text-ink">{alert.summary}</h2>
                <p className="mt-1 text-sm text-muted">
                  {alert.issue_type} · {alert.location}
                </p>
              </div>
              <span className="status-pill bg-white text-ink">{alert.count} records</span>
            </div>
            <div className="mt-4">
              <CitationList citations={alert.citations} />
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-3">
        {board.map((item) => (
          <article key={item.id} className="rounded-lg border border-line bg-white p-4 shadow-crisp">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-muted">
                  <ClipboardList size={17} />
                  Case {item.case_id}
                </div>
                <h2 className="mt-2 text-base font-bold tracking-normal text-ink">{item.summary}</h2>
                <p className="mt-1 text-sm text-muted">{item.verdict.replace("_", " ")}</p>
              </div>
              <span className="status-pill bg-white text-ink">Severity {item.severity}</span>
            </div>
            <div className="mt-4">
              <CitationList citations={item.citations.slice(0, 4)} />
            </div>
          </article>
        ))}
        {!board.length && !loading ? <div className="rounded-lg border border-line bg-white p-5 text-sm text-muted">No case decisions yet</div> : null}
      </section>
    </div>
  );
}
