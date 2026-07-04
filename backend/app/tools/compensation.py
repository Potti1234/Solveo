from __future__ import annotations

from typing import Any

from app.models import Citation, ToolResult


def evaluate(payload: dict[str, Any]) -> ToolResult:
    evidence = payload.get("evidence", [])
    booking = _latest_booking(evidence)
    maintenance_records = _records_for_tool(evidence, "maintenance.search")
    policy_citations = _policy_citations(evidence)
    has_overnight_hvac = any(
        record.get("issue_type") == "hvac"
        and record.get("severity") in {"high", "critical"}
        and ("overnight" in record.get("summary", "").lower() or record.get("status") == "open")
        for record in maintenance_records
    )
    if booking and has_overnight_hvac:
        amount = round(float(booking.get("total_amount", 0)) * 0.30, 2)
        clause = next((c for c in policy_citations if "§4.2" in c.locator), None)
        citations = [clause] if clause else []
        return ToolResult(
            tool="compensation.evaluate",
            data={
                "eligible": True,
                "amount": amount,
                "policy_clause": "§4.2",
                "rationale": "Corroborated overnight HVAC failure qualifies for 30% of affected stay value.",
            },
            citations=[c for c in citations if c],
        )
    return ToolResult(
        tool="compensation.evaluate",
        data={"eligible": False, "amount": 0, "policy_clause": None, "rationale": "No automatic compensation threshold met."},
        citations=[],
    )


def _latest_booking(evidence: list[dict[str, Any]]) -> dict[str, Any]:
    for result in evidence:
        if result.get("tool") == "bookings.lookup":
            return result.get("data", {}).get("booking") or {}
    return {}


def _records_for_tool(evidence: list[dict[str, Any]], tool_name: str) -> list[dict[str, Any]]:
    for result in evidence:
        if result.get("tool") == tool_name:
            return result.get("data", {}).get("records", [])
    return []


def _policy_citations(evidence: list[dict[str, Any]]) -> list[Citation]:
    citations: list[Citation] = []
    for result in evidence:
        if result.get("tool") == "policy.search":
            citations.extend(Citation.model_validate(citation) for citation in result.get("citations", []))
    return citations
