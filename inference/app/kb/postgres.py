"""Postgres knowledge-base access layer (PRD §13, contract §kb).

Provides a connection pool and query helpers over the static medical reference
data loaded by the ETL scripts (DDInter pairwise interactions, RxNorm class,
pill reference, CPIC). psycopg[binary] is a lightweight boot dep.

If POSTGRES_URL is not configured, callers receive empty results and /health
reports the KB as unavailable — the deterministic mechanistic overlay still
provides real cascade signal independent of the database (PRD §10.2).
"""

from __future__ import annotations

from typing import Any

from app.config import get_settings

try:
    import psycopg
    from psycopg.rows import dict_row

    _PSYCOPG_IMPORT_ERROR: str | None = None
except Exception as exc:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]
    _PSYCOPG_IMPORT_ERROR = str(exc)


class KnowledgeBase:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def configured(self) -> bool:
        return psycopg is not None and self.settings.postgres_configured

    def availability_reason(self) -> str | None:
        if psycopg is None:
            return f"psycopg not importable: {_PSYCOPG_IMPORT_ERROR}"
        if not self.settings.postgres_configured:
            return "POSTGRES_URL not configured"
        return None

    async def _connect(self):
        return await psycopg.AsyncConnection.connect(
            self.settings.postgres_url, row_factory=dict_row
        )

    async def _query(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        if not self.configured:
            return []
        try:
            async with await self._connect() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(sql, params)
                    return await cur.fetchall()
        except Exception:
            # KB is a degradable layer; never crash the request path on a DB error.
            return []

    async def ping(self) -> bool:
        if not self.configured:
            return False
        rows = await self._query("SELECT 1 AS ok")
        return bool(rows)

    async def kb_version(self) -> str:
        rows = await self._query(
            "SELECT version FROM kb_dataset_versions WHERE dataset = %s "
            "ORDER BY ingested_at DESC LIMIT 1",
            ("ddinter",),
        )
        if rows:
            return f"ddinter-{rows[0]['version']}"
        return self.settings.kb_version

    # ---- DDInter pairwise interactions ----
    async def pairwise_interactions(
        self, ingredient_keys: list[str]
    ) -> list[dict[str, Any]]:
        """Return DDInter interactions among the given ingredient identifiers.

        `ingredient_keys` are normalized ingredient names (lowercased) and/or
        DrugBank/DDInter ids. The ddinter_interactions table is keyed by both a
        normalized name and ddinter id; we match on the normalized name set.
        """
        if not ingredient_keys or not self.configured:
            return []
        keys = [k.lower() for k in ingredient_keys if k]
        if not keys:
            return []
        placeholders = ",".join(["%s"] * len(keys))
        sql = (
            f"SELECT drug_a_name, drug_b_name, severity, mechanism, management, "
            f"source, ddinter_id "
            f"FROM ddinter_interactions "
            f"WHERE lower(drug_a_name) IN ({placeholders}) "
            f"AND lower(drug_b_name) IN ({placeholders})"
        )
        return await self._query(sql, tuple(keys) + tuple(keys))

    # ---- RxNorm/ATC class lookup ----
    async def atc_class_for_ingredient(self, ingredient_name: str) -> dict[str, Any] | None:
        rows = await self._query(
            "SELECT atc_code, atc_class FROM rxnorm_atc_classes "
            "WHERE lower(ingredient_name) = lower(%s) LIMIT 1",
            (ingredient_name,),
        )
        return rows[0] if rows else None

    # ---- Pill reference (ePillID / C3PI / DailyMed attributes) ----
    async def pill_reference_by_imprint(
        self, imprint: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        if not imprint:
            return []
        return await self._query(
            "SELECT ndc, name, generic_name, imprint, shape, color, scoring, size_mm "
            "FROM pill_reference WHERE lower(imprint) = lower(%s) LIMIT %s",
            (imprint, limit),
        )

    async def pill_reference_by_attributes(
        self, shape: str | None, color: str | None, limit: int = 50
    ) -> list[dict[str, Any]]:
        clauses = []
        params: list[Any] = []
        if shape:
            clauses.append("lower(shape) = lower(%s)")
            params.append(shape)
        if color:
            clauses.append("lower(color) = lower(%s)")
            params.append(color)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        return await self._query(
            "SELECT ndc, name, generic_name, imprint, shape, color, scoring, size_mm, "
            "embedding FROM pill_reference" + where + " LIMIT %s",
            tuple(params),
        )

    async def all_pill_embeddings(self, limit: int = 100000) -> list[dict[str, Any]]:
        """Load the gallery embeddings for nearest-neighbor matching."""
        return await self._query(
            "SELECT ndc, name, generic_name, imprint, shape, color, embedding "
            "FROM pill_reference WHERE embedding IS NOT NULL LIMIT %s",
            (limit,),
        )

    # ---- CPIC guidance (PharmacoFit) ----
    async def cpic_guidance(
        self, gene: str, phenotype: str
    ) -> list[dict[str, Any]]:
        return await self._query(
            "SELECT gene, phenotype, drug, guidance, cpic_level "
            "FROM cpic_guidelines WHERE lower(gene) = lower(%s) "
            "AND lower(phenotype) = lower(%s)",
            (gene, phenotype),
        )

    async def cpic_guidance_for_drug(self, drug: str) -> list[dict[str, Any]]:
        return await self._query(
            "SELECT gene, phenotype, drug, guidance, cpic_level "
            "FROM cpic_guidelines WHERE lower(drug) = lower(%s)",
            (drug,),
        )


_instance: KnowledgeBase | None = None


def get_kb() -> KnowledgeBase:
    global _instance
    if _instance is None:
        _instance = KnowledgeBase()
    return _instance
