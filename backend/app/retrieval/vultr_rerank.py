from __future__ import annotations

from pathlib import Path

from app.retrieval.base import RetrievalHit
from app.retrieval.fallback import FallbackRetriever
from app.services.llm import llm_client


class VultrRerankRetriever:
    def __init__(self, seed_dir: Path) -> None:
        self.fallback = FallbackRetriever(seed_dir)
        self.chunks = self.fallback.chunks

    def search(self, query: str, top_k: int = 4) -> list[RetrievalHit]:
        if not llm_client.live:
            return self.fallback.search(query, top_k)
        try:
            results = llm_client.rerank_texts(query, [chunk.text for chunk in self.chunks], top_k)
            hits: list[RetrievalHit] = []
            for result in results:
                index = int(result["index"])
                if 0 <= index < len(self.chunks):
                    hits.append(RetrievalHit(chunk=self.chunks[index], score=float(result["relevance_score"])))
            return hits[:top_k]
        except Exception:
            return self.fallback.search(query, top_k)
