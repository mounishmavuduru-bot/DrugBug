"""Counterfeit verification layer 1: GS1 2D DataMatrix decode (PRD §10.1).

Decodes the GS1 2D DataMatrix on the package server-side → GTIN/NDC, serial,
lot, expiry, and validates the GS1 Application Identifier (AI) structure.

pylibdmtx (DataMatrix) / pyzbar (zxing-equivalent) are heavy/native deps imported
lazily and guarded. Absent → the layer reports "unavailable" — never a fabricated
decode. GS1 AI parsing itself is pure-stdlib and always available.
"""

from __future__ import annotations

import re
from typing import Any

# GS1 Application Identifiers we care about for pharma serialization.
# (01) GTIN, (21) Serial, (10) Lot/Batch, (17) Expiry YYMMDD.
_AI_FIXED_LEN = {"01": 14, "17": 6}  # fixed-length AIs
_AI_VARIABLE = {"21", "10"}  # variable-length (FNC1/GS terminated)
_GS = "\x1d"  # GS1 group separator


def parse_gs1(data: str) -> dict[str, Any]:
    """Parse a GS1 element string into AIs. Returns {gtin, serial, lot, expiry,
    valid, raw, parsed}."""
    raw = data or ""
    s = raw.replace("\\x1d", _GS).lstrip("\x1d")
    parsed: dict[str, str] = {}
    i = 0
    ok = True
    while i < len(s):
        ai = s[i : i + 2]
        i += 2
        if ai in _AI_FIXED_LEN:
            length = _AI_FIXED_LEN[ai]
            value = s[i : i + length]
            i += length
            parsed[ai] = value
        elif ai in _AI_VARIABLE:
            gs_pos = s.find(_GS, i)
            if gs_pos == -1:
                value = s[i:]
                i = len(s)
            else:
                value = s[i:gs_pos]
                i = gs_pos + 1
            parsed[ai] = value
        else:
            ok = False
            break

    gtin = parsed.get("01")
    return {
        "valid": ok and gtin is not None and _valid_gtin_checkdigit(gtin),
        "gtin": gtin,
        "ndc": _gtin_to_ndc(gtin) if gtin else None,
        "serial": parsed.get("21"),
        "lot": parsed.get("10"),
        "expiry": parsed.get("17"),
        "raw": raw,
        "parsed": parsed,
    }


def _valid_gtin_checkdigit(gtin: str) -> bool:
    if not gtin or not gtin.isdigit() or len(gtin) != 14:
        return False
    digits = [int(c) for c in gtin]
    check = digits[-1]
    body = digits[:-1]
    total = 0
    # GTIN-14 check digit: multiply alternating 3,1 from the right of the body.
    for idx, d in enumerate(reversed(body)):
        total += d * (3 if idx % 2 == 0 else 1)
    calc = (10 - (total % 10)) % 10
    return calc == check


def _gtin_to_ndc(gtin: str) -> str | None:
    """Extract the 10-digit NDC embedded in a pharma GTIN-14.

    A pharma GTIN-14 is: indicator(1) + '3' country + 10-digit NDC + check(1).
    We return the embedded 10-digit segment for openFDA matching.
    """
    if not gtin or len(gtin) != 14 or not gtin.isdigit():
        return None
    # Strip indicator digit + leading country (often '0030' US) heuristically:
    # the NDC is the 10 digits before the check digit.
    return gtin[3:13]


class BarcodeDecoder:
    def status(self) -> dict[str, Any]:
        try:
            import pylibdmtx.pylibdmtx  # noqa: F401

            return {"available": True, "reason": None, "backend": "pylibdmtx"}
        except Exception:
            pass
        try:
            import pyzbar.pyzbar  # noqa: F401

            return {"available": True, "reason": None, "backend": "pyzbar"}
        except Exception as exc:
            return {"available": False, "reason": f"no DataMatrix decoder installed: {exc}"}

    def decode(self, image_bytes: bytes) -> dict[str, Any]:
        """Decode a 2D DataMatrix/QR from the image and parse GS1 AIs.

        Returns {"available": bool, "found": bool, ...parse_gs1 fields,
                 "reason": str|None}.
        """
        from io import BytesIO

        try:
            from PIL import Image

            img = Image.open(BytesIO(image_bytes)).convert("RGB")
        except Exception as exc:
            return {"available": False, "found": False, "reason": f"unreadable image: {exc}"}

        # Try pylibdmtx (DataMatrix) first, then pyzbar.
        text = None
        backend = None
        try:
            from pylibdmtx.pylibdmtx import decode as dm_decode

            results = dm_decode(img)
            if results:
                text = results[0].data.decode("utf-8", errors="replace")
                backend = "pylibdmtx"
        except Exception:
            pass
        if text is None:
            try:
                from pyzbar.pyzbar import decode as zbar_decode

                results = zbar_decode(img)
                if results:
                    text = results[0].data.decode("utf-8", errors="replace")
                    backend = "pyzbar"
            except Exception as exc:
                return {
                    "available": False,
                    "found": False,
                    "reason": f"no DataMatrix decoder installed: {exc}",
                }

        if text is None:
            return {"available": True, "found": False, "reason": "no barcode detected in image", "backend": backend}

        parsed = parse_gs1(text)
        return {"available": True, "found": True, "backend": backend, **parsed, "reason": None}
