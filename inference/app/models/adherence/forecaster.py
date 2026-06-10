"""AdherenceForecaster: gradient-boosted miss-probability model (PRD §10.3).

scikit-learn GradientBoostingClassifier, trained per-user once enough history
exists, with a population cold-start model for new users. CPU. scikit-learn /
numpy are lightweight boot deps, so this module imports them at top level and
always boots.

Serving: predict p(miss) for each upcoming scheduled dose; the route returns
{doseId, scheduledAt, pMiss}. Predictions with p(miss) > 0.5 drive the
pre-emptive nudges on the Today screen.
"""

from __future__ import annotations

import os
import pickle
from datetime import datetime, timezone
from typing import Any

import numpy as np

from app.config import get_settings
from app.models.adherence.features import (
    FEATURE_NAMES,
    _ts_to_dt,
    build_history_stats,
    build_training_matrix,
    featurize_dose,
)

try:
    from sklearn.ensemble import GradientBoostingClassifier

    _SKLEARN_ERROR: str | None = None
except Exception as exc:  # pragma: no cover
    GradientBoostingClassifier = None  # type: ignore[assignment]
    _SKLEARN_ERROR = str(exc)

# Minimum graded doses before a per-user model is worthwhile; below this we use
# the population cold-start model.
MIN_USER_HISTORY = 30


class AdherenceForecaster:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._population = None
        self._population_loaded = False

    def status(self) -> dict[str, Any]:
        if GradientBoostingClassifier is None:
            return {"available": False, "reason": f"scikit-learn not installed: {_SKLEARN_ERROR}"}
        return {
            "available": True,
            "populationModel": bool(self.settings.adherence_population_model)
            and os.path.exists(self.settings.adherence_population_model or ""),
            "reason": None,
        }

    def _load_population(self):
        if self._population_loaded:
            return self._population
        self._population_loaded = True
        path = self.settings.adherence_population_model
        if path and os.path.exists(path):
            try:
                # Trust boundary: this file is the service's OWN trained sklearn
                # estimator, written by training/ and referenced via an
                # operator-configured env var (ADHERENCE_POPULATION_MODEL). It is
                # never user-supplied. sklearn estimators have no JSON form, so
                # pickle is the standard persistence format here.
                with open(path, "rb") as f:
                    self._population = pickle.load(f)  # noqa: S301 - trusted, operator-owned artifact
            except Exception:
                self._population = None
        return self._population

    def train_user_model(
        self, doses: list[dict[str, Any]], total_daily_med_count: int
    ):
        """Train and return a per-user model, or None if insufficient history."""
        if GradientBoostingClassifier is None:
            return None
        X, y = build_training_matrix(doses, total_daily_med_count)
        if len(y) < MIN_USER_HISTORY or len(set(y.tolist())) < 2:
            return None
        clf = GradientBoostingClassifier(
            n_estimators=120, max_depth=3, learning_rate=0.05, subsample=0.9
        )
        clf.fit(X, y)
        return clf

    def forecast(
        self,
        upcoming_doses: list[dict[str, Any]],
        history_doses: list[dict[str, Any]],
        total_daily_med_count: int,
    ) -> dict[str, Any]:
        """Predict p(miss) for each upcoming pending dose.

        Returns {"available": bool, "modelType": "user"|"population"|"heuristic",
                 "forecasts": [{doseId, scheduledAt, pMiss}]}.
        """
        if GradientBoostingClassifier is None:
            return {"available": False, "modelType": None, "forecasts": [], "reason": _SKLEARN_ERROR}

        stats = build_history_stats(history_doses)
        model = self.train_user_model(history_doses, total_daily_med_count)
        model_type = "user"
        if model is None:
            model = self._load_population()
            model_type = "population" if model is not None else "heuristic"

        forecasts: list[dict[str, Any]] = []
        for d in upcoming_doses:
            dt = _ts_to_dt(d.get("scheduled_at"))
            if dt is None:
                continue
            feats = featurize_dose(dt, stats, total_daily_med_count, days_since_refill=0.0)
            if model is not None:
                X = np.asarray([feats], dtype=np.float32)
                try:
                    p_miss = float(model.predict_proba(X)[0][1])
                except Exception:
                    p_miss = self._heuristic(feats, stats)
                    model_type = "heuristic"
            else:
                p_miss = self._heuristic(feats, stats)
            forecasts.append(
                {
                    "doseId": str(d.get("dose_id")),
                    "scheduledAt": dt.isoformat(),
                    "pMiss": round(p_miss, 4),
                }
            )

        return {"available": True, "modelType": model_type, "forecasts": forecasts}

    def _heuristic(self, feats: list[float], stats: dict[str, Any]) -> float:
        """Cold-start heuristic when no trained model is available.

        Uses the bucket miss rate (or overall) blended with the recent on-time
        trend — an honest statistical estimate, not a learned model.
        """
        idx = {n: i for i, n in enumerate(FEATURE_NAMES)}
        bucket_miss = feats[idx["bucket_miss_rate"]]
        recent_ontime = feats[idx["recent_ontime_rate"]]
        recent_miss = 1.0 - recent_ontime
        return float(min(1.0, max(0.0, 0.6 * bucket_miss + 0.4 * recent_miss)))


_instance: AdherenceForecaster | None = None


def get_forecaster() -> AdherenceForecaster:
    global _instance
    if _instance is None:
        _instance = AdherenceForecaster()
    return _instance
