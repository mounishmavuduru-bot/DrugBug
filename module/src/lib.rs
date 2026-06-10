//! DrugBug — SpacetimeDB module (Rust → WASM).
//!
//! The realtime backbone (PRD §6). Owns all user/transactional state and pushes
//! it to every subscribed device automatically (patient phone + caregiver phone
//! always consistent). Heavy ML, vision, and external API calls live in the
//! Python Inference Service, which writes results back here through an
//! allowlisted service identity calling the `record_*` reducers.
//!
//! Module layout:
//!   - `tables`    — all `#[table]` definitions (PRD §8)
//!   - `rls`       — Row-Level Security read filters (PRD §8/§15)
//!   - `auth`      — write-path authorization helpers
//!   - `util`      — dose materialization + audit logging
//!   - `reducers`  — all CRUD + service writeback reducers
//!   - `scheduler` — nightly dose horizon + missed-dose sweep

mod auth;
mod reducers;
// RLS read-filters live in src/rls.rs but are NOT compiled: spacetimedb 2.4.1's
// `client_visibility_filter` is unstable, unenforced, and breaks the websocket
// subscription path (clients hang on SubscribeApplied). Re-enable `mod rls;` (and
// the `unstable` feature in Cargo.toml) once upstream ships RLS. Read-scoping is
// done client-side by identity today; write-path authz (auth.rs) is enforced.
mod rls;
mod scheduler;
mod tables;
mod util;

use std::time::Duration;

use spacetimedb::{ReducerContext, ScheduleAt, Table};

use crate::tables::{dose_horizon_timer, missed_sweep_timer, DoseHorizonTimer, MissedSweepTimer};

/// Runs once on first publish. Seeds the recurring scheduler timers.
#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    // Daily: keep dose horizons materialized.
    ctx.db.dose_horizon_timer().insert(DoseHorizonTimer {
        scheduled_id: 0,
        scheduled_at: ScheduleAt::Interval(Duration::from_secs(24 * 60 * 60).into()),
    });
    // Hourly: sweep overdue pending doses into "missed".
    ctx.db.missed_sweep_timer().insert(MissedSweepTimer {
        scheduled_id: 0,
        scheduled_at: ScheduleAt::Interval(Duration::from_secs(60 * 60).into()),
    });
    log::info!("DrugBug module initialized; scheduler timers seeded.");
}
