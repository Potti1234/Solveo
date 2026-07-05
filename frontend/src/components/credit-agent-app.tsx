import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Code2,
  FileText,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  TerminalSquare,
  XCircle
} from "lucide-react";
import { runAuditStream } from "../lib/api";
import type { AuditRun, AuditStreamEvent, ChatMessage, ChatRun, FileAttachment } from "../lib/types";
import { cn, compactNumber, formatRatio } from "../lib/utils";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle
} from "./ui/attachment";
import { Badge } from "./ui/badge";
import { Bubble, BubbleContent } from "./ui/bubble";
import { Button } from "./ui/button";
import { Marker, MarkerContent, MarkerIcon } from "./ui/marker";
import { Message, MessageContent } from "./ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from "./ui/message-scroller";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from "./ui/sidebar";
import { Textarea } from "./ui/textarea";

const STORAGE_KEY = "solveo-credit-chat-runs-v1";
const DEFAULT_AGREEMENT_URL =
  "https://www.sec.gov/Archives/edgar/data/927653/000092765326000167/mck_ex101termloanagreement.htm";

type TimelineKind = "message" | "phase" | "tool" | "retrieval" | "calculation" | "code" | "monitoring" | "report" | "error";

type TimelineItem = {
  id: string;
  kind: TimelineKind;
  title: string;
  summary: string;
  timestamp?: string;
  status?: "queued" | "running" | "complete" | "warning" | "error";
  message?: ChatMessage;
  detail?: React.ReactNode;
  raw?: unknown;
};

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function initialRun(): ChatRun {
  const timestamp = now();
  return {
    id: id("run"),
    title: "MCK covenant review",
    ticker: "MCK",
    creditAgreementUrl: DEFAULT_AGREEMENT_URL,
    status: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [
      {
        id: id("msg"),
        role: "assistant",
        createdAt: timestamp,
        content:
          "Ready. Give me a ticker, an agreement URL, or a debt report and I will route it through the credit monitoring workflow."
      }
    ]
  };
}

function loadRuns(): ChatRun[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [initialRun()];
    const parsed = JSON.parse(stored) as ChatRun[];
    return parsed.length ? parsed : [initialRun()];
  } catch {
    return [initialRun()];
  }
}

function statusLabel(status: ChatRun["status"]) {
  if (status === "running") return "Running";
  if (status === "complete") return "Complete";
  if (status === "error") return "Error";
  return "Ready";
}

function statusClasses(status: ChatRun["status"]) {
  if (status === "running") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "error") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function itemStatusClasses(status?: TimelineItem["status"]) {
  if (status === "running") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "error") return "border-red-200 bg-red-50 text-red-700";
  if (status === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function memoStatusClasses(status?: AuditRun["memo"]["status"]) {
  if (status === "compliant") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "breach") return "border-red-200 bg-red-50 text-red-800";
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function messageBubbleVariant(role: ChatMessage["role"]) {
  if (role === "user") return "default";
  if (role === "system") return "destructive";
  return "outline";
}

function extractTicker(prompt: string, fallback: string) {
  const withoutUrls = prompt.replace(/https?:\/\/\S+/g, "");
  const matches = withoutUrls.match(/\b[A-Z]{1,5}\b/g);
  const ignored = new Set(["SEC", "URL", "PDF", "LLM", "API", "CFO"]);
  return matches?.find((match) => !ignored.has(match)) ?? fallback;
}

function extractUrl(prompt: string) {
  return prompt.match(/https?:\/\/[^\s)]+/)?.[0];
}

