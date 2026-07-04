export type Citation = {
  source: string;
  locator: string;
  quote: string;
};

export type Attachment = {
  filename: string;
  path: string;
  kind: string;
};

export type InboxMessage = {
  id: string;
  received_at: string;
  channel: string;
  sender: string;
  guest_name: string;
  room: string | null;
  subject: string;
  body: string;
  attachments: Attachment[];
  status?: string;
};

export type PlanStep = {
  id: string;
  tool: ToolName;
  reason: string;
  input: Record<string, unknown>;
};

export type InvestigationPlan = {
  steps: PlanStep[];
};

export type ToolResult = {
  tool: ToolName;
  data: Record<string, unknown>;
  citations: Citation[];
};

export type CompensationDecision = {
  amount: number;
  policy_clause: string;
  rationale: string;
};

export type Adjudication = {
  verdict: "legitimate" | "partially_legitimate" | "unsubstantiated";
  confidence: number;
  reasoning: string;
  policy_basis: Citation[];
  compensation: CompensationDecision | null;
  escalate: boolean;
};

export type AgentEvent = {
  event_type: string;
  title: string;
  payload?: Record<string, unknown>;
};

export type ActionResult = {
  response_draft: string;
  actions_taken: string[];
  citations: Citation[];
};

export type ToolPayload = {
  message: InboxMessage;
  evidence: ToolResult[];
  [key: string]: unknown;
};

export type ToolName =
  | "bookings.lookup"
  | "maintenance.search"
  | "policy.search"
  | "guest_history.lookup"
  | "vision.verify"
  | "compensation.evaluate";
