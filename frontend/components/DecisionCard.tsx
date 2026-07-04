import { BadgeDollarSign, CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import type { CaseRecord } from "@/lib/api";
import { CitationList } from "@/components/CitationList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function DecisionCard({ record }: { record: CaseRecord }) {
  const verdict = record.verdict ?? "pending";
  const icon =
    verdict === "legitimate" ? <CheckCircle2 size={16} /> : verdict === "unsubstantiated" ? <XCircle size={16} /> : <CircleAlert size={16} />;
  const tone = verdict === "legitimate" ? "teal" : verdict === "unsubstantiated" ? "coral" : "amber";

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-muted/45 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant={tone} className="mb-3">
              {icon}
              {verdict.replace("_", " ")}
            </Badge>
            <h2 className="text-lg font-semibold leading-tight text-foreground">Agent decision</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground">{record.reasoning ?? "Waiting for adjudication."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{record.confidence ? `${Math.round(record.confidence * 100)}% confidence` : "running"}</Badge>
            {record.escalate ? <Badge variant="violet">Manager review</Badge> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4">
        {record.compensation ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3 text-sm text-foreground">
            <BadgeDollarSign size={18} className="text-primary" />
            <strong>${record.compensation.amount.toFixed(2)}</strong>
            <span>{record.compensation.policy_clause}</span>
            <span className="text-muted-foreground">{record.compensation.rationale}</span>
          </div>
        ) : null}

        {record.response_draft ? (
          <section className="rounded-md border border-border bg-background/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-muted-foreground">Guest response draft</div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm">Review draft</Button>
                <Button variant="violet" size="sm">Take over chat</Button>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground">{record.response_draft}</p>
          </section>
        ) : null}

        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Policy citations</div>
          <CitationList citations={record.citations ?? []} />
        </div>
      </div>
    </Card>
  );
}
