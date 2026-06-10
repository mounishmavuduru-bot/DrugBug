//! Shared helpers: dose-schedule materialization + audit logging.
//!
//! Dose materialization is pure date arithmetic over `ctx.timestamp` (never the
//! host clock), so it is deterministic and wasm-safe. Called from both
//! `generate_dose_schedule` (on med add/change) and the nightly scheduler.

use chrono::{DateTime, Datelike, Days, Timelike, Utc};
use spacetimedb::{Identity, ReducerContext, Table, Timestamp};

use crate::tables::{audit_log, doses, AuditEntry, Dose, Medication};

/// Rolling horizon over which scheduled doses are materialized (PRD §8).
pub const HORIZON_DAYS: u64 = 30;

const MICROS_PER_SEC: i64 = 1_000_000;

fn parse_hhmm(s: &str) -> Option<(u32, u32)> {
    let (h, m) = s.split_once(':')?;
    let h: u32 = h.trim().parse().ok()?;
    let m: u32 = m.trim().parse().ok()?;
    if h < 24 && m < 60 {
        Some((h, m))
    } else {
        None
    }
}

/// chrono weekday → PRD day code (0 = Sunday .. 6 = Saturday).
fn weekday_code(dt: &DateTime<Utc>) -> u8 {
    dt.weekday().num_days_from_sunday() as u8
}

/// Materialize `pending` dose rows for `med` over the rolling horizon, skipping
/// any (med, scheduled_at) that already exists so existing logs/notes survive.
/// PRN and inactive meds have no fixed schedule and are skipped.
pub fn materialize_doses(ctx: &ReducerContext, med: &Medication) {
    if !med.active || med.prn || med.schedule_times.is_empty() {
        return;
    }

    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    let Some(now_dt) = DateTime::<Utc>::from_timestamp_micros(now_us) else {
        return;
    };
    let start_date = now_dt.date_naive();

    // Existing scheduled instants for this med, to dedupe.
    let existing: Vec<i64> = ctx
        .db
        .doses()
        .med_id()
        .filter(med.med_id)
        .map(|d| d.scheduled_at.to_micros_since_unix_epoch())
        .collect();

    let restrict_days = !med.schedule_days.is_empty();

    for offset in 0..HORIZON_DAYS {
        let Some(day) = start_date.checked_add_days(Days::new(offset)) else {
            break;
        };
        let day_dt = day.and_hms_opt(0, 0, 0).unwrap().and_utc();
        if restrict_days && !med.schedule_days.contains(&weekday_code(&day_dt)) {
            continue;
        }

        for t in &med.schedule_times {
            let Some((h, m)) = parse_hhmm(t) else { continue };
            let Some(naive) = day.and_hms_opt(h, m, 0) else { continue };
            let ts_us = naive.and_utc().timestamp() * MICROS_PER_SEC
                + naive.and_utc().timestamp_subsec_micros() as i64;
            // Only future instants; the past is already represented (or swept to missed).
            if ts_us <= now_us {
                continue;
            }
            if existing.contains(&ts_us) {
                continue;
            }
            ctx.db.doses().insert(Dose {
                dose_id: 0,
                med_id: med.med_id,
                owner_identity: med.owner_identity,
                scheduled_at: Timestamp::from_micros_since_unix_epoch(ts_us),
                taken_at: None,
                status: "pending".into(),
                logged_by: med.owner_identity,
                notes: String::new(),
            });
        }
    }
}

/// Record a caregiver/service action against a patient's data (PRD §15 audit).
/// No-op when the actor is the patient themselves (self-actions aren't audited).
pub fn audit(ctx: &ReducerContext, patient: Identity, action: &str, detail: String) {
    if ctx.sender() == patient {
        return;
    }
    ctx.db.audit_log().insert(AuditEntry {
        entry_id: 0,
        patient_identity: patient,
        actor_identity: ctx.sender(),
        action: action.into(),
        detail,
        at: ctx.timestamp,
    });
}

/// Hour-of-day component of a timestamp (used by sweep logic if needed).
#[allow(dead_code)]
pub fn hour_of(ts: Timestamp) -> u32 {
    DateTime::<Utc>::from_timestamp_micros(ts.to_micros_since_unix_epoch())
        .map(|d| d.hour())
        .unwrap_or(0)
}