function createMessage(role: ChatMessage["role"], content: string, attachments?: FileAttachment[]): ChatMessage {
  return {
    id: id("msg"),
    role,
    content,
    attachments,
    createdAt: now()
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatScheduleCadence(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} hr`;
  return `${Math.round(minutes / (24 * 60))} day`;
}

function formatScheduleKind(kind: string) {
  return kind
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatKind(kind: TimelineKind) {
  return kind.replace("_", " ");
}

function kindIcon(kind: TimelineKind) {
  if (kind === "tool") return Activity;
  if (kind === "retrieval") return Search;
  if (kind === "calculation") return TerminalSquare;
  if (kind === "code") return Code2;
  if (kind === "monitoring") return AlertTriangle;
  if (kind === "report") return FileText;
  if (kind === "error") return XCircle;
  return Bot;
}

function buildTimeline(run: ChatRun): TimelineItem[] {
  const items: TimelineItem[] = run.messages.map((message) => ({
    id: message.id,
    kind: "message",
    title: message.role === "user" ? "User prompt" : message.role === "system" ? "System" : "Assistant",
    summary: message.content,
    timestamp: message.createdAt,
    status: "complete",
    message,
    detail: <MessageDetail message={message} />
  }));

  for (const event of run.streamEvents ?? []) {
    if (event.type === "result" || event.type === "done") continue;
    const isHeartbeat = event.type === "heartbeat";
    const isError = event.type === "error";
    items.push({
      id: `${run.id}:stream:${event.type}:${event.createdAt}:${event.phase}`,
      kind: isError ? "error" : isHeartbeat ? "phase" : phaseToKind(event.phase),
      title: isHeartbeat ? "Still working" : naturalPhaseTitle(event.phase),
      summary: naturalPhaseMessage(event),
      timestamp: event.createdAt,
      status: isError ? "error" : isHeartbeat ? "running" : "complete",
      raw: event,
      detail: (
        <div className="space-y-3">
          <KeyValue label="Phase" value={event.phase} />
          <KeyValue label="Message" value={event.message} />
          {"payload" in event && event.payload ? <JsonDetail value={event.payload} /> : null}
        </div>
      )
    });
  }

  if (run.status === "running" && !(run.streamEvents?.length)) {
    items.push(
      {
        id: `${run.id}:running:sec`,
        kind: "phase",
        title: "Resolve borrower and SEC filings",
        summary: "Looking up company identifiers, recent filings, and agreement sources.",
        status: "running",
        detail: <PlainDetail lines={["Ticker resolution", "SEC submissions lookup", "Credit agreement discovery"]} />
      },
      {
        id: `${run.id}:running:retrieval`,
        kind: "retrieval",
        title: "Retrieve covenant evidence",
        summary: "Scanning agreement text for covenant rules, definitions, and reporting templates.",
        status: "queued",
        detail: <PlainDetail lines={["Financial Covenants", "Consolidated Leverage Ratio", "Fixed Charge Coverage Ratio"]} />
      },
      {
        id: `${run.id}:running:calculation`,
        kind: "calculation",
        title: "Run verification scripts",
        summary: "Preparing covenant math, stress tests, and code-based verification.",
        status: "queued",
        detail: <PlainDetail lines={["Extract legal formula", "Extract financial variables", "Execute code", "Compare against threshold"]} />
      }
    );
  }

  const audit = run.audit;
  if (!audit) {
    if (run.error) {
      items.push({
        id: `${run.id}:error`,
        kind: "error",
        title: "Workflow failed",
        summary: run.error,
        status: "error",
        detail: <PlainDetail lines={[run.error]} />
      });
    }
    return items;
  }

  items.push({
    id: `${run.id}:plan`,
    kind: "phase",
    title: "Workflow plan",
    summary: audit.plan.rationale,
    status: "complete",
    raw: audit.plan,
    detail: (
      <div className="space-y-3">
        <KeyValue label="Ticker" value={audit.plan.ticker} />
        <KeyValue label="Filing type" value={audit.plan.filingType} />
        <DetailList title="Retrieval queries" items={audit.plan.retrievalQueries} />
      </div>
    )
  });

  audit.thoughts.forEach((thought, index) => {
    items.push({
      id: `${run.id}:thought:${index}`,
      kind: "phase",
      title: thought.phase,
      summary: thought.message,
      status: "complete",
      raw: thought,
      detail: <JsonDetail value={thought.payload ?? thought} />
    });
  });

  audit.explainability.toolCalls.forEach((call) => {
    items.push({
      id: `${run.id}:tool:${call.order}`,
      kind: "tool",
      title: call.tool,
      summary: call.outputSummary,
      status: "complete",
      raw: call,
      detail: (
        <div className="space-y-4">
          <KeyValue label="Purpose" value={call.purpose} />
          <KeyValue label="Input" value={call.inputSummary} />
          <KeyValue label="Output" value={call.outputSummary} />
        </div>
      )
    });
  });

  audit.retrievals.forEach((retrieval, index) => {
    items.push({
      id: `${run.id}:retrieval:${index}`,
      kind: "retrieval",
      title: `Retrieved evidence for "${retrieval.query}"`,
      summary: retrieval.reasoning,
      status: retrieval.lineItems.length ? "complete" : "warning",
      raw: retrieval,
      detail: (
        <div className="space-y-4">
          <KeyValue label="Reasoning" value={retrieval.reasoning} />
          <LineItemTable lineItems={retrieval.lineItems} />
          <CitationList citations={retrieval.citations} />
        </div>
      )
    });
  });

  audit.explainability.calculationTrail.forEach((calculation, index) => {
    items.push({
      id: `${run.id}:calculation:${index}`,
      kind: "calculation",
      title: calculation.formula,
      summary: `${formatRatio(calculation.actual)} ${calculation.operator} ${formatRatio(calculation.threshold)} resulted in ${calculation.result}.`,
      status: calculation.result === "pass" ? "complete" : "warning",
      raw: calculation,
      detail: <CalculationDetail calculation={calculation} />
    });
  });

  audit.explainability.codeVerification.forEach((code, index) => {
    items.push({
      id: `${run.id}:code:${index}`,
      kind: "code",
      title: `${code.language} verification`,
      summary: code.purpose,
      status: code.exitCode === 0 ? "complete" : "warning",
      raw: code,
      detail: (
        <div className="space-y-3">
          <KeyValue label="Purpose" value={code.purpose} />
          <KeyValue label="Exit code" value={code.exitCode ?? "n/a"} />
          <pre className="max-h-80 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-200">{code.stdoutPreview}</pre>
        </div>
      )
    });
  });

  if (audit.creditMonitoring) {
    items.push({
      id: `${run.id}:monitoring`,
      kind: "monitoring",
      title: "Early warning monitoring",
      summary: `${audit.creditMonitoring.earlyWarning.level} risk, score ${audit.creditMonitoring.earlyWarning.score}/100.`,
      status: audit.creditMonitoring.earlyWarning.level === "low" ? "complete" : "warning",
      raw: audit.creditMonitoring,
      detail: <MonitoringDetail monitoring={audit.creditMonitoring} />
    });
  }

  items.push({
    id: `${run.id}:report`,
    kind: "report",
    title: "Final credit memo",
    summary: audit.memo.summary,
    status: audit.memo.status === "compliant" ? "complete" : "warning",
    raw: audit.memo,
    detail: <ReportDetail audit={audit} markdown={run.markdown} />
  });

  return items;
}

function phaseToKind(phase: string): TimelineKind {
  if (/retrieval|keyword|exhibit|sec|planning|rule/i.test(phase)) return "retrieval";
  if (/calculation/i.test(phase)) return "calculation";
  if (/code/i.test(phase)) return "code";
  if (/monitoring/i.test(phase)) return "monitoring";
  if (/report/i.test(phase)) return "report";
  return "phase";
}

function naturalPhaseTitle(phase: string) {
  const titles: Record<string, string> = {
    start: "Starting the credit review",
    sec_lookup: "Looking up SEC company data",
    exhibit_discovery: "Finding the credit agreement",
    keyword_scan: "Scanning covenant sections",
    rule_extraction: "Extracting covenant rules",
    planning: "Planning financial evidence retrieval",
    retrieval: "Retrieving financial evidence",
    calculation: "Calculating covenant compliance",
    code_execution: "Running verification code",
    monitoring: "Checking current risk signals",
    reporting: "Writing the credit memo"
  };
  return titles[phase] ?? phase.replace(/_/g, " ");
}

function naturalPhaseMessage(event: Extract<AuditStreamEvent, { message: string }>) {
  if (event.type === "heartbeat") return "This step is taking longer because the agent is reading filings, querying external services, or waiting on model extraction.";
  const payload = "payload" in event ? event.payload : undefined;
  if (event.phase === "sec_lookup" && payload?.ticker) return `I am resolving ${String(payload.ticker).toUpperCase()} against the SEC company index.`;
  if (event.phase === "exhibit_discovery") return "I am checking recent 10-K and 8-K filings for a usable credit agreement exhibit.";
  if (event.phase === "keyword_scan") return "I am scanning the agreement for financial covenants, leverage ratios, coverage ratios, and compliance certificate language.";
  if (event.phase === "rule_extraction") return "I am turning the legal covenant language into structured rules with thresholds and citations.";
  if (event.phase === "planning") return "I am deciding which filing tables and line items are needed to test the covenant.";
  if (event.phase === "retrieval" && payload?.query) return `I am retrieving evidence for: ${String(payload.query)}.`;
  if (event.phase === "calculation") return "I am computing the covenant ratios from the extracted financial variables.";
  if (event.phase === "code_execution") return event.message.includes("Executed") ? "I ran the verification script and captured the output." : "I am writing a small script to verify the math and stress the next two quarters.";
  if (event.phase === "monitoring") return "I am checking 8-K events, historical headroom, amendments, and follow-up schedules.";
  if (event.phase === "reporting") return "I am assembling the final credit memo with citations, caveats, and borrower questions.";
  return event.message;
}

export function CreditAgentApp() {
  const [runs, setRuns] = React.useState<ChatRun[]>(loadRuns);
  const [activeRunId, setActiveRunId] = React.useState(() => runs[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  }, [runs]);

  const activeRun = runs.find((run) => run.id === activeRunId) ?? runs[0];
  const timeline = React.useMemo(() => (activeRun ? buildTimeline(activeRun) : []), [activeRun]);
  const selectedItem = timeline.find((item) => item.id === selectedItemId) ?? timeline.find((item) => item.kind !== "message") ?? timeline[0];

  React.useEffect(() => {
    setSelectedItemId(null);
  }, [activeRunId]);

  function updateRun(runId: string, updater: (run: ChatRun) => ChatRun) {
    setRuns((current) => current.map((run) => (run.id === runId ? updater(run) : run)));
  }

  function createRun() {
    const next = initialRun();
    next.title = "New credit review";
    next.messages = [
      createMessage(
        "assistant",
        "Start with a ticker, an agreement URL, or a short instruction like: analyze MCK with this credit agreement."
      )
    ];
    setRuns((current) => [next, ...current]);
    setActiveRunId(next.id);
    setSelectedItemId(null);
  }

  async function submitPrompt(input: { prompt: string; ticker: string; creditAgreementUrl?: string; attachments: FileAttachment[] }) {
    const runId = activeRun.id;
    const ticker = extractTicker(input.prompt, input.ticker || activeRun.ticker || "MCK").toUpperCase();
    const creditAgreementUrl = extractUrl(input.prompt) ?? input.creditAgreementUrl ?? activeRun.creditAgreementUrl;
    const startedAt = now();
    setSelectedItemId(`${runId}:running:sec`);

    updateRun(runId, (run) => ({
      ...run,
      ticker,
      creditAgreementUrl,
      title: `${ticker} credit review`,
      status: "running",
      error: undefined,
      audit: undefined,
      markdown: undefined,
      streamEvents: [],
      updatedAt: startedAt,
      messages: [
        ...run.messages,
        createMessage("user", input.prompt, input.attachments),
        createMessage(
          "assistant",
          `I will route ${ticker} through SEC lookup, covenant extraction, financial retrieval, code verification, external checks, and memo generation.`
        )
      ]
    }));

    try {
      const response = await runAuditStream({ ticker, creditAgreementUrl }, (event) => {
        if (event.type === "done") return;
        updateRun(runId, (run) => ({
          ...run,
          streamEvents: [...(run.streamEvents ?? []), event],
          updatedAt: "createdAt" in event ? event.createdAt : now()
        }));
      });
      updateRun(runId, (run) => ({
        ...run,
        status: "complete",
        audit: response.audit,
        markdown: response.markdown,
        updatedAt: now(),
        messages: [
          ...run.messages,
          createMessage(
            "assistant",
            `Finished ${ticker}. Status: ${response.audit.memo.status.replace("_", " ")}. ${response.audit.memo.summary}`
          )
        ]
      }));
      setSelectedItemId(`${runId}:report`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The audit workflow failed.";
      updateRun(runId, (run) => ({
        ...run,
        status: "error",
        error: message,
        updatedAt: now(),
        messages: [...run.messages, createMessage("system", message)]
      }));
      setSelectedItemId(`${runId}:error`);
    }
  }

  if (!activeRun) return null;

  return (
    <SidebarProvider>
      <RunSidebar runs={runs} activeRun={activeRun} activeRunId={activeRun.id} onSelect={setActiveRunId} onCreate={createRun} />
      <SidebarInset>
        <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden">
          <RunHeader run={activeRun} />
          <div className="grid min-h-0 flex-1 overflow-hidden grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px]">
            <ChatWorkspace
              run={activeRun}
              timeline={timeline}
              selectedItemId={selectedItem?.id ?? null}
              onSelectItem={setSelectedItemId}
              onSubmit={submitPrompt}
            />
            <InspectorPanel run={activeRun} item={selectedItem} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function RunSidebar({
  runs,
  activeRun,
  activeRunId,
  onSelect,
  onCreate
}: {
  runs: ChatRun[];
  activeRun: ChatRun;
  activeRunId: string;
  onSelect: (runId: string) => void;
  onCreate: () => void;
}) {
  const { open } = useSidebar();
  const schedules = activeRun.audit?.creditMonitoring?.scheduleRecommendations ?? [];

  return (
    <Sidebar collapsible="icon">
      <div className="flex h-full flex-col">
        <SidebarHeader>
          <div className={cn("flex min-w-0 flex-1 items-center gap-3", !open && "justify-center")}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white">
              <ShieldCheck className="size-4" />
            </div>
            {open ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">Solveo Credit</div>
                <div className="truncate text-xs text-zinc-500">Agent runs</div>
              </div>
            ) : null}
          </div>
          <SidebarTrigger />
        </SidebarHeader>
        <SidebarContent>
          <Button type="button" className={cn("mx-2 mb-3", !open && "mx-auto px-0")} onClick={onCreate}>
            <MessageSquarePlus />
            {open ? "New run" : null}
          </Button>
          <div className="flex flex-col gap-1 px-2">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelect(run.id)}
                className={cn(
                  "group rounded-md border p-3 text-left transition-all hover:border-zinc-300 hover:bg-zinc-50",
                  activeRunId === run.id ? "border-zinc-300 bg-zinc-50" : "border-transparent bg-white",
                  !open && "flex h-10 items-center justify-center p-0"
                )}
                title={run.title}
              >
                {open ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-sm font-medium text-zinc-950">{run.title}</div>
                      <Badge className={statusClasses(run.status)}>{statusLabel(run.status)}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span>{run.ticker}</span>
                      <span>{formatDate(run.updatedAt)}</span>
                    </div>
                  </>
                ) : (
                  <Bot className="size-4 text-zinc-600" />
                )}
              </button>
            ))}
          </div>
          {open ? (
            <div className="mt-5 border-t border-zinc-200 px-2 pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Follow-up agents</div>
                <Badge className="border-zinc-200 bg-zinc-50 text-zinc-600">{schedules.length || "none"}</Badge>
              </div>
              <div className="space-y-2">
                {schedules.length ? (
                  schedules.slice(0, 4).map((schedule, index) => (
                    <div key={`${schedule.kind}-${index}`} className="rounded-md border border-zinc-200 bg-white p-3">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500">
                          <CalendarClock className="size-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-zinc-950">{formatScheduleKind(schedule.kind)}</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">
                            Every {formatScheduleCadence(schedule.cadenceMinutes)} from {formatDate(schedule.runAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
                    Follow-up scans will appear here after a completed run.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </SidebarContent>
        <SidebarFooter>
          {open ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
              Click an agent event in the conversation to inspect sources, inputs, outputs, and code.
            </div>
          ) : null}
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}

function RunHeader({ run }: { run: ChatRun }) {
  const status = run.audit?.memo.status;
  const earlyWarning = run.audit?.creditMonitoring?.earlyWarning;

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold text-zinc-950">{run.title}</h1>
            <Badge className={statusClasses(run.status)}>{statusLabel(run.status)}</Badge>
            {status ? <Badge className={memoStatusClasses(status)}>{status.replace("_", " ")}</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>Ticker {run.ticker}</span>
            {earlyWarning ? <span>Risk score {earlyWarning.score}/100</span> : null}
            {run.creditAgreementUrl ? <span className="max-w-[42rem] truncate">Agreement linked</span> : null}
          </div>
        </div>
      </div>
      {run.status === "running" ? (
        <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
          <Loader2 className="size-3.5 animate-spin" />
          Agent workflow active
        </div>
      ) : null}
    </header>
  );
}

function ChatWorkspace({
  run,
  timeline,
  selectedItemId,
  onSelectItem,
  onSubmit
}: {
  run: ChatRun;
  timeline: TimelineItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  onSubmit: (input: { prompt: string; ticker: string; creditAgreementUrl?: string; attachments: FileAttachment[] }) => void;
}) {
  const [prompt, setPrompt] = React.useState("Analyze this report with the filings and produce a credit officer memo.");
  const [ticker, setTicker] = React.useState(run.ticker);
  const [creditAgreementUrl, setCreditAgreementUrl] = React.useState(run.creditAgreementUrl ?? "");
  const [attachments, setAttachments] = React.useState<FileAttachment[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setTicker(run.ticker);
    setCreditAgreementUrl(run.creditAgreementUrl ?? "");
    setAttachments([]);
  }, [run.id, run.ticker, run.creditAgreementUrl]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || run.status === "running") return;
    onSubmit({ prompt: prompt.trim(), ticker, creditAgreementUrl: creditAgreementUrl.trim() || undefined, attachments });
    setPrompt("");
    setAttachments([]);
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setAttachments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        id: id("file"),
        name: file.name,
        size: file.size,
        type: file.type
      }))
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <section className="flex min-h-0 overflow-hidden flex-col bg-zinc-50">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1 overflow-hidden">
          <MessageScrollerViewport className="px-4 py-6">
            <MessageScrollerContent className="mx-auto w-full max-w-5xl gap-4">
              {timeline.map((item) => (
                <MessageScrollerItem key={item.id} scrollAnchor={item.id === timeline[timeline.length - 1]?.id}>
                  {item.kind === "message" && item.message ? (
                    <ChatMessageItem item={item} onSelect={onSelectItem} selected={selectedItemId === item.id} />
                  ) : (
                    <AgentEventItem item={item} onSelect={onSelectItem} selected={selectedItemId === item.id} />
                  )}
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <form onSubmit={submit} className="shrink-0 border-t border-zinc-200 bg-white p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <Textarea
              value={prompt}
              onChange={(event) => {
                const value = event.target.value;
                setPrompt(value);
                const nextTicker = extractTicker(value, run.ticker);
                setTicker(nextTicker);
                setCreditAgreementUrl(extractUrl(value) ?? run.creditAgreementUrl ?? "");
              }}
              placeholder="Ask the agent in plain language. Example: Analyze MCK with this credit agreement URL and prepare a covenant risk plan."
              aria-label="Prompt"
              className="min-h-24 border-0 px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
                <Badge className="border-zinc-200 bg-zinc-50 text-zinc-700">Ticker {ticker}</Badge>
                {creditAgreementUrl ? <Badge className="border-zinc-200 bg-zinc-50 text-zinc-700">Agreement detected</Badge> : null}
                <span className="truncate">Use free text, paste SEC links, or attach a debt report.</span>
              </div>
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" className="hidden" multiple onChange={(event) => handleFiles(event.target.files)} />
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip />
                  Attach report
                </Button>
                <Button type="submit" disabled={run.status === "running" || !prompt.trim()}>
                  {run.status === "running" ? <Loader2 className="animate-spin" /> : <Send />}
                  Run agent
                </Button>
              </div>
            </div>
          </div>
          {attachments.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {attachments.map((attachment) => (
                <FileAttachmentView
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                />
              ))}
            </div>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function ChatMessageItem({ item, selected, onSelect }: { item: TimelineItem; selected: boolean; onSelect: (itemId: string) => void }) {
  const message = item.message!;
  const align = message.role === "user" ? "end" : "start";

  return (
    <Message align={align}>
      <MessageContent>
        <Bubble align={align} variant={messageBubbleVariant(message.role)} className="max-w-[88%]">
          <BubbleContent
            asChild
            className={cn(
              "cursor-pointer text-left transition-all",
              selected && "ring-2 ring-zinc-950/15",
              message.role === "assistant" && "border-zinc-200 bg-white text-zinc-900",
              message.role === "system" && "border-red-200 bg-red-50 text-red-900"
            )}
          >
            <button type="button" onClick={() => onSelect(item.id)}>
              {message.content}
            </button>
          </BubbleContent>
        </Bubble>
        {message.attachments?.length ? (
          <div className="grid w-full gap-2">
            {message.attachments.map((attachment) => (
              <FileAttachmentView key={attachment.id} attachment={attachment} />
            ))}
          </div>
        ) : null}
      </MessageContent>
    </Message>
  );
}

function AgentEventItem({ item, selected, onSelect }: { item: TimelineItem; selected: boolean; onSelect: (itemId: string) => void }) {
  const Icon = kindIcon(item.kind);
  const isRunning = item.status === "running";

  return (
    <Message align="start">
      <MessageContent>
        <Bubble variant="outline" className="max-w-[92%]">
          <BubbleContent
            asChild
            className={cn(
              "w-full cursor-pointer border-zinc-200 bg-white p-0 text-left transition-all hover:border-zinc-300 hover:bg-zinc-50",
              selected && "border-zinc-400 ring-2 ring-zinc-950/10"
            )}
          >
            <button type="button" onClick={() => onSelect(item.id)}>
              <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 p-3">
                <div className="mt-0.5 flex size-8 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600">
                  {isRunning ? <Loader2 className="size-4 animate-spin text-blue-600" /> : <Icon className="size-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-950">{item.title}</span>
                    <Badge className={itemStatusClasses(item.status)}>{item.status ?? "complete"}</Badge>
                    <Badge>{formatKind(item.kind)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-600">{item.summary}</p>
                </div>
              </div>
            </button>
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

function FileAttachmentView({ attachment, onRemove }: { attachment: FileAttachment; onRemove?: () => void }) {
  return (
    <Attachment size="sm" className="max-w-sm">
      <AttachmentMedia>
        <FileText />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{attachment.name}</AttachmentTitle>
        <AttachmentDescription>{Math.max(1, Math.round(attachment.size / 1024))} KB</AttachmentDescription>
      </AttachmentContent>
      {onRemove ? (
        <AttachmentActions>
          <AttachmentAction type="button" aria-label="Remove attachment" onClick={onRemove}>
            <XCircle />
          </AttachmentAction>
        </AttachmentActions>
      ) : null}
    </Attachment>
  );
}

function InspectorPanel({ run, item }: { run: ChatRun; item?: TimelineItem }) {
  const Icon = item ? kindIcon(item.kind) : Bot;

  return (
    <aside className="hidden min-h-0 overflow-hidden border-l border-zinc-200 bg-white xl:flex xl:flex-col">
      <div className="shrink-0 border-b border-zinc-200 bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">Inspector</h2>
            <p className="mt-1 text-xs text-zinc-500">Click a conversation event to inspect the evidence behind it.</p>
          </div>
          {run.status === "running" ? <Loader2 className="size-4 animate-spin text-blue-600" /> : null}
        </div>
      </div>

      {item ? (
        <div className="min-h-0 overflow-y-auto divide-y divide-zinc-200">
          <section className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-950">{item.title}</h3>
                  <Badge className={itemStatusClasses(item.status)}>{item.status ?? "complete"}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{item.summary}</p>
              </div>
            </div>
          </section>
          <section className="p-5">{item.detail ?? <JsonDetail value={item.raw ?? item} />}</section>
          {item.raw ? (
            <section className="p-5">
              <SectionTitle icon={Code2} title="Raw payload" />
              <JsonDetail value={item.raw} />
            </section>
          ) : null}
        </div>
      ) : (
        <div className="p-5">
          <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4">
            <div className="text-sm font-medium text-zinc-900">No event selected</div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">Run the agent, then select a tool call or calculation bubble in the conversation.</p>
          </div>
        </div>
      )}
    </aside>
  );
}

function MessageDetail({ message }: { message: ChatMessage }) {
  return (
    <div className="space-y-3">
      <KeyValue label="Role" value={message.role} />
      <KeyValue label="Time" value={formatDate(message.createdAt)} />
      <KeyValue label="Content" value={message.content} />
      {message.attachments?.length ? (
        <DetailList title="Attachments" items={message.attachments.map((attachment) => `${attachment.name} (${Math.round(attachment.size / 1024)} KB)`)} />
      ) : null}
    </div>
  );
}

function PlainDetail({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-2">
      {lines.map((line) => (
        <div key={line} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm leading-5 text-zinc-700">
          {line}
        </div>
      ))}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      <div className="text-sm leading-6 text-zinc-800">{value}</div>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs leading-5 text-zinc-700">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineItemTable({ lineItems }: { lineItems: AuditRun["retrievals"][number]["lineItems"] }) {
  if (!lineItems.length) return <PlainDetail lines={["No structured line items were extracted for this retrieval."]} />;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Line items</div>
      {lineItems.map((item) => (
        <div key={`${item.name}-${item.period}`} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-zinc-900">{item.name}</span>
            <span className="font-mono text-sm text-zinc-800">{item.unit === "usd" ? `$${compactNumber(item.value)}` : formatRatio(item.value)}</span>
          </div>
          <div className="mt-1 text-xs text-zinc-500">{item.period}</div>
        </div>
      ))}
    </div>
  );
}

function CitationList({ citations }: { citations: AuditRun["explainability"]["evidenceTrail"][number][] | AuditRun["retrievals"][number]["citations"] }) {
  if (!citations.length) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Citations</div>
      {citations.slice(0, 5).map((citation, index) => (
        <div key={`${citation.source}-${citation.locator}-${index}`} className="rounded-md border border-zinc-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
            <span className="truncate">{citation.source}</span>
            <span className="font-mono">{citation.locator}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-700">{citation.excerpt}</p>
        </div>
      ))}
    </div>
  );
}

function CalculationDetail({ calculation }: { calculation: AuditRun["explainability"]["calculationTrail"][number] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Actual" value={`${formatRatio(calculation.actual)}x`} />
        <Metric label="Threshold" value={`${formatRatio(calculation.threshold)}x`} />
      </div>
      <KeyValue label="Formula" value={<code className="text-xs">{calculation.formula}</code>} />
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Inputs</div>
        {calculation.inputs.map((input) => (
          <div key={input.name} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <span className="text-zinc-700">{input.name}</span>
            <span className="font-mono text-zinc-950">{input.unit === "usd" ? `$${compactNumber(input.value)}` : formatRatio(input.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonitoringDetail({ monitoring }: { monitoring: NonNullable<AuditRun["creditMonitoring"]> }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-zinc-950">Early warning score</div>
          <div className="font-mono text-sm font-semibold text-zinc-950">{monitoring.earlyWarning.score}/100</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-zinc-200">
          <div className="h-2 rounded-full bg-zinc-950" style={{ width: `${Math.min(100, monitoring.earlyWarning.score)}%` }} />
        </div>
      </div>
      <DetailList title="Drivers" items={monitoring.earlyWarning.drivers} />
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Scheduled follow-ups</div>
        {monitoring.scheduleRecommendations.map((schedule, index) => (
          <div key={`${schedule.kind}-${index}`} className="rounded-md border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-950">
              <CalendarClock className="size-4 text-zinc-500" />
              {schedule.kind}
            </div>
            <div className="mt-2 text-xs leading-5 text-zinc-500">
              Every {schedule.cadenceMinutes} minutes from {formatDate(schedule.runAt)}. {schedule.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportDetail({ audit, markdown }: { audit: AuditRun; markdown?: string }) {
  const primaryCalculation = audit.memo.calculations[0];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Decision</div>
          <div className="mt-2 text-lg font-semibold text-zinc-950">{audit.memo.status.replace("_", " ")}</div>
        </div>
        <Badge className={memoStatusClasses(audit.memo.status)}>{audit.rulebook.borrower}</Badge>
      </div>
      <p className="text-sm leading-6 text-zinc-600">{audit.memo.summary}</p>
      {primaryCalculation ? (
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Actual" value={`${formatRatio(primaryCalculation.actual)}x`} />
          <Metric label="Limit" value={`${formatRatio(primaryCalculation.threshold)}x`} />
          <Metric label="Headroom" value={`${formatRatio(primaryCalculation.threshold - primaryCalculation.actual)}x`} />
        </div>
      ) : null}
      {audit.actionPlan ? (
        <div className="space-y-3">
          <SectionTitle icon={CheckCircle2} title="Action plan" detail={audit.actionPlan.status} />
          <p className="text-sm leading-6 text-zinc-600">{audit.actionPlan.creditOfficerSummary}</p>
          <DetailList title="Borrower questions" items={audit.actionPlan.borrowerQuestions} />
        </div>
      ) : null}
      {markdown ? (
        <pre className="max-h-80 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">{markdown}</pre>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-zinc-950">{value}</div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  detail
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-zinc-500" />
        <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      </div>
      {detail ? <Badge>{detail}</Badge> : null}
    </div>
  );
}

function JsonDetail({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
