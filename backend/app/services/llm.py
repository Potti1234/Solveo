from __future__ import annotations

import json
import os
from typing import Any, Callable, TypeVar

import httpx
from pydantic import BaseModel, ValidationError


T = TypeVar("T", bound=BaseModel)


class LLMClient:
    """Single OpenAI-compatible client for Vultr chat and VultronRetriever rerank."""

    def __init__(self) -> None:
        self.api_key = os.getenv("VULTR_API_KEY", "")
        self.base_url = os.getenv("VULTR_BASE_URL", "https://api.vultrinference.com/v1").rstrip("/")
        self.chat_model = os.getenv("VULTR_CHAT_MODEL", "llama-3.1-70b-instruct")
        self.retriever_model = os.getenv("VULTR_RETRIEVER_MODEL", "vultr/VultronRetrieverFlash-Qwen3.5-0.8B")
        self.timeout = float(os.getenv("VULTR_TIMEOUT_SECONDS", "30"))
        self.demo_mode = os.getenv("VULTR_DEMO_MODE", "").lower() in {"1", "true", "yes"}

    @property
    def live(self) -> bool:
        return bool(self.api_key) and not self.demo_mode

    def chat_json(
        self,
        messages: list[dict[str, str]],
        response_model: type[T],
        fallback: Callable[[], dict[str, Any]] | None = None,
    ) -> T:
        if not self.live:
            if fallback is None:
                raise RuntimeError("Vultr API key is not configured and no deterministic fallback was provided.")
            return response_model.model_validate(fallback())

        retry_messages = list(messages)
        last_error = ""
        for attempt in range(2):
            payload = {
                "model": self.chat_model,
                "messages": retry_messages,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            }
            headers = {"Authorization": f"Bearer {self.api_key}"}
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            try:
                parsed = json.loads(content)
                return response_model.model_validate(parsed)
            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = str(exc)
                retry_messages = [
                    *messages,
                    {
                        "role": "user",
                        "content": (
                            "Your previous response did not validate as strict JSON for the requested schema. "
                            f"Validation error: {last_error}. Return only corrected JSON."
                        ),
                    },
                ]
                if attempt == 1:
                    raise
        raise RuntimeError(last_error)

    def rerank_texts(self, query: str, documents: list[str], top_n: int) -> list[dict[str, Any]]:
        if not self.live:
            return []
        payload = {
            "model": self.retriever_model,
            "query": query,
            "documents": documents,
            "top_n": top_n,
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}
        response = httpx.post(
            f"{self.base_url}/rerank",
            headers=headers,
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return list(response.json().get("results", []))


llm_client = LLMClient()
