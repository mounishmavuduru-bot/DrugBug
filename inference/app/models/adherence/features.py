"""AdherenceForecaster feature engineering (PRD §10.3).

Builds the feature vector for each scheduled dose from the user's real dose
history (SpacetimeDB `doses` rows). Features per PRD §10.3:
  - day of week, time of day (hour bucket)
  - days since refill
  - total daily med count
  - recent adherence trend (rolling on-time rate)
  - historical miss pattern by (day × time) bucket

Pure-Python + numpy (lightweight). Timestamps are SpacetimeDB micros-since-epoch.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np

FEATURE_NAMES = [
    "day_of_week",
    "hour_of_day",
    "is_weekend",
    "days_since_refill",
    "total_daily_med_count",
    "recent_ontime_rate",
    "bucket_miss_rate",
    "hours_from_now",
]

_MISSED_STATUSES = {"missed", "skipped"}
_TAKEN_STATUSES = {"taken", "late"}


def _ts_to_dt(ts: Any) -> datetime | None:
    """SpacetimeDB Timestamp -> datetime. Accepts micros int or dicts."""
    micros = _ts_micros(ts)
    if micros is None:
        return None
    return datetime.fromtimestamp(micros / 1_000_000, tz=timezone.utc)


def _ts_micros(ts: Any) -> int | None:
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        return int(ts)
    if isinstance(ts, dict):
        for key in ("__timestamp_micros_since_unix_epoch__", "micros_since_unix_epoch", "micros"):
            if key in ts:
                return int(ts[key])
    if isinstance(ts, str) and ts.lstrip("-").isdigit():
        return int(ts)
    return None


def _bucket(dt: datetime) -> tuple[int, int]:
    return (dt.weekday(), dt.hour // 4)  # (day, 4-hour bucket)


def build_history_stats(doses: list[dict[str, Any]]) -> dict[str, Any]:
    """Precompute per-user history: overall on-time rate, per-bucket miss rate,
    and a sorted list of (datetime, outcome) for trend windows."""
    events: list[tuple[datetime, int]] = []  # (scheduled_dt, missed=1/taken=0)
    bucket_counts: dict[tuple[int, int], list[int]] = {}
    for d in doses:
        status = (d.get("status") or "").lower()
        dt = _ts_to_dt(d.get("scheduled_at"))
        if dt is None:
            continue
        if status in _MISSED_STATUSES:
            outcome = 1
        elif status in _TAKEN_STATUSES:
            outcome = 0
        else:
            continue  # pending/unknown not used for training history
        events.append((dt, outcome))
        bucket_counts.setdefault(_bucket(dt), []).append(outcome)

    events.sort(key=lambda x: x[0])
    bucket_miss = {b: (sum(v) / len(v)) for b, v in bucket_counts.items() if v}
    overall = (sum(o for _, o in events) / len(events)) if events else 0.0
    return {
        "events": events,
        "bucket_miss": bucket_miss,
        "overall_miss_rate": overall,
        "n": len(events),
    }


def recent_ontime_rate(stats: dict[str, Any], before: datetime, window: int = 14) -> float:
    """Rolling on-time rate over the last `window` graded doses before `before`."""
    prior = [o for dt, o in stats["events"] if dt < before]
    if not prior:
        return 1.0  # optimistic prior with no history
    recent = prior[-window:]
    missed = sum(recent)
    return 1.0 - (missed / len(recent))


def featurize_dose(
    scheduled_dt: datetime,
    stats: dict[str, Any],
    total_daily_med_count: int,
    days_since_refill: float,
    now: datetime | None = None,
) -> list[float]:
    now = now or datetime.now(timezone.utc)
    bucket = _bucket(scheduled_dt)
    return [
        float(scheduled_dt.weekday()),
        float(scheduled_dt.hour),
        1.0 if scheduled_dt.weekday() >= 5 else 0.0,
        float(days_since_refill),
        float(total_daily_med_count),
        recent_ontime_rate(stats, scheduled_dt),
        float(stats["bucket_miss"].get(bucket, stats["overall_miss_rate"])),
        max(0.0, (scheduled_dt - now).total_seconds() / 3600.0),
    ]


def build_training_matrix(
    doses: list[dict[str, Any]], total_daily_med_count: int
) -> tuple[np.ndarray, np.ndarray]:
    """Build (X, y) from graded historical doses for per-user training."""
    stats = build_history_stats(doses)
    X: list[list[float]] = []
    y: list[int] = []
    for d in doses:
        status = (d.get("status") or "").lower()
        dt = _ts_to_dt(d.get("scheduled_at"))
        if dt is None:
            continue
        if status in _MISSED_STATUSES:
            label = 1
        elif status in _TAKEN_STATUSES:
            label = 0
        else:
            continue
        days_since_refill = 0.0  # refill timing optional; 0 when unknown
        X.append(featurize_dose(dt, stats, total_daily_med_count, days_since_refill, now=dt))
        y.append(label)
    return np.asarray(X, dtype=np.float32), np.asarray(y, dtype=np.int32)
