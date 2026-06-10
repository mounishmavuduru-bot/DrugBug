# DrugBug Inference Service — lightweight boot image (PRD §19).
#
# This image installs ONLY the lightweight deps, so the service boots and serves
# /health, /search, /interactions (KB+overlay), /adherence, /patterns, /brief
# (when ANTHROPIC_API_KEY is set), and /pgx (when PharmCAT is installed).
#
# Heavy ML capabilities (cascade GNN serving, pill detection/OCR/embedding,
# DataMatrix decode) require the heavy deps + weights — build a derived image or
# extend this one (see README "GPU / heavy-deps image"). The service degrades
# honestly without them.

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Native libs used by optional barcode decoding (libdmtx/zbar) + Java for
# PharmCAT. These are small; the Python packages that use them are still
# optional and lazily imported.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libdmtx0b \
    libzbar0 \
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY etl ./etl
COPY training ./training

EXPOSE 8000

# Honest boot: the service starts with lightweight deps only and reports gated
# capabilities as "unavailable" in /health.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
