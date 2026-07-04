import { Quote } from "lucide-react";
import type { Citation } from "@/lib/api";
import { Card } from "@/components/ui/card";

export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations?.length) return null;
  return (
    <div className="grid gap-2">
      {citations.map((citation, index) => (
        <Card key={`${citation.source}-${citation.locator}-${index}`} className="bg-background/60 p-3 shadow-none">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Quote size={14} />
            <span className="truncate">{citation.source}</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">{citation.locator}</span>
          </div>
          <p className="mt-2 text-sm leading-5 text-foreground">{citation.quote}</p>
        </Card>
      ))}
    </div>
  );
}
