import { Quote } from "lucide-react";
import type { Citation } from "@/lib/api";

export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations?.length) return null;
  return (
    <div className="space-y-2">
      {citations.map((citation, index) => (
        <div key={`${citation.source}-${citation.locator}-${index}`} className="rounded-lg border border-line bg-white p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-normal text-muted">
            <Quote size={14} />
            {citation.source} · {citation.locator}
          </div>
          <p className="mt-2 text-sm leading-5 text-ink">{citation.quote}</p>
        </div>
      ))}
    </div>
  );
}
