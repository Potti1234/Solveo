"use client";

import Link from "next/link";
import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, ClipboardList, Loader2, Siren, TrendingUp } from "lucide-react";
import { apiFetch, type Citation } from "@/lib/api";
import { CitationList } from "@/components/CitationList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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

  const highSeverity = useMemo(() => board.filter((item) => item.severity >= 4).length, [board]);
  const compensationReviews = useMemo(() => board.filter((item) => item.verdict === "legitimate").length, [board]);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="coral">
              <Siren size={13} />
              Operations board
            </Badge>
            <Badge variant="default">Manager reports</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Property signals</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Severity-ranked case decisions and repeated-property issues surfaced from agent investigations.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/inbox">
            Open command center
            <ArrowUpRight size={16} />
          </Link>
        </Button>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <ReportMetric label="Pattern alerts" value={alerts.length} detail="Repeated operational issues" icon={AlertTriangle} tone="coral" />
        <ReportMetric label="High-severity cases" value={highSeverity} detail="Needs manager visibility" icon={TrendingUp} tone="amber" />
        <ReportMetric label="Compensation reviews" value={compensationReviews} detail="Policy-backed recovery work" icon={ClipboardList} tone="teal" />
      </section>

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Pattern alerts</h2>
            <p className="text-sm text-muted-foreground">Repeated issues the manager should resolve outside individual guest threads.</p>
          </div>

          <div className="grid gap-3">
            {alerts.map((alert) => (
              <Card key={alert.id} className="overflow-hidden border-destructive/30">
                <div className="border-b border-border bg-destructive/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Badge variant="coral" className="mb-3">
                        <AlertTriangle size={14} />
                        {alert.severity} alert
                      </Badge>
                      <h3 className="text-lg font-semibold leading-tight text-foreground">{alert.summary}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {alert.issue_type} / {alert.location}
                      </p>
                    </div>
                    <Badge variant="default">{alert.count} records</Badge>
                  </div>
                </div>
                <CardContent className="pt-4">
                  <CitationList citations={alert.citations} />
                </CardContent>
              </Card>
            ))}
            {!alerts.length && !loading ? (
              <Card className="p-5">
                <div className="text-sm font-semibold text-foreground">No repeated pattern alerts</div>
                <p className="mt-1 text-sm text-muted-foreground">Case investigations will surface operational clusters here.</p>
              </Card>
            ) : null}
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Decision queue</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {board.map((item) => (
                <article key={item.id} className="rounded-lg border border-border bg-background/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={item.verdict === "legitimate" ? "teal" : item.verdict === "unsubstantiated" ? "coral" : "amber"}>
                          {item.verdict.replace("_", " ")}
                        </Badge>
                        <Badge variant="default">Severity {item.severity}</Badge>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">{item.summary}</h3>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Decision ${item.case_id}`}>
                      <ArrowUpRight size={16} />
                    </Button>
                  </div>
                  <div className="mt-3">
                    <CitationList citations={item.citations.slice(0, 2)} />
                  </div>
                </article>
              ))}
              {!board.length && !loading ? <p className="text-sm text-muted-foreground">No case decisions yet.</p> : null}
            </CardContent>
          </Card>
        </aside>
      </section>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone
}: {
  label: string;
  value: number;
  detail: string;
  icon: ElementType;
  tone: "teal" | "amber" | "coral";
}) {
  const color = tone === "teal" ? "text-primary" : tone === "amber" ? "text-amber" : "text-destructive";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">{detail}</div>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-md bg-muted ${color}`}>
          <Icon size={17} />
        </span>
      </div>
    </Card>
  );
}
