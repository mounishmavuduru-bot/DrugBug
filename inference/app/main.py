"""DrugBug Inference Service — FastAPI app (PRD §6/§7, INFERENCE_CONTRACT.md).

Boots with only the lightweight deps; heavy ML deps are imported lazily inside
the model modules and reported as "unavailable" in /health when absent. CORS is
opened to the configured client origin. All routers match the client contract.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.routes import adherence, brief, interactions, jobs, pgx, scan, search

app = FastAPI(title="DrugBug Inference Service", version=__version__)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router)
app.include_router(interactions.router)
app.include_router(scan.router)
app.include_router(brief.router)
app.include_router(pgx.router)
app.include_router(adherence.router)
app.include_router(jobs.router)


@app.get("/health")
async def health() -> dict[str, Any]:
    """Report which models + integrations are live vs credential/GPU-gated.

    Imports of model modules are cheap (heavy deps are deferred), so we can
    instantiate the status reporters without pulling torch into the boot path.
    """
    # ---- models ----
    from app.integrations import anthropic as claude
    from app.integrations.dscsa_vrs import availability as vrs_availability
    from app.kb.postgres import get_kb
    from app.models.adherence.forecaster import get_forecaster
    from app.models.cascade_gnn.loader import get_cascade_server
    from app.models.pgx.pharmcat import get_pharmcat
    from app.models.pill_id.pipeline import get_pipeline
    from app.spacetime_writeback import get_writeback
    from app.storage import get_storage

    kb = get_kb()
    pipeline = get_pipeline()

    models = {
        "cascadeGnn": get_cascade_server().status(),
        "mechanisticOverlay": {"available": True, "reason": None},  # always-on, zero-weight
        "pillId": pipeline.status(),
        "adherenceForecaster": get_forecaster().status(),
        "patternFinder": {"available": True, "reason": None},  # statistical, always-on
        "pharmCat": get_pharmcat().status(),
    }

    integrations = {
        "rxnorm": {"available": True, "reason": None},  # public, no key
        "openfda": {
            "available": True,
            "apiKey": bool(settings.openfda_api_key),
            "reason": None,
        },
        "dailymed": {"available": True, "reason": None},  # public, no key
        "anthropic": {
            "available": claude.is_available(),
            "reason": claude.availability_reason(),
        },
        "dscsaVrs": vrs_availability(),
        "knowledgeBase": {
            "available": kb.configured,
            "reason": kb.availability_reason(),
        },
        "spacetimeWriteback": {
            "available": get_writeback().configured,
            "reason": None if get_writeback().configured else "SPACETIME_SERVICE_TOKEN not configured",
        },
        "objectStorage": get_storage().status(),
        "redis": {"available": settings.redis_configured, "reason": None if settings.redis_configured else "REDIS_URL not configured"},
    }

    # Overall status: degraded if any credential/GPU-gated capability is down,
    # but still "ok" to boot — the service is honest about partial availability.
    return {
        "status": "ok",
        "version": __version__,
        "modelVersion": settings.model_version,
        "kbVersion": settings.kb_version,
        "models": models,
        "integrations": integrations,
    }


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "drugbug-inference", "version": __version__, "docs": "/docs"}
