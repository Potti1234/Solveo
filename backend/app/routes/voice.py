from __future__ import annotations

import json
import os
import time

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.db import connect


router = APIRouter(prefix="/api/voice", tags=["voice"])


class TTSRequest(BaseModel):
    text: str


SUPPORTED_STT_TYPES = {
    "audio/wav": "wav",
    "audio/pcm": "pcm",
    "audio/ogg": "opus",
    "audio/opus": "opus",
}
STT_TYPE_ALIASES = {
    "audio/wave": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/vnd.wave": "audio/wav",
}
TTS_MEDIA_TYPES = {
    "wav": "audio/wav",
    "pcm": "audio/pcm",
    "opus": "audio/opus",
    "ulaw_8000": "audio/basic",
    "mulaw_8000": "audio/basic",
    "alaw_8000": "audio/basic",
    "pcm_8000": "audio/pcm",
    "pcm_16000": "audio/pcm",
    "pcm_22050": "audio/pcm",
    "pcm_24000": "audio/pcm",
    "pcm_44100": "audio/pcm",
    "pcm_48000": "audio/pcm",
}


@router.get("/config")
def voice_config() -> dict[str, bool]:
    return {"enabled": bool(os.getenv("GRADIUM_API_KEY"))}


@router.post("/stt")
async def transcribe_voicemail(file: UploadFile = File(...)) -> dict[str, str]:
    api_key = os.getenv("GRADIUM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gradium STT is disabled because GRADIUM_API_KEY is not set.")
    base_url = os.getenv("GRADIUM_BASE_URL", "https://api.gradium.ai/api").rstrip("/")
    audio = await file.read()
    content_type = _stt_content_type(file.content_type)
    try:
        response = httpx.post(
            f"{base_url}/post/speech/asr",
            headers={"x-api-key": api_key, "Content-Type": content_type},
            params={"model": os.getenv("GRADIUM_STT_MODEL", "default"), "input_format": SUPPORTED_STT_TYPES[content_type]},
            content=audio,
            timeout=60,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Gradium STT failed: {exc.response.text[:300]}") from exc
    transcript = _extract_transcript(response)
    message_id = f"msg_voice_{int(time.time())}"
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO inbox_messages
            (id, received_at, channel, sender, guest_name, room, subject, body, attachments_json, status)
            VALUES (?, datetime('now'), 'voicemail', 'unknown@voicemail.local', 'Voicemail Guest', NULL, ?, ?, '[]', 'new')
            """,
            (message_id, f"Voicemail: {file.filename}", transcript),
        )
        conn.commit()
    finally:
        conn.close()
    return {"message_id": message_id, "transcript": transcript}


@router.post("/tts")
def read_response_aloud(payload: TTSRequest) -> Response:
    api_key = os.getenv("GRADIUM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gradium TTS is disabled because GRADIUM_API_KEY is not set.")
    base_url = os.getenv("GRADIUM_BASE_URL", "https://api.gradium.ai/api").rstrip("/")
    output_format = os.getenv("GRADIUM_TTS_FORMAT", "wav")
    try:
        response = httpx.post(
            f"{base_url}/post/speech/tts",
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
            json={
                "text": payload.text,
                "voice_id": os.getenv("GRADIUM_TTS_VOICE_ID", "YTpq7expH9539ERJ"),
                "output_format": output_format,
                "only_audio": True,
            },
            timeout=60,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Gradium TTS failed: {exc.response.text[:300]}") from exc
    return Response(content=response.content, media_type=response.headers.get("content-type", TTS_MEDIA_TYPES.get(output_format, "audio/wav")))


def _stt_content_type(raw_content_type: str | None) -> str:
    content_type = (raw_content_type or "audio/wav").split(";")[0].strip().lower()
    content_type = STT_TYPE_ALIASES.get(content_type, content_type)
    if content_type not in SUPPORTED_STT_TYPES:
        raise HTTPException(status_code=415, detail="Gradium STT REST supports WAV, PCM, OGG, or OPUS audio.")
    return content_type


def _extract_transcript(response: httpx.Response) -> str:
    body = response.text.strip()
    if not body:
        return ""
    if "application/json" in response.headers.get("content-type", ""):
        data = response.json()
        if isinstance(data, dict):
            return str(data.get("text") or data.get("transcript") or "")
        if isinstance(data, str):
            return data

    final_text = ""
    parts: list[str] = []
    for line in body.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            parts.append(line.strip('"'))
            continue
        if isinstance(message, str):
            parts.append(message)
            continue
        if not isinstance(message, dict):
            continue
        if message.get("type") == "error":
            detail = message.get("error") or message.get("message") or "Gradium STT returned an error."
            raise HTTPException(status_code=502, detail=str(detail))
        text = message.get("text") or message.get("transcript") or message.get("message")
        if not text:
            continue
        if message.get("type") == "end_text":
            final_text = str(text)
        else:
            parts.append(str(text))
    return final_text or " ".join(parts).strip()
