from __future__ import annotations

import asyncio

from app.routes import voice
from app.services.llm import LLMClient


class FakeResponse:
    def __init__(self, data=None, text: str = "", content: bytes = b"", content_type: str = "application/json") -> None:
        self._data = data or {}
        self.text = text
        self.content = content
        self.headers = {"content-type": content_type}

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self._data


def test_vultr_rerank_uses_vultronretriever_endpoint(monkeypatch):
    calls = {}

    def fake_post(url, headers, json, timeout):
        calls.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeResponse(
            {
                "results": [
                    {"index": 1, "relevance_score": 4.2, "document": {"text": "policy b"}},
                    {"index": 0, "relevance_score": 3.1, "document": {"text": "policy a"}},
                ]
            }
        )

    monkeypatch.setenv("VULTR_API_KEY", "test-key")
    monkeypatch.setenv("VULTR_BASE_URL", "https://api.vultrinference.com/v1")
    monkeypatch.setenv("VULTR_RETRIEVER_MODEL", "vultr/VultronRetrieverFlash-Qwen3.5-0.8B")
    monkeypatch.delenv("VULTR_DEMO_MODE", raising=False)
    monkeypatch.setattr("app.services.llm.httpx.post", fake_post)

    results = LLMClient().rerank_texts("refund policy", ["policy a", "policy b"], 2)

    assert calls["url"] == "https://api.vultrinference.com/v1/rerank"
    assert calls["headers"] == {"Authorization": "Bearer test-key"}
    assert calls["json"] == {
        "model": "vultr/VultronRetrieverFlash-Qwen3.5-0.8B",
        "query": "refund policy",
        "documents": ["policy a", "policy b"],
        "top_n": 2,
    }
    assert results[0]["index"] == 1


def test_gradium_stt_uses_documented_rest_endpoint(monkeypatch):
    calls = {}

    class FakeUpload:
        filename = "voicemail.wav"
        content_type = "audio/wav"

        async def read(self):
            return b"RIFF"

    class FakeConnection:
        def execute(self, *args):
            calls["insert"] = args

        def commit(self):
            calls["committed"] = True

        def close(self):
            calls["closed"] = True

    def fake_post(url, headers, params, content, timeout):
        calls.update({"url": url, "headers": headers, "params": params, "content": content, "timeout": timeout})
        return FakeResponse(
            text='{"type":"text","text":"hello"}\n{"type":"end_text","text":"hello world"}',
            content_type="application/x-ndjson",
        )

    monkeypatch.setenv("GRADIUM_API_KEY", "test-key")
    monkeypatch.setenv("GRADIUM_BASE_URL", "https://api.gradium.ai/api")
    monkeypatch.delenv("GRADIUM_STT_MODEL", raising=False)
    monkeypatch.setattr(voice.httpx, "post", fake_post)
    monkeypatch.setattr(voice, "connect", lambda: FakeConnection())

    result = asyncio.run(voice.transcribe_voicemail(FakeUpload()))

    assert calls["url"] == "https://api.gradium.ai/api/post/speech/asr"
    assert calls["headers"] == {"x-api-key": "test-key", "Content-Type": "audio/wav"}
    assert calls["params"] == {"model": "default", "input_format": "wav"}
    assert calls["content"] == b"RIFF"
    assert result["transcript"] == "hello world"


def test_gradium_tts_uses_documented_rest_endpoint(monkeypatch):
    calls = {}

    def fake_post(url, headers, json, timeout):
        calls.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeResponse(content=b"WAVE", content_type="audio/wav")

    monkeypatch.setenv("GRADIUM_API_KEY", "test-key")
    monkeypatch.setenv("GRADIUM_BASE_URL", "https://api.gradium.ai/api")
    monkeypatch.setenv("GRADIUM_TTS_VOICE_ID", "voice-123")
    monkeypatch.delenv("GRADIUM_TTS_FORMAT", raising=False)
    monkeypatch.setattr(voice.httpx, "post", fake_post)

    response = voice.read_response_aloud(voice.TTSRequest(text="Hello"))

    assert calls["url"] == "https://api.gradium.ai/api/post/speech/tts"
    assert calls["headers"] == {"x-api-key": "test-key", "Content-Type": "application/json"}
    assert calls["json"] == {
        "text": "Hello",
        "voice_id": "voice-123",
        "output_format": "wav",
        "only_audio": True,
    }
    assert response.body == b"WAVE"
