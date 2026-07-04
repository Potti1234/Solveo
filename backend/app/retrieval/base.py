from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.models import Citation


@dataclass(frozen=True)
class DocumentChunk:
    source: str
    locator: str
    text: str


@dataclass(frozen=True)
class RetrievalHit:
    chunk: DocumentChunk
    score: float

    def citation(self) -> Citation:
        return Citation(source=self.chunk.source, locator=self.chunk.locator, quote=self.chunk.text[:360])


class Retriever(Protocol):
    def search(self, query: str, top_k: int = 4) -> list[RetrievalHit]:
        ...
