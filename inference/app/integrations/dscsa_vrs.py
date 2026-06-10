"""DSCSA serialized verification (PRD §10.1 layer 5, §12).

`DSCSAVerificationProvider` is a REAL interface against the GS1 VRS /
Lightweight Messaging protocol. Per DSCSA (FFDCA §582), serialized product
verification is restricted to Authorized Trading Partners (ATPs); ATP status
requires a state dispenser/wholesaler license and a VRS provider relationship
(TraceLink, Spherity, Antares, Movilitas, etc.) — a DEA registration alone is
insufficient.

Until `DSCSA_VRS_*` credentials are configured, verification returns an explicit
'serialized verification unavailable — ATP credentials not configured' state.
This is an honest capability boundary (PRD §5.3 / §10.1) — never a fake
pass/fail. When credentials exist, enabling layer 5 is a configuration change
with zero code rewrite: the GS1 Lightweight Messaging request is implemented
below and dispatched via async httpx.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings

UNAVAILABLE_MESSAGE = "serialized verification unavailable — ATP credentials not configured"


@dataclass
class ProductIdentifier:
    """Parsed GS1 product identifier (from a 2D DataMatrix decode)."""

    gtin: str
    serial_number: str
    lot: str | None = None
    expiry: str | None = None  # YYMMDD per GS1 AI (17)


@dataclass
class VerificationResult:
    status: str  # "verified" | "not_verified" | "unavailable" | "error"
    available: bool
    detail: str
    raw: dict[str, Any] | None = None


class DSCSAVerificationProvider:
    """GS1 VRS / Lightweight Messaging adapter.

    Build the standard Verification Router Service request (PI verification) and
    POST it to the configured VRS endpoint with the ATP's GLN and OAuth client
    credentials. Schema follows the GS1 US Lightweight Messaging Standard
    (`verificationMessaging`).
    """

    def __init__(self, timeout: float = 12.0) -> None:
        self.settings = get_settings()
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        return self.settings.dscsa_configured

    async def verify(self, pi: ProductIdentifier) -> VerificationResult:
        if not self.configured:
            return VerificationResult(
                status="unavailable",
                available=False,
                detail=UNAVAILABLE_MESSAGE,
            )
        try:
            token = await self._get_oauth_token()
            body = self._build_request(pi)
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    self.settings.dscsa_vrs_endpoint,  # type: ignore[arg-type]
                    json=body,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            return VerificationResult(
                status="error",
                available=True,
                detail=f"VRS request failed: {exc}",
            )
        return self._parse_response(data)

    async def _get_oauth_token(self) -> str:
        """OAuth2 client-credentials grant against the VRS provider."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.settings.dscsa_vrs_endpoint}/oauth/token",  # type: ignore[arg-type]
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.settings.dscsa_vrs_client_id,
                    "client_secret": self.settings.dscsa_vrs_client_secret,
                },
            )
            resp.raise_for_status()
            return resp.json().get("access_token", "")

    def _build_request(self, pi: ProductIdentifier) -> dict[str, Any]:
        # GS1 Lightweight Messaging — verificationRequest for a single PI.
        return {
            "verificationRequest": {
                "productIdentifier": {
                    "gtin": pi.gtin,
                    "serialNumber": pi.serial_number,
                    "lot": pi.lot,
                    "expirationDate": pi.expiry,
                },
                "requestingTradingPartner": {
                    "gln": self.settings.dscsa_vrs_atp_gln,
                },
            }
        }

    def _parse_response(self, data: dict[str, Any]) -> VerificationResult:
        resp = data.get("verificationResponse", {})
        verified = resp.get("verified")
        if verified is True:
            return VerificationResult("verified", True, "manufacturer confirmed serialized identifier", data)
        if verified is False:
            reason = resp.get("additionalInfo") or "manufacturer did not confirm identifier"
            return VerificationResult("not_verified", True, str(reason), data)
        return VerificationResult("error", True, "ambiguous VRS response", data)


def availability() -> dict[str, Any]:
    """For /health: report whether layer 5 is live."""
    provider = DSCSAVerificationProvider()
    return {
        "available": provider.configured,
        "reason": None if provider.configured else UNAVAILABLE_MESSAGE,
    }
