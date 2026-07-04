from __future__ import annotations

import math
import re
from collections import Counter
from pathlib import Path

from app.retrieval.base import DocumentChunk, RetrievalHit


TOKEN_RE = re.compile(r"[a-zA-Z0-9§.]+")
CLAUSE_RE = re.compile(r"^## Clause (?P<clause>§[0-9.]+) - (?P<title>.+)$", re.MULTILINE)


class FallbackRetriever:
    def __init__(self, seed_dir: Path) -> None:
        self.chunks = _load_policy_chunks(seed_dir / "policies")
        self.doc_freq = Counter()
        self.term_freqs: list[Counter[str]] = []
        for chunk in self.chunks:
            tf = Counter(_tokens(chunk.text))
            self.term_freqs.append(tf)
            self.doc_freq.update(tf.keys())

    def search(self, query: str, top_k: int = 4) -> list[RetrievalHit]:
        query_terms = Counter(_tokens(query))
        if not query_terms:
            return []
        hits: list[RetrievalHit] = []
        total_docs = max(len(self.chunks), 1)
        for chunk, tf in zip(self.chunks, self.term_freqs):
            score = 0.0
            for term, q_count in query_terms.items():
                if term not in tf:
                    continue
                idf = math.log((1 + total_docs) / (1 + self.doc_freq[term])) + 1
                score += q_count * tf[term] * idf
            if score:
                hits.append(RetrievalHit(chunk=chunk, score=score))
        return sorted(hits, key=lambda hit: hit.score, reverse=True)[:top_k]


def _load_policy_chunks(policy_dir: Path) -> list[DocumentChunk]:
    chunks: list[DocumentChunk] = []
    for path in sorted(policy_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        matches = list(CLAUSE_RE.finditer(text))
        for index, match in enumerate(matches):
            start = match.start()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            body = text[start:end].strip()
            clause = match.group("clause")
            title = match.group("title")
            chunks.append(
                DocumentChunk(
                    source=f"policies/{path.name}",
                    locator=f"{clause} {title}",
                    text=body,
                )
            )
    return chunks


def _tokens(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text)]
