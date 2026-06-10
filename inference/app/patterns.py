"""PatternFinder — side-effect attribution (PRD §10.3, contract §patterns).

Statistical temporal correlation + lag analysis over (medication, symptom)
pairs. For each pair, correlates dose events with symptom logs within a
configurable window (default 24h) and reports the strongest associations with
effect size (r), sample size (n), and best lag (hours).

This is correlational, explicitly labeled — NOT a causal claim. Output matches
the client's `Attribution` shape exactly: {medication, symptom, r, n, lagHours}.

numpy / scipy are lightweight boot deps used for the correlation; the module
always boots.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np

from app.models.adherence.features import _ts_to_dt

DEFAULT_WINDOW_HOURS = 24
# Candidate lags (hours) to test for the strongest temporal association.
CANDIDATE_LAGS = [0, 1, 2, 4, 6, 12, 24]
MIN_SAMPLES = 5


def _pearson(x: np.ndarray, y: np.ndarray) -> float:
    if len(x) < 2 or np.std(x) == 0 or np.std(y) == 0:
        return 0.0
    try:
        from scipy.stats import pearsonr

        r, _ = pearsonr(x, y)
        return float(r) if np.isfinite(r) else 0.0
    except Exception:
        # numpy fallback
        r = float(np.corrcoef(x, y)[0, 1])
        return r if np.isfinite(r) else 0.0


def find_patterns(
    medications: list[dict[str, Any]],
    doses: list[dict[str, Any]],
    side_effects: list[dict[str, Any]],
    window_hours: int = DEFAULT_WINDOW_HOURS,
) -> list[dict[str, Any]]:
    """Compute (medication, symptom) temporal associations.

    Method: bin time into `window_hours` buckets over the observed range. For
    each med, build a per-bucket "dose taken" indicator series; for each symptom,
    a per-bucket "symptom logged" indicator series. Test correlation at several
    lags (symptom lagging the dose) and keep the strongest |r| per pair.

    Returns [{medication, symptom, r, n, lagHours}] sorted by |r| descending.
    """
    med_label: dict[Any, str] = {}
    for m in medications:
        med_label[m.get("med_id")] = m.get("name") or m.get("generic_name") or str(m.get("med_id"))

    # Collect taken-dose times per med.
    dose_times: dict[Any, list[datetime]] = {}
    for d in doses:
        status = (d.get("status") or "").lower()
        if status not in ("taken", "late"):
            continue
        dt = _ts_to_dt(d.get("taken_at")) or _ts_to_dt(d.get("scheduled_at"))
        if dt is None:
            continue
        dose_times.setdefault(d.get("med_id"), []).append(dt)

    # Collect symptom times per symptom string.
    symptom_times: dict[str, list[datetime]] = {}
    for s in side_effects:
        symptom = (s.get("symptom") or "").strip()
        if not symptom:
            continue
        dt = _ts_to_dt(s.get("logged_at"))
        if dt is None:
            continue
        symptom_times.setdefault(symptom.lower(), []).append(dt)

    if not dose_times or not symptom_times:
        return []

    # Determine the global time range and bucketing.
    all_times = [t for ts in dose_times.values() for t in ts] + [
        t for ts in symptom_times.values() for t in ts
    ]
    if len(all_times) < MIN_SAMPLES:
        return []
    start = min(all_times)
    end = max(all_times)
    span_hours = max(window_hours, (end - start).total_seconds() / 3600.0)
    n_buckets = max(2, int(span_hours / window_hours) + 1)

    def to_series(times: list[datetime]) -> np.ndarray:
        series = np.zeros(n_buckets, dtype=np.float32)
        for t in times:
            idx = int((t - start).total_seconds() / 3600.0 / window_hours)
            if 0 <= idx < n_buckets:
                series[idx] = 1.0
        return series

    med_series = {mid: to_series(ts) for mid, ts in dose_times.items()}
    sym_series = {sym: to_series(ts) for sym, ts in symptom_times.items()}

    results: list[dict[str, Any]] = []
    for mid, ms in med_series.items():
        for sym, ss in sym_series.items():
            best_r = 0.0
            best_lag = 0
            best_n = 0
            for lag in CANDIDATE_LAGS:
                lag_buckets = max(1, lag // window_hours) if lag >= window_hours else 0
                if lag_buckets >= n_buckets:
                    continue
                # Shift symptom series back by lag (symptom follows dose).
                if lag_buckets == 0:
                    x, y = ms, ss
                else:
                    x = ms[:-lag_buckets]
                    y = ss[lag_buckets:]
                if len(x) < MIN_SAMPLES:
                    continue
                r = _pearson(x, y)
                if abs(r) > abs(best_r):
                    best_r = r
                    best_lag = lag
                    best_n = int(min(np.sum(ms), len(x)))
            if best_n >= MIN_SAMPLES and abs(best_r) > 0.0:
                results.append(
                    {
                        "medication": med_label.get(mid, str(mid)),
                        "symptom": sym,
                        "r": round(best_r, 3),
                        "n": int(np.sum(ms)),  # number of dose events for the med
                        "lagHours": best_lag,
                    }
                )

    results.sort(key=lambda p: abs(p["r"]), reverse=True)
    return results
