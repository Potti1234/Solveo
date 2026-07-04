from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class Citation(BaseModel):
    source: str
    locator: str
    quote: str


class Attachment(BaseModel):
    filename: str
    path: str
    kind: str = "image"


class InboxMessage(BaseModel):
    id: str
    received_at: str
    channel: str
    sender: str
    guest_name: str
    room: str | None = None
    subject: str
    body: str
    attachments: list[Attachment] = Field(default_factory=list)


class PlanStep(BaseModel):
    id: str
    tool: str
    reason: str
    input: dict[str, Any] = Field(default_factory=dict)


class InvestigationPlan(BaseModel):
    steps: list[PlanStep]


class ToolResult(BaseModel):
    tool: str
    data: dict[str, Any]
    citations: list[Citation] = Field(default_factory=list)


class CompensationDecision(BaseModel):
    amount: float
    policy_clause: str
    rationale: str


class Adjudication(BaseModel):
    verdict: Literal["legitimate", "partially_legitimate", "unsubstantiated"]
    confidence: float = Field(ge=0, le=1)
    reasoning: str
    policy_basis: list[Citation] = Field(default_factory=list)
    compensation: CompensationDecision | None = None
    escalate: bool


class IntentResult(BaseModel):
    intent: Literal[
        "complaint",
        "missing_details",
        "normal_statement",
        "question",
        "small_talk",
        "handoff_request",
    ]
    confidence: float = Field(ge=0, le=1)
    should_run_case: bool
    reply: str | None = None
    reason: str = ""


class AgentEvent(BaseModel):
    event_type: str
    title: str
    payload: dict[str, Any] = Field(default_factory=dict)


class ActionResult(BaseModel):
    response_draft: str
    actions_taken: list[str]
    citations: list[Citation] = Field(default_factory=list)
