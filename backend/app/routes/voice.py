from __future__ import annotations

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


@router.get("/config")
def voice_config() -> dict[str, bool]:
    return {"enabled": bool(os.getenv("GRADIUM_API_KEY"))}


@router.post("/stt")
async def transcribe_voicemail(file: UploadFile = File(...)) -> dict[str, str]:
    api_key = os.getenv("GRADIUM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gradium STT is disabled because GRADIUM_API_KEY is not set.")
    base_url = os.getenv("GRADIUM_BASE_URL", "https://api.gradium.ai/v1").rstrip("/")
    audio = await file.read()
    response = httpx.post(
        f"{base_url}/audio/transcriptions",
        headers={"Authorization": f"Bearer {api_key}"},
        files={"file": (file.filename, audio, file.content_type or "audio/mpeg")},
        data={"model": os.getenv("GRADIUM_STT_MODEL", "gradium-stt")},
        timeout=60,
    )
    response.raise_for_status()
    transcript = response.json().get("text", "")
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
    base_url = os.getenv("GRADIUM_BASE_URL", "https://api.gradium.ai/v1").rstrip("/")
    response = httpx.post(
        f"{base_url}/audio/speech",
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": os.getenv("GRADIUM_TTS_MODEL", "gradium-tts"), "voice": "concierge", "input": payload.text},
        timeout=60,
    )
    response.raise_for_status()
    return Response(content=response.content, media_type=response.headers.get("content-type", "audio/mpeg"))
