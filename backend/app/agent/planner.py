from __future__ import annotations

from app.models import InboxMessage, InvestigationPlan, PlanStep
from app.services.llm import llm_client
from app.tools.common import AC_RE


def plan_investigation(message: InboxMessage) -> InvestigationPlan:
    return llm_client.chat_json(
        [
            {
                "role": "system",
                "content": (
                    "You are a hotel complaint investigator. Return strict JSON with a steps array. "
                    "Each step has id, tool, reason, and input. Allowed tools: bookings.lookup, "
                    "maintenance.search, policy.search, guest_history.lookup, vision.verify, compensation.evaluate."
                ),
            },
            {
                "role": "user",
                "content": message.model_dump_json(),
            },
        ],
        InvestigationPlan,
        fallback=lambda: _fallback_plan(message).model_dump(),
    )


def _fallback_plan(message: InboxMessage) -> InvestigationPlan:
    text = f"{message.subject} {message.body}".lower()
    policy_query = (
        "overnight AC broken full refund compensation essential comfort failure §4.2"
        if AC_RE.search(text)
        else "photo evidence cleanliness mold same-day cleaning serial refund escalation"
    )
    steps = [
        PlanStep(id="plan-1", tool="bookings.lookup", reason="Confirm the active booking and stay value.", input={}),
        PlanStep(id="plan-2", tool="maintenance.search", reason="Retrieve room, issue, and location logs.", input={}),
        PlanStep(id="plan-3", tool="policy.search", reason="Find compensation and evidence policy clauses.", input={"query": policy_query, "top_k": 4}),
        PlanStep(id="plan-4", tool="guest_history.lookup", reason="Check prior refund context without using it as sole evidence.", input={}),
    ]
    if message.attachments:
        steps.append(PlanStep(id="plan-5", tool="vision.verify", reason="Verify attached photo evidence.", input={}))
    steps.append(PlanStep(id="plan-6", tool="compensation.evaluate", reason="Calculate policy-bound compensation if eligible.", input={}))
    return InvestigationPlan(steps=steps[:8])
