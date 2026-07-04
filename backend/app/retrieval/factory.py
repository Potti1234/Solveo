from __future__ import annotations

import os

from app.db import SEED_DIR
from app.retrieval.fallback import FallbackRetriever
from app.retrieval.vultr_embeddings import VultrEmbeddingsRetriever


_retriever = None


def get_retriever():
    global _retriever
    if _retriever is not None:
        return _retriever
    mode = os.getenv("RETRIEVER_MODE", "vultr").lower()
    if mode == "fallback":
        _retriever = FallbackRetriever(SEED_DIR)
    else:
        _retriever = VultrEmbeddingsRetriever(SEED_DIR)
    return _retriever
