import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Play,
  Search,
  Send,
  ShieldCheck,
  TerminalSquare,
  XCircle
} from "lucide-react";
import { runAudit } from "../lib/api";
import type { AuditRun, ChatMessage, ChatRun, FileAttachment } from "../lib/types";
import { cn, compactNumber, formatRatio } from "../lib/utils";
import { Attachment, Bubble, Marker, Message, MessageScroller } from "./ui/chat";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
          "Ready to run the credit monitoring workflow. Ask for a covenant review, attach a debt report if you have one, and provide a ticker or SEC credit agreement URL."
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

function memoStatusClasses(status?: AuditRun["memo"]["status"]) {
  if (status === "compliant") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "breach") return "border-red-200 bg-red-50 text-red-800";
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
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

export function CreditAgentApp() {
  const [runs, setRuns] = React.useState<ChatRun[]>(loadRuns);
  const [activeRunId, setActiveRunId] = React.useState(() => runs[0]?.id ?? "");

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  }, [runs]);

  const activeRun = runs.find((run) => run.id === activeRunId) ?? runs[0];

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
  }

  async function submitPrompt(input: { prompt: string; ticker: string; creditAgreementUrl?: string; attachments: FileAttachment[] }) {
    const runId = activeRun.id;
    const ticker = extractTicker(input.prompt, input.ticker || activeRun.ticker || "MCK").toUpperCase();
    const creditAgreementUrl = extractUrl(input.prompt) ?? input.creditAgreementUrl ?? activeRun.creditAgreementUrl;
    const startedAt = now();

    updateRun(runId, (run) => ({
      ...run,
      ticker,
      creditAgreementUrl,
      title: `${ticker} credit review`,
      status: "running",
      error: undefined,
      updatedAt: startedAt,
      messages: [
        ...run.messages,
        createMessage("user", input.prompt, input.attachments),
        createMessage(
          "assistant",
          `Routing ${ticker} through SEC lookup, covenant extraction, financial retrieval, code verification, external checks, and audit memo generation.`
        )
      ]
    }));

    try {
      const response = await runAudit({ ticker, creditAgreementUrl });
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "The audit workflow failed.";
      updateRun(runId, (run) => ({
        ...run,
        status: "error",
        error: message,
        updatedAt: now(),
        messages: [...run.messages, createMessage("system", message)]
      }));
    }
  }

  if (!activeRun) return null;

  return (
    <SidebarProvider>
      <RunSidebar runs={runs} activeRunId={activeRun.id} onSelect={setActiveRunId} onCreate={createRun} />
      <SidebarInset>
        <div className="flex min-h-[100dvh] flex-col">
          <RunHeader run={activeRun} />
          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px]">
            <ChatWorkspace run={activeRun} onSubmit={submitPrompt} />
            <EvidencePanel run={activeRun} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function RunSidebar({
  runs,
  activeRunId,
  onSelect,
  onCreate
}: {
  runs: ChatRun[];
  activeRunId: string;
  onSelect: (runId: string) => void;
  onCreate: () => void;
}) {
  const { open } = useSidebar();

  return (
    <Sidebar>
      <div className="flex h-full flex-col">
        <SidebarHeader>
          <div className={cn("flex min-w-0 flex-1 items-center gap-3", !open && "justify-center")}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white">
              <ShieldCheck className="h-4 w-4" />
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
          <Button type="button" className={cn("mb-3 w-full", !open && "px-0")} onClick={onCreate}>
            <MessageSquarePlus className="h-4 w-4" />
            {open ? "New run" : null}
          </Button>
          <div className="flex flex-col gap-2">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelect(run.id)}
                className={cn(
                  "group rounded-md border p-3 text-left transition-all hover:border-zinc-300 hover:bg-zinc-50",
                  activeRunId === run.id ? "border-zinc-300 bg-zinc-50 shadow-sm" : "border-transparent bg-white",
                  !open && "flex h-11 items-center justify-center p-0"
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
                  <Bot className="h-4 w-4 text-zinc-600" />
                )}
              </button>
            ))}
          </div>
        </SidebarContent>
        <SidebarFooter>
          {open ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
              Backend endpoint: <span className="font-mono text-zinc-900">/api/audits/report</span>
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
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Agent workflow active
        </div>
      ) : null}
    </header>
  );
}

