"""Central configuration loaded from environment (PRD §20).

Lightweight: only stdlib + pydantic. No heavy imports. Every credentialed
capability degrades to an honest "unavailable" state when its env is absent.
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseModel):
    # ---- Service ----
    model_version: str = os.getenv("MODEL_VERSION", "cascade-gnn-0.0.0+kb-overlay")
    kb_version: str = os.getenv("KB_VERSION", "ddinter-2.0")

    # ---- CORS (client origins) ----
    cors_origins: list[str] = _split_csv(
        os.getenv("CORS_ORIGINS", "http://localhost:3000,https://localhost:3000")
    ) or ["*"]

    # ---- SpacetimeDB writeback ----
    # The client connects over wss://maincloud.spacetimedb.com; the matching HTTP
    # API base is the https:// form of the same host (PRD §6, contract §writeback).
    spacetime_http: str = os.getenv("SPACETIME_HTTP", "https://maincloud.spacetimedb.com")
    spacetime_db: str = os.getenv("SPACETIME_DB", "drugbug")
    spacetime_service_token: str | None = os.getenv("SPACETIME_SERVICE_TOKEN")

    # ---- Postgres KB ----
    postgres_url: str | None = os.getenv("POSTGRES_URL")

    # ---- Redis (scan job queue) ----
    redis_url: str | None = os.getenv("REDIS_URL")

    # ---- External integrations ----
    openfda_api_key: str | None = os.getenv("OPENFDA_API_KEY")
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

    rxnav_base: str = os.getenv("RXNAV_BASE", "https://rxnav.nlm.nih.gov")
    openfda_base: str = os.getenv("OPENFDA_BASE", "https://api.fda.gov")
    dailymed_base: str = os.getenv("DAILYMED_BASE", "https://dailymed.nlm.nih.gov")

    # ---- DSCSA VRS (layer 5, credential-gated) ----
    dscsa_vrs_endpoint: str | None = os.getenv("DSCSA_VRS_ENDPOINT")
    dscsa_vrs_client_id: str | None = os.getenv("DSCSA_VRS_CLIENT_ID")
    dscsa_vrs_client_secret: str | None = os.getenv("DSCSA_VRS_CLIENT_SECRET")
    dscsa_vrs_atp_gln: str | None = os.getenv("DSCSA_VRS_ATP_GLN")

    # ---- Object storage (scan images, briefs) ----
    object_storage_endpoint: str | None = os.getenv("OBJECT_STORAGE_ENDPOINT")
    object_storage_bucket: str | None = os.getenv("OBJECT_STORAGE_BUCKET")
    object_storage_access_key: str | None = os.getenv("OBJECT_STORAGE_ACCESS_KEY")
    object_storage_secret_key: str | None = os.getenv("OBJECT_STORAGE_SECRET_KEY")
    # When object storage is not configured, scan images / briefs are written here.
    local_artifact_dir: str = os.getenv("LOCAL_ARTIFACT_DIR", "/tmp/drugbug-artifacts")

    # ---- Model weights (absent -> honest "unavailable") ----
    cascade_gnn_weights: str | None = os.getenv("CASCADE_GNN_WEIGHTS")
    pill_detector_weights: str | None = os.getenv("PILL_DETECTOR_WEIGHTS")
    pill_embedder_weights: str | None = os.getenv("PILL_EMBEDDER_WEIGHTS")
    imprint_ocr_weights: str | None = os.getenv("IMPRINT_OCR_WEIGHTS")
    adherence_population_model: str | None = os.getenv("ADHERENCE_POPULATION_MODEL")
    adherence_model_dir: str = os.getenv("ADHERENCE_MODEL_DIR", "/tmp/drugbug-adherence")

    # ---- PharmCAT (Java subprocess) ----
    pharmcat_jar: str | None = os.getenv("PHARMCAT_JAR")
    java_bin: str = os.getenv("JAVA_BIN", "java")

    @property
    def spacetime_configured(self) -> bool:
        return bool(self.spacetime_service_token)

    @property
    def postgres_configured(self) -> bool:
        return bool(self.postgres_url)

    @property
    def redis_configured(self) -> bool:
        return bool(self.redis_url)

    @property
    def anthropic_configured(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def dscsa_configured(self) -> bool:
        return bool(
            self.dscsa_vrs_endpoint
            and self.dscsa_vrs_client_id
            and self.dscsa_vrs_client_secret
            and self.dscsa_vrs_atp_gln
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
