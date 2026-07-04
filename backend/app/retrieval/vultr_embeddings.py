from __future__ import annotations

import math
from pathlib import Path

from app.retrieval.base import RetrievalHit
from app.retrieval.fallback import FallbackRetriever
from app.services.llm import llm_client


class VultrEmbeddingsRetriever:
    def __init__(self, seed_dir: Path) -> None:
        self.fallback = FallbackRetriever(seed_dir)
        self.chunks = self.fallback.chunks
        self._chunk_embeddings: list[list[float]] | None = None

    def search(self, query: str, top_k: int = 4) -> list[RetrievalHit]:
        if not llm_client.live:
            return self.fallback.search(query, top_k)
        try:
            if self._chunk_embeddings is None:
                self._chunk_embeddings = llm_client.embeddings([chunk.text for chunk in self.chunks])
            query_embedding = llm_client.embeddings([query])[0]
            hits = [
                RetrievalHit(chunk=chunk, score=_cosine(query_embedding, embedding))
                for chunk, embedding in zip(self.chunks, self._chunk_embeddings)
            ]
            return sorted(hits, key=lambda hit: hit.score, reverse=True)[:top_k]
        except Exception:
            return self.fallback.search(query, top_k)


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a)) or 1.0
    norm_b = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (norm_a * norm_b)
