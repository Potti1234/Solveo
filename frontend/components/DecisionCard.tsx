import { BadgeDollarSign, CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import type { CaseRecord } from "@/lib/api";
import { CitationList } from "@/components/CitationList";

export function DecisionCard({ record }: { record: CaseRecord }) {
  const verdict = record.verdict ?? "pending";
  const icon =
    verdict === "legitimate" ? <CheckCircle2 size={20} /> : verdict === "unsubstantiated" ? <XCircle size={20} /> : <CircleAlert size={20} />;
  const tone =
    verdict === "legitimate"
      ? "border-teal/30 bg-teal/5 text-teal"
      : verdict === "unsubstantiated"
        ? "border-coral/30 bg-coral/5 text-coral"
        : "border-amber/40 bg-amber/5 text-amber";

  return (
    <section className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal">
            {icon}
            {verdict.replace("_", " ")}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink">{record.reasoning ?? "Waiting for adjudication."}</p>
        </div>
        <div className="status-pill bg-white text-ink">
          {record.confidence ? `${Math.round(record.confidence * 100)}% confidence` : "running"}
        </div>
      </div>
      {record.compensation ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-3 text-sm text-ink">
          <BadgeDollarSign size={18} className="text-teal" />
          <strong>${record.compensation.amount.toFixed(2)}</strong>
          <span>{record.compensation.policy_clause}</span>
          <span className="text-muted">{record.compensation.rationale}</span>
        </div>
      ) : null}
      {record.response_draft ? (
        <div className="mt-4 rounded-lg border border-line bg-white p-3">
          <div className="text-xs font-bold uppercase tracking-normal text-muted">Guest Response</div>
          <p className="mt-2 text-sm leading-6 text-ink">{record.response_draft}</p>
        </div>
      ) : null}
      <div className="mt-4">
        <CitationList citations={record.citations ?? []} />
      </div>
    </section>
  );
}
