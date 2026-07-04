from __future__ import annotations

from typing import Any

from app.models import ToolResult
from app.retrieval import get_retriever


def search(payload: dict[str, Any]) -> ToolResult:
    query = payload.get("query")
    if not query:
        message = payload["message"]
        query = f"{message.get('subject', '')} {message.get('body', '')}"
    hits = get_retriever().search(query, top_k=int(payload.get("top_k", 4)))
    return ToolResult(
        tool="policy.search",
        data={"query": query, "snippets": [{"source": h.chunk.source, "locator": h.chunk.locator, "text": h.chunk.text, "score": h.score} for h in hits]},
        citations=[hit.citation() for hit in hits],
    )
