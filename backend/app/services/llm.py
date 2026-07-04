from __future__ import annotations

import json
import os
from typing import Any, Callable, TypeVar

import httpx
from pydantic import BaseModel, ValidationError


T = TypeVar("T", bound=BaseModel)


class LLMClient:
    """Single OpenAI-compatible client for Vultr chat and embeddings."""

    def __init__(self) -> None:
        self.api_key = os.getenv("VULTR_API_KEY", "")
        self.base_url = os.getenv("VULTR_BASE_URL", "https://api.vultrinference.com/v1").rstrip("/")
        self.chat_model = os.getenv("VULTR_CHAT_MODEL", "llama-3.1-70b-instruct")
        self.embed_model = os.getenv("VULTR_EMBED_MODEL", "vultr-embed")
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

    def embeddings(self, texts: list[str]) -> list[list[float]]:
        if not self.live:
            return [_hash_embedding(text) for text in texts]
        payload = {"model": self.embed_model, "input": texts}
        headers = {"Authorization": f"Bearer {self.api_key}"}
        response = httpx.post(
            f"{self.base_url}/embeddings",
            headers=headers,
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return [item["embedding"] for item in response.json()["data"]]


def _hash_embedding(text: str, dims: int = 64) -> list[float]:
    values = [0.0] * dims
    for idx, char in enumerate(text.lower()):
        values[(ord(char) + idx) % dims] += 1.0
    norm = sum(v * v for v in values) ** 0.5 or 1.0
    return [v / norm for v in values]


llm_client = LLMClient()