function ChatWorkspace({
  run,
  onSubmit
}: {
  run: ChatRun;
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
    <section className="flex min-h-0 flex-col bg-zinc-50">
      <MessageScroller>
        {run.messages.map((message) => (
          <Message key={message.id} role={message.role}>
            <Bubble role={message.role}>{message.content}</Bubble>
            {message.attachments?.length ? (
              <div className="grid w-full gap-2">
                {message.attachments.map((attachment) => (
                  <Attachment key={attachment.id} name={attachment.name} size={attachment.size} />
                ))}
              </div>
            ) : null}
          </Message>
        ))}
        {run.status === "running" ? (
          <>
            <Marker>SEC lookup and document retrieval queued</Marker>
            <Marker>Vultr extraction and covenant math in progress</Marker>
            <Message role="assistant">
              <Bubble role="assistant" className="flex items-center gap-2 text-zinc-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calling tools and building the audit trail.
              </Bubble>
            </Message>
          </>
        ) : null}
      </MessageScroller>
      <form onSubmit={submit} className="border-t border-zinc-200 bg-white p-4">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
            <Input
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              placeholder="Ticker"
              aria-label="Ticker"
            />
            <Input
              value={creditAgreementUrl}
              onChange={(event) => setCreditAgreementUrl(event.target.value)}
              placeholder="Credit agreement URL, optional"
              aria-label="Credit agreement URL"
            />
          </div>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask the agent to analyze a borrower, filing, or debt report..."
            aria-label="Prompt"
          />
          {attachments.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {attachments.map((attachment) => (
                <Attachment
                  key={attachment.id}
                  name={attachment.name}
                  size={attachment.size}
                  onRemove={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" className="hidden" multiple onChange={(event) => handleFiles(event.target.files)} />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
                Attach report
              </Button>
              <span className="text-xs text-zinc-500">Files stay with the chat context for this run.</span>
            </div>
            <Button type="submit" disabled={run.status === "running" || !prompt.trim()}>
              {run.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Run agent
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

function EvidencePanel({ run }: { run: ChatRun }) {
  const audit = run.audit;

  return (
    <aside className="min-h-0 overflow-y-auto border-l border-zinc-200 bg-white">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">Agent trace</h2>
            <p className="mt-1 text-xs text-zinc-500">Data sources, calculations, tools, and recommended actions.</p>
          </div>
          {run.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : null}
        </div>
      </div>
      <div className="flex flex-col divide-y divide-zinc-200">
        {run.error ? <ErrorBlock error={run.error} /> : null}
        {audit ? (
          <>
            <SummaryBlock audit={audit} />
            <WorkflowBlock audit={audit} />
            <CalculationBlock audit={audit} />
            <MonitoringBlock audit={audit} />
            <ActionBlock audit={audit} />
            <ReportBlock markdown={run.markdown} />
          </>
        ) : (
          <EmptyTrace running={run.status === "running"} />
        )}
      </div>
    </aside>
  );
}

function EmptyTrace({ running }: { running: boolean }) {
  const items = [
    ["Resolve ticker", Search],
    ["Find covenant evidence", FileText],
    ["Run verification code", TerminalSquare],
    ["Produce memo", ShieldCheck]
  ] as const;

  return (
    <div className="p-5">
      <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4">
        <div className="text-sm font-medium text-zinc-900">{running ? "Workflow starting" : "No audit result yet"}</div>
        <div className="mt-3 grid gap-2">
          {items.map(([label, Icon]) => (
            <div key={label} className="flex items-center gap-2 text-sm text-zinc-600">
              <Icon className="h-4 w-4 text-zinc-400" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorBlock({ error }: { error: string }) {
  return (
    <section className="p-5">
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <div className="flex items-center gap-2 font-medium">
          <XCircle className="h-4 w-4" />
          Workflow failed
        </div>
        <p className="mt-2 leading-6">{error}</p>
      </div>
    </section>
  );
}

function SummaryBlock({ audit }: { audit: AuditRun }) {
  const primaryCalculation = audit.memo.calculations[0];

  return (
    <section className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Decision</div>
          <div className="mt-2 text-lg font-semibold text-zinc-950">{audit.memo.status.replace("_", " ")}</div>
        </div>
        <Badge className={memoStatusClasses(audit.memo.status)}>{audit.rulebook.borrower}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{audit.memo.summary}</p>
      {primaryCalculation ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Actual" value={`${formatRatio(primaryCalculation.actual)}x`} />
          <Metric label="Limit" value={`${formatRatio(primaryCalculation.threshold)}x`} />
          <Metric label="Headroom" value={`${formatRatio(primaryCalculation.threshold - primaryCalculation.actual)}x`} />
        </div>
      ) : null}
    </section>
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

function WorkflowBlock({ audit }: { audit: AuditRun }) {
  const toolCalls = audit.explainability.toolCalls;

  return (
    <section className="p-5">
      <SectionTitle icon={Activity} title="Tool calls" detail={`${toolCalls.length} calls`} />
      <div className="mt-4 space-y-3">
        {toolCalls.map((call) => (
          <div key={`${call.order}-${call.tool}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
              {call.order}
            </div>
            <div className="min-w-0 rounded-md border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-medium text-zinc-950">{call.tool}</div>
                <Badge>{call.purpose}</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{call.outputSummary}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CalculationBlock({ audit }: { audit: AuditRun }) {
  return (
    <section className="p-5">
      <SectionTitle icon={TerminalSquare} title="Calculations" detail={`${audit.explainability.calculationTrail.length} checks`} />
      <div className="mt-4 space-y-3">
        {audit.explainability.calculationTrail.map((calculation, index) => (
          <div key={`${calculation.formula}-${index}`} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <code className="text-xs text-zinc-700">{calculation.formula}</code>
              <Badge className={calculation.result === "pass" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>
                {calculation.result}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Metric label="Actual" value={`${formatRatio(calculation.actual)}x`} />
              <Metric label="Threshold" value={`${formatRatio(calculation.threshold)}x`} />
            </div>
            <div className="mt-3 space-y-1">
              {calculation.inputs.map((input) => (
                <div key={input.name} className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                  <span className="truncate">{input.name}</span>
                  <span className="font-mono text-zinc-800">{input.unit === "usd" ? `$${compactNumber(input.value)}` : formatRatio(input.value)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {audit.explainability.codeVerification.map((code, index) => (
          <div key={`${code.language}-${index}`} className="rounded-md border border-zinc-200 bg-zinc-950 p-3 text-xs text-zinc-100">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span>{code.language}</span>
              <span>exit {code.exitCode ?? "n/a"}</span>
            </div>
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap leading-5 text-zinc-300">{code.stdoutPreview}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}

function MonitoringBlock({ audit }: { audit: AuditRun }) {
  const monitoring = audit.creditMonitoring;
  if (!monitoring) return null;

  return (
    <section className="p-5">
      <SectionTitle icon={AlertTriangle} title="Monitoring" detail={monitoring.earlyWarning.level} />
      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-zinc-950">Early warning score</div>
          <div className="font-mono text-sm font-semibold text-zinc-950">{monitoring.earlyWarning.score}/100</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-zinc-200">
          <div className="h-2 rounded-full bg-zinc-950" style={{ width: `${Math.min(100, monitoring.earlyWarning.score)}%` }} />
        </div>
        <div className="mt-3 space-y-1">
          {monitoring.earlyWarning.drivers.map((driver) => (
            <div key={driver} className="text-xs leading-5 text-zinc-600">
              {driver}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {monitoring.scheduleRecommendations.map((schedule, index) => (
          <div key={`${schedule.kind}-${index}`} className="rounded-md border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-950">
              <CalendarClock className="h-4 w-4 text-zinc-500" />
              {schedule.kind}
            </div>
            <div className="mt-2 text-xs leading-5 text-zinc-500">
              Every {schedule.cadenceMinutes} minutes from {formatDate(schedule.runAt)}. {schedule.reason}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionBlock({ audit }: { audit: AuditRun }) {
  if (!audit.actionPlan) return null;

  return (
    <section className="p-5">
      <SectionTitle icon={CheckCircle2} title="Action plan" detail={audit.actionPlan.status} />
      <p className="mt-3 text-sm leading-6 text-zinc-600">{audit.actionPlan.creditOfficerSummary}</p>
      <div className="mt-4 space-y-2">
        {audit.actionPlan.borrowerQuestions.map((question, index) => (
          <div key={question} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm leading-5 text-zinc-700">
            {index + 1}. {question}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-zinc-200 bg-white p-3">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Draft email</div>
        <div className="mt-2 text-sm font-medium text-zinc-950">{audit.actionPlan.emailDraft.subject}</div>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{audit.actionPlan.emailDraft.body}</p>
      </div>
    </section>
  );
}

function ReportBlock({ markdown }: { markdown?: string }) {
  if (!markdown) return null;

  return (
    <section className="p-5">
      <SectionTitle icon={FileText} title="Final report" detail="markdown" />
      <pre className="mt-4 max-h-80 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
        {markdown}
      </pre>
    </section>
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
        <Icon className="h-4 w-4 text-zinc-500" />
        <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      </div>
      {detail ? <Badge>{detail}</Badge> : null}
    </div>
  );
}
