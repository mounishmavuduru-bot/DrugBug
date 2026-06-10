"""SpacetimeDB writeback + read access (INFERENCE_CONTRACT.md §writeback).

The service authenticates as an allowlisted service identity and calls reducers
over the SpacetimeDB HTTP API:

    POST {SPACETIME_HTTP}/v1/database/{DB}/call/{reducer}
    Authorization: Bearer {SPACETIME_SERVICE_TOKEN}
    Content-Type: application/json
    Body: [arg1, arg2, ...]   # positional JSON args in reducer signature order

Reads (user meds for recompute/brief) go through the SQL HTTP API:

    POST {SPACETIME_HTTP}/v1/database/{DB}/sql
    Body: "SELECT * FROM medications WHERE owner_identity = X"

Bootstrap: after `spacetime publish`, grant this service's identity ONCE via the
`grant_service_identity(identity, label)` reducer (callable while the allowlist
is empty). See README.

Reducer arg order is load-bearing — it matches reducers.rs exactly. Identity
arguments are SpacetimeDB `Identity` values; over the HTTP API these are encoded
as the 32-byte hex string the client passes (`identityHex`).
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import get_settings


class SpacetimeError(RuntimeError):
    pass


class SpacetimeNotConfigured(SpacetimeError):
    pass


class SpacetimeWriteback:
    def __init__(self, timeout: float = 15.0) -> None:
        self.settings = get_settings()
        self.timeout = timeout

    @property
    def configured(self) -> bool:
        return self.settings.spacetime_configured

    def _base(self) -> str:
        return self.settings.spacetime_http.rstrip("/")

    def _db(self) -> str:
        return self.settings.spacetime_db

    def _headers(self) -> dict[str, str]:
        if not self.settings.spacetime_service_token:
            raise SpacetimeNotConfigured(
                "SPACETIME_SERVICE_TOKEN not configured — cannot write back"
            )
        return {
            "Authorization": f"Bearer {self.settings.spacetime_service_token}",
            "Content-Type": "application/json",
        }

    # ---- reducer call ----
    async def call_reducer(self, reducer: str, args: list[Any]) -> None:
        url = f"{self._base()}/v1/database/{self._db()}/call/{reducer}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, headers=self._headers(), content=json.dumps(args))
            if resp.status_code >= 400:
                raise SpacetimeError(
                    f"reducer {reducer} failed: {resp.status_code} {resp.text}"
                )

    # ---- SQL read ----
    async def sql(self, query: str) -> list[dict[str, Any]]:
        """Run a read-only SQL query and return rows as dicts.

        SpacetimeDB's SQL HTTP API returns a list of statement results, each
        with `schema` (column defs) and `rows` (positional value arrays). We zip
        column names against each row to produce dicts.
        """
        url = f"{self._base()}/v1/database/{self._db()}/sql"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, headers=self._headers(), content=query)
            if resp.status_code >= 400:
                raise SpacetimeError(f"sql failed: {resp.status_code} {resp.text}")
            data = resp.json()
        return _flatten_sql_result(data)

    # =========================================================
    #  Typed writeback helpers (arg order matches reducers.rs)
    # =========================================================

    async def record_scan_result(
        self,
        scan_id: int,
        identified_drug: str,
        identified_ndc: str,
        id_confidence: float,
        authenticity: str,
        auth_layers: dict[str, Any] | str,
        raw_analysis: dict[str, Any] | str,
    ) -> None:
        # record_scan_result(scan_id:u64, identified_drug, identified_ndc,
        #   id_confidence:f64, authenticity, auth_layers(json str), raw_analysis(json str))
        await self.call_reducer(
            "record_scan_result",
            [
                int(scan_id),
                identified_drug,
                identified_ndc,
                float(id_confidence),
                authenticity,
                _as_json_str(auth_layers),
                _as_json_str(raw_analysis),
            ],
        )

    async def fail_scan(self, scan_id: int, reason: str) -> None:
        # fail_scan(scan_id:u64, reason)
        await self.call_reducer("fail_scan", [int(scan_id), reason])

    async def record_interaction_result(
        self,
        owner_identity_hex: str,
        pairs: list[Any] | str,
        cascades: list[Any] | str,
        model_version: str,
        kb_version: str,
    ) -> None:
        # record_interaction_result(owner:Identity, pairs(json str),
        #   cascades(json str), model_version, kb_version)
        await self.call_reducer(
            "record_interaction_result",
            [
                owner_identity_hex,
                _as_json_str(pairs),
                _as_json_str(cascades),
                model_version,
                kb_version,
            ],
        )

    async def record_recall_alert(
        self,
        owner_identity_hex: str,
        med_id: int,
        openfda_recall_id: str,
        severity: str,
        summary: str,
    ) -> None:
        # record_recall_alert(owner:Identity, med_id:u64, openfda_recall_id, severity, summary)
        await self.call_reducer(
            "record_recall_alert",
            [owner_identity_hex, int(med_id), openfda_recall_id, severity, summary],
        )

    async def set_pgx_phenotypes(
        self, owner_identity_hex: str, phenotypes_json: dict[str, Any] | str
    ) -> None:
        # set_pgx_phenotypes(owner:Identity, phenotypes_json)
        await self.call_reducer(
            "set_pgx_phenotypes",
            [owner_identity_hex, _as_json_str(phenotypes_json)],
        )

    async def attach_brief(self, appt_id: int, brief_ref: str) -> None:
        # attach_brief(appt_id:u64, brief_ref)
        await self.call_reducer("attach_brief", [int(appt_id), brief_ref])

    # =========================================================
    #  Convenience reads for recompute / brief / recall monitor
    # =========================================================

    async def get_active_medications(self, owner_identity_hex: str) -> list[dict[str, Any]]:
        # Identity literals in SpacetimeDB SQL are hex strings in single quotes.
        owner = _sql_escape(owner_identity_hex)
        rows = await self.sql(
            f"SELECT * FROM medications WHERE owner_identity = '{owner}'"
        )
        return [r for r in rows if r.get("active", True)]

    async def get_profile(self, owner_identity_hex: str) -> dict[str, Any] | None:
        owner = _sql_escape(owner_identity_hex)
        rows = await self.sql(
            f"SELECT * FROM profiles WHERE identity = '{owner}'"
        )
        return rows[0] if rows else None

    async def get_doses(self, owner_identity_hex: str) -> list[dict[str, Any]]:
        owner = _sql_escape(owner_identity_hex)
        return await self.sql(
            f"SELECT * FROM doses WHERE owner_identity = '{owner}'"
        )

    async def get_side_effects(self, owner_identity_hex: str) -> list[dict[str, Any]]:
        owner = _sql_escape(owner_identity_hex)
        return await self.sql(
            f"SELECT * FROM side_effects WHERE owner_identity = '{owner}'"
        )

    async def get_interactions_cache(self, owner_identity_hex: str) -> dict[str, Any] | None:
        owner = _sql_escape(owner_identity_hex)
        rows = await self.sql(
            f"SELECT * FROM interactions_cache WHERE owner_identity = '{owner}'"
        )
        return rows[0] if rows else None

    async def get_appointment(self, appt_id: int) -> dict[str, Any] | None:
        rows = await self.sql(f"SELECT * FROM appointments WHERE appt_id = {int(appt_id)}")
        return rows[0] if rows else None


def _as_json_str(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, default=str)


def _sql_escape(value: str) -> str:
    return value.replace("'", "''")


def _flatten_sql_result(data: Any) -> list[dict[str, Any]]:
    """Normalize the SpacetimeDB SQL HTTP response into a list of row dicts.

    The API returns a JSON array of statement results. Each result has a
    `schema` describing columns and `rows` of positional values. Schema shape
    has varied across SpacetimeDB versions, so this is defensive: it extracts
    column names from common shapes and falls back to positional keys.
    """
    out: list[dict[str, Any]] = []
    if not isinstance(data, list):
        data = [data]
    for stmt in data:
        if not isinstance(stmt, dict):
            continue
        rows = stmt.get("rows") or []
        cols = _extract_columns(stmt.get("schema"))
        for row in rows:
            if isinstance(row, dict):
                out.append(row)
            elif isinstance(row, list):
                if cols and len(cols) == len(row):
                    out.append(dict(zip(cols, row)))
                else:
                    out.append({f"col{i}": v for i, v in enumerate(row)})
            else:
                out.append({"value": row})
    return out


def _extract_columns(schema: Any) -> list[str]:
    if not isinstance(schema, dict):
        return []
    elements = schema.get("elements") or schema.get("columns") or []
    cols: list[str] = []
    for el in elements:
        if isinstance(el, dict):
            name = el.get("name")
            if isinstance(name, dict):  # {"some": "field"} optional-name shape
                name = name.get("some") or name.get("value")
            if isinstance(name, str):
                cols.append(name)
    return cols


# Module-level singleton accessor.
_instance: SpacetimeWriteback | None = None


def get_writeback() -> SpacetimeWriteback:
    global _instance
    if _instance is None:
        _instance = SpacetimeWriteback()
    return _instance
