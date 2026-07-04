"use client";

import { useEffect, useState } from "react";
import { Bot, Database, RadioTower } from "lucide-react";
import { getAgentRuntime, type AgentRuntime } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function AgentRuntimeBadge({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [runtime, setRuntime] = useState<AgentRuntime | null>(null);

  useEffect(() => {
    getAgentRuntime().then(setRuntime).catch(() => undefined);
  }, []);

  const agent = runtime?.agent ?? "checking";
  const mode = runtime?.mode ?? "checking-runtime";
  const live = Boolean(runtime?.live_model);

  if (compact) {
    return (
      <Badge variant={live ? "teal" : "amber"} className={className}>
        <Bot size={13} />
        {agent === "pi-agent-core" ? "Pi agent" : agent}
      </Badge>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-muted/60 p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Bot size={14} />
          Agent runtime
        </div>
        <Badge variant={live ? "teal" : "amber"}>{live ? "Vultr live" : "Fallback"}</Badge>
      </div>
      <div className="mt-3 grid gap-2 text-xs font-medium text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <RadioTower size={13} />
            Handler
          </span>
          <span className="font-semibold text-foreground">{agent === "pi-agent-core" ? "Pi agent" : agent}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Database size={13} />
            Store
          </span>
          <span className="font-semibold text-foreground">{runtime?.database ?? "checking"}</span>
        </div>
        <div className="truncate text-muted-foreground">{mode.replaceAll("-", " ")}</div>
      </div>
    </div>
  );
}
