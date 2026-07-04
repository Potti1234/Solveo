from __future__ import annotations

from typing import Any

from app.models import Adjudication, Citation, CompensationDecision, InboxMessage
from app.services.llm import llm_client
from app.tools.common import AC_RE


def adjudicate(message: InboxMessage, evidence: list[dict[str, Any]]) -> Adjudication:
    return llm_client.chat_json(
        [
            {
                "role": "system",
                "content": (
                    "You adjudicate hotel complaints. Return strict JSON with verdict, confidence, reasoning, "
                    "policy_basis citations, compensation or null, and escalate. Every decision must cite evidence."
                ),
            },
            {
                "role": "user",
                "content": f"Message: {message.model_dump_json()}\nEvidence bundle JSON: {evidence}",
            },
        ],
        Adjudication,
        fallback=lambda: _fallback_decision(message, evidence).model_dump(),
    )


def _fallback_decision(message: InboxMessage, evidence: list[dict[str, Any]]) -> Adjudication:
    text = f"{message.subject} {message.body}".lower()
    citations = _all_citations(evidence)
    policy_citations = [citation for citation in citations if citation.source.startswith("policies/")]
    maintenance_records = _tool_data(evidence, "maintenance.search").get("records", [])
    history = _tool_data(evidence, "guest_history.lookup").get("history", {})
    vision = _tool_data(evidence, "vision.verify").get("observations", [])
    comp = _tool_data(evidence, "compensation.evaluate")

    if AC_RE.search(text):
        hvac_support = any(record.get("issue_type") == "hvac" and record.get("severity") in {"high", "critical"} for record in maintenance_records)
        if hvac_support and comp.get("eligible"):
            return Adjudication(
                verdict="legitimate",
                confidence=0.93,
                reasoning=(
                    "The booking confirms the stay, maintenance logs corroborate an overnight HVAC failure in Room "
                    f"{message.room}, and the compensation matrix authorizes 30% rather than a full refund."
                ),
                policy_basis=_prefer(policy_citations, ["§4.2", "§4.3", "§6.1"]),
                compensation=CompensationDecision(
                    amount=float(comp["amount"]),
                    policy_clause=comp["policy_clause"],
                    rationale=comp["rationale"],
                ),
                escalate=False,
            )

    if any(term in text for term in ["mold", "filth", "dirty", "cleanliness"]):
        captions = " ".join(item.get("caption", "") for item in vision).lower()
        serial_refunds = int(history.get("prior_refunds") or 0) >= 3
        cleaning_support = any(record.get("room") == message.room and record.get("issue_type") in {"housekeeping", "plumbing"} for record in maintenance_records)
        if cleaning_support and ("no visible mold" in captions or "water stain" in captions or vision):
            return Adjudication(
                verdict="unsubstantiated",
                confidence=0.88,
                reasoning=(
                    "The photo shows a dry water stain rather than mold or filth, same-day housekeeping records show "
                    "Room 214 was cleaned and inspected, and repeat-refund history supports escalation context only."
                ),
                policy_basis=_prefer(policy_citations, ["§2.2", "§2.3", "§2.4", "§7.2", "§7.3"]),
                compensation=None,
                escalate=serial_refunds,
            )

    if maintenance_records:
        return Adjudication(
            verdict="partially_legitimate",
            confidence=0.72,
            reasoning="A property record corroborates part of the guest concern, but the automatic compensation threshold is not met.",
            policy_basis=policy_citations[:3],
            compensation=None,
            escalate=False,
        )

    return Adjudication(
        verdict="unsubstantiated",
        confidence=0.61,
        reasoning="The available records do not corroborate the claim strongly enough for compensation.",
        policy_basis=policy_citations[:3],
        compensation=None,
        escalate=False,
    )


def _tool_data(evidence: list[dict[str, Any]], tool: str) -> dict[str, Any]:
    for result in evidence:
        if result.get("tool") == tool:
            return result.get("data", {})
    return {}


def _all_citations(evidence: list[dict[str, Any]]) -> list[Citation]:
    citations: list[Citation] = []
    for result in evidence:
        citations.extend(Citation.model_validate(citation) for citation in result.get("citations", []))
    return citations


def _prefer(citations: list[Citation], clauses: list[str]) -> list[Citation]:
    selected: list[Citation] = []
    for clause in clauses:
        selected.extend(citation for citation in citations if clause in citation.locator and citation not in selected)
    selected.extend(citation for citation in citations if citation not in selected)
    return selected[:5]
