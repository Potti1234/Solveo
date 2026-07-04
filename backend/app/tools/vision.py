from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.db import SEED_DIR
from app.models import Citation, ToolResult
from app.services.llm import llm_client


class VisionResponse(BaseModel):
    caption: str
    risk_flags: list[str]


def verify(payload: dict[str, Any]) -> ToolResult:
    attachments = payload["message"].get("attachments", [])
    observations: list[dict[str, Any]] = []
    citations: list[Citation] = []
    for attachment in attachments:
        if attachment.get("kind") != "image":
            continue
        image_path = _resolve_attachment(attachment["path"])
        caption_path = image_path.with_suffix(image_path.suffix + ".caption.txt")
        if llm_client.live and image_path.exists():
            mode = "vultr-vision"
            observation = _call_vision_model(image_path, attachment["filename"])
        else:
            mode = "caption-stub"
            caption = caption_path.read_text(encoding="utf-8") if caption_path.exists() else "No caption sidecar found."
            observation = VisionResponse(caption=caption, risk_flags=_risk_flags(caption))
        observations.append({"filename": attachment["filename"], "mode": mode, **observation.model_dump()})
        citations.append(
            Citation(
                source=str(caption_path.relative_to(SEED_DIR.parent)) if caption_path.exists() else attachment["path"],
                locator="vision sidecar" if mode == "caption-stub" else "vision model output",
                quote=observation.caption,
            )
        )
    return ToolResult(tool="vision.verify", data={"observations": observations}, citations=citations)


def _resolve_attachment(path: str) -> Path:
    raw = Path(path)
    if raw.is_absolute():
        return raw
    return SEED_DIR.parent / raw


def _risk_flags(caption: str) -> list[str]:
    lowered = caption.lower()
    flags: list[str] = []
    for word in ["mold", "filth", "active leak", "standing water", "pest"]:
        if word in lowered:
            flags.append(word)
    return flags


def _call_vision_model(image_path: Path, filename: str) -> VisionResponse:
    image_b64 = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return llm_client.chat_json(
        [
            {
                "role": "system",
                "content": "Inspect hotel complaint photos. Return JSON with caption and risk_flags.",
            },
            {
                "role": "user",
                "content": (
                    f"Image filename: {filename}. Base64 PNG follows. Describe only visible conditions and list "
                    f"specific risk flags. image_base64={image_b64[:12000]}"
                ),
            },
        ],
        VisionResponse,
        fallback=lambda: {"caption": "Vision unavailable.", "risk_flags": []},
    )
