"""Anthropic Claude integration (PRD §11, §12).

Two responsibilities, both real:
  (a) Structured label/packaging VISION analysis for DrugScan layer 4 — returns
      structured JSON (print quality, registration, micro-text, packaging
      consistency). This is one signal among many; it does NOT decide the
      authenticity verdict (that is the fusion layer's job).
  (b) AppointmentPrep brief generation from the user's real, pre-composed data.

Claude is NEVER used to compute interaction risk, identify the pill, or make the
authenticity verdict (PRD §11). Requires ANTHROPIC_API_KEY; absent → the calling
layer reports an explicit "unavailable" state.

Per PRD §12 the brief/vision model is Claude Sonnet 4; we use the latest Sonnet
(`claude-sonnet-4-6`, vision-capable, adaptive thinking) and allow override via
ANTHROPIC_MODEL. The Anthropic SDK is a lightweight dep and imported at module
top-level (it is in the boot requirements).
"""

from __future__ import annotations

import base64
import json
from typing import Any

from app.config import get_settings

try:  # SDK is a lightweight boot dep, but guard anyway so /health is honest.
    import anthropic

    _ANTHROPIC_IMPORT_ERROR: str | None = None
except Exception as exc:  # pragma: no cover - only if dep missing
    anthropic = None  # type: ignore[assignment]
    _ANTHROPIC_IMPORT_ERROR = str(exc)


VISION_SYSTEM = (
    "You are a forensic packaging-and-label inspector for a pharmacy safety tool. "
    "You analyze a photo of a medication bottle, blister pack, or loose pill and "
    "report ONLY observable physical/printing anomalies. You do NOT identify the "
    "drug, do NOT judge authenticity, and do NOT give medical advice. You report "
    "structured observations that a separate verification engine will weigh. "
    "Be conservative: when an attribute is not visible or you are unsure, say so."
)

VISION_INSTRUCTIONS = (
    "Inspect the image and return your findings. Rate each dimension and explain "
    "what you actually see. If the image is too blurry or partial to judge a "
    "dimension, set that dimension's quality to \"insufficient\"."
)

# JSON schema constraining Claude's vision output (structured outputs).
VISION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "print_quality": {
            "type": "string",
            "enum": ["clean", "minor_defects", "poor", "insufficient"],
        },
        "registration": {
            "type": "string",
            "enum": ["aligned", "slight_misalignment", "misaligned", "insufficient"],
        },
        "micro_text": {
            "type": "string",
            "enum": ["legible", "partially_legible", "illegible", "absent", "insufficient"],
        },
        "packaging_consistency": {
            "type": "string",
            "enum": ["consistent", "minor_inconsistency", "inconsistent", "insufficient"],
        },
        "anomalies": {
            "type": "array",
            "items": {"type": "string"},
        },
        "observations": {"type": "string"},
        "image_quality": {
            "type": "string",
            "enum": ["good", "fair", "poor"],
        },
    },
    "required": [
        "print_quality",
        "registration",
        "micro_text",
        "packaging_consistency",
        "anomalies",
        "observations",
        "image_quality",
    ],
}

BRIEF_SYSTEM = (
    "You are a clinical documentation assistant generating a one-page, "
    "patient-generated appointment brief for the patient to bring to a provider. "
    "CRITICAL RULES: Use ONLY the structured data provided. Invent nothing. Do "
    "not add medications, diagnoses, dosages, or facts not present in the input. "
    "Do not give medical advice or recommend treatment changes. Frame everything "
    "as patient-reported decision-support for discussion with the provider. "
    "Output clean, printable Markdown with these sections in order: "
    "1) Current Medications, 2) Adherence Summary, 3) Side Effects, "
    "4) Concerns to Discuss, 5) Questions to Ask. End with the line: "
    "'This brief is patient-generated decision-support. Confirm everything with "
    "your pharmacist or prescriber.'"
)


def is_available() -> bool:
    return anthropic is not None and get_settings().anthropic_configured


def availability_reason() -> str | None:
    if anthropic is None:
        return f"anthropic SDK not importable: {_ANTHROPIC_IMPORT_ERROR}"
    if not get_settings().anthropic_configured:
        return "ANTHROPIC_API_KEY not configured"
    return None


def _client():  # -> anthropic.AsyncAnthropic
    settings = get_settings()
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


def _media_type(image_bytes: bytes) -> str:
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    if image_bytes[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


async def analyze_packaging(image_bytes: bytes) -> dict[str, Any]:
    """DrugScan layer 4: structured physical-anomaly analysis of a scan image.

    Returns {"available": True, "analysis": {...}} on success or
    {"available": False, "reason": "..."} when Claude is not configured.
    """
    reason = availability_reason()
    if reason is not None:
        return {"available": False, "reason": reason}

    settings = get_settings()
    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    client = _client()
    try:
        resp = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            system=VISION_SYSTEM,
            output_config={"format": {"type": "json_schema", "schema": VISION_SCHEMA}},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": _media_type(image_bytes),
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": VISION_INSTRUCTIONS},
                    ],
                }
            ],
        )
    except Exception as exc:  # network/auth/etc — honest failure
        return {"available": False, "reason": f"claude vision call failed: {exc}"}

    text = _first_text(resp)
    try:
        analysis = json.loads(text) if text else {}
    except json.JSONDecodeError:
        analysis = {"observations": text, "image_quality": "poor"}
    return {"available": True, "analysis": analysis, "model": settings.anthropic_model}


async def generate_brief(brief_input: dict[str, Any]) -> dict[str, Any]:
    """AppointmentPrep: compose a one-page brief from the user's REAL data.

    `brief_input` is the structured payload the brief route assembles (meds,
    adherence, side effects, interactions, pgx, refills, provider type).
    Returns {"available": True, "markdown": "..."} or an unavailable state.
    """
    reason = availability_reason()
    if reason is not None:
        return {"available": False, "reason": reason}

    settings = get_settings()
    payload = json.dumps(brief_input, indent=2, default=str)
    client = _client()
    user_text = (
        "Generate the appointment brief from this structured patient data. "
        "Use only what is present here.\n\n```json\n" + payload + "\n```"
    )
    try:
        resp = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=4096,
            system=BRIEF_SYSTEM,
            messages=[{"role": "user", "content": user_text}],
        )
    except Exception as exc:
        return {"available": False, "reason": f"claude brief call failed: {exc}"}

    markdown = _first_text(resp)
    return {"available": True, "markdown": markdown, "model": settings.anthropic_model}


def _first_text(resp: Any) -> str:
    parts: list[str] = []
    for block in getattr(resp, "content", []) or []:
        if getattr(block, "type", None) == "text":
            parts.append(getattr(block, "text", ""))
    return "".join(parts).strip()
