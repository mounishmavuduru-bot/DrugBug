//! Scheduled reducers (PRD §8 scheduler.rs, §9.5).
//!
//! Two timers, seeded in `init`:
//!   - `regenerate_dose_horizons` (daily): keeps every active med's `doses` rows
//!     materialized over the rolling 30-day window.
//!   - `sweep_missed_doses` (hourly): flips long-past `pending` doses to `missed`
//!     so adherence stats and the caregiver dashboard stay accurate.
//!
//! Both guard `ctx.sender() == ctx.database_identity()` so only the scheduler (running as
//! the module identity) can trigger them — a client cannot spoof a tick.

use spacetimedb::{ReducerContext, Table};

use crate::tables::{doses, medications, DoseHorizonTimer, MissedSweepTimer};
use crate::util::materialize_doses;

/// Grace period after a scheduled time before an untaken dose is auto-marked
/// missed. Wide enough that legitimate "late" logging still works.
const MISSED_GRACE_MICROS: i64 = 4 * 60 * 60 * 1_000_000; // 4h

#[spacetimedb::reducer]
pub fn regenerate_dose_horizons(
    ctx: &ReducerContext,
    _timer: DoseHorizonTimer,
) -> Result<(), String> {
    if ctx.sender() != ctx.database_identity() {
        return Err("scheduled reducer not callable by clients".into());
    }
    let active: Vec<_> = ctx.db.medications().iter().filter(|m| m.active).collect();
    for med in active {
        materialize_doses(ctx, &med);
    }
    Ok(())
}

#[spacetimedb::reducer]
pub fn sweep_missed_doses(ctx: &ReducerContext, _timer: MissedSweepTimer) -> Result<(), String> {
    if ctx.sender() != ctx.database_identity() {
        return Err("scheduled reducer not callable by clients".into());
    }
    let cutoff = ctx.timestamp.to_micros_since_unix_epoch() - MISSED_GRACE_MICROS;
    let overdue: Vec<u64> = ctx
        .db
        .doses()
        .iter()
        .filter(|d| d.status == "pending" && d.scheduled_at.to_micros_since_unix_epoch() < cutoff)
        .map(|d| d.dose_id)
        .collect();
    for id in overdue {
        if let Some(mut d) = ctx.db.doses().dose_id().find(id) {
            d.status = "missed".into();
            ctx.db.doses().dose_id().update(d);
        }
    }
    Ok(())
}
