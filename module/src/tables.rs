//! DrugBug — SpacetimeDB table definitions (PRD §8).
//!
//! All user/transactional state lives here. Large static medical reference data
//! (DDInter, pill gallery, CPIC rules) does NOT — that lives in the Inference
//! Service's Postgres (PRD §13). Complex/derived structures are stored as JSON
//! strings exactly as the PRD specifies, keeping the realtime layer lean and the
//! schema stable across model/version changes.
//!
//! Authorization is enforced two ways:
//!   1. Row-Level Security filters (see `rls.rs`) gate what each client can *read*.
//!   2. Reducer-side checks (see `auth.rs`) gate what each client can *write*.

use spacetimedb::{Identity, ScheduleAt, Timestamp};

// Scheduled-table macros below reference their target reducers by name, so the
// reducer fns must be in scope here (defined in `scheduler`).
use crate::scheduler::{regenerate_dose_horizons, sweep_missed_doses};

// ============================================================
//  IDENTITY / ACCESS CONTROL
// ============================================================

/// Allowlist of privileged service identities (the Python Inference Service).
/// A service identity may ONLY call the `record_*` writeback reducers — never
/// read or mutate arbitrary user rows (PRD §15 least-privilege).
///
/// Bootstrap: the table is seeded by `grant_service_identity`, which is callable
/// by anyone *only while the table is empty* (first deploy claims authority);
/// thereafter only an existing service identity may grant another. Document the
/// first-call step in your deploy runbook.
#[spacetimedb::table(accessor = service_identity, public)]
pub struct ServiceIdentity {
    #[primary_key]
    pub identity: Identity,
    pub label: String,
    pub granted_at: Timestamp,
}

// ============================================================
//  CORE USER STATE
// ============================================================

/// One row per user. PK is the OIDC `Identity`. `pgx_phenotypes` is the only
/// genomic-derived field stored here and is treated as field-level-encrypted PHI
/// (the Inference Service encrypts before writeback; PRD §15).
#[spacetimedb::table(accessor = profiles, public)]
pub struct Profile {
    #[primary_key]
    pub identity: Identity,
    pub full_name: String,
    pub date_of_birth: Timestamp,
    pub weight_kg: f64,
    pub conditions: Vec<String>, // normalized condition codes
    pub allergies: Vec<String>,
    pub pgx_phenotypes: String, // JSON: CPIC phenotypes after PharmacoFit (encrypted)
    pub pgx_consent: bool,
    pub created_at: Timestamp,
}

/// Links a caregiver identity to a patient identity with a graded access level.
#[spacetimedb::table(accessor = caregiver_links, public)]
pub struct CaregiverLink {
    #[primary_key]
    #[auto_inc]
    pub link_id: u64,
    #[index(btree)]
    pub caregiver_identity: Identity,
    #[index(btree)]
    pub patient_identity: Identity,
    /// Email captured at invite time so a not-yet-registered caregiver can be
    /// matched on first sign-in.
    pub caregiver_email: String,
    pub access_level: String, // view | log | manage
    pub status: String,       // pending | accepted | revoked
    pub created_at: Timestamp,
}

/// A medication on a user's regimen.
#[spacetimedb::table(accessor = medications, public)]
pub struct Medication {
    #[primary_key]
    #[auto_inc]
    pub med_id: u64,
    #[index(btree)]
    pub owner_identity: Identity,
    pub name: String,
    pub generic_name: String,
    pub rxnorm_code: String,
    pub strength: String, // "10 mg"
    pub form: String,     // tablet|capsule|liquid|injection|patch|inhaler
    pub schedule_times: Vec<String>, // ["08:00","20:00"]
    pub schedule_days: Vec<u8>,      // 0..6 (Sun..Sat), empty = daily
    pub prn: bool,                   // as-needed
    pub prescriber: String,
    pub pharmacy: String,
    pub ndc: String,
    pub refill_date: Timestamp,
    pub doses_remaining: i32,
    pub is_otc: bool,
    pub active: bool,
    pub last_scan_id: u64,
    pub created_at: Timestamp,
}

/// A single materialized scheduled dose. Generated on a rolling 30-day horizon
/// by `generate_dose_schedule` / the nightly scheduler.
#[spacetimedb::table(accessor = doses, public)]
pub struct Dose {
    #[primary_key]
    #[auto_inc]
    pub dose_id: u64,
    #[index(btree)]
    pub med_id: u64,
    #[index(btree)]
    pub owner_identity: Identity,
    #[index(btree)]
    pub scheduled_at: Timestamp,
    pub taken_at: Option<Timestamp>,
    pub status: String,    // pending|taken|missed|skipped|late
    pub logged_by: Identity, // owner or caregiver
    pub notes: String,
}

/// A user-reported side effect, optionally attributed to a med (correlation only).
#[spacetimedb::table(accessor = side_effects, public)]
pub struct SideEffect {
    #[primary_key]
    #[auto_inc]
    pub effect_id: u64,
    #[index(btree)]
    pub owner_identity: Identity,
    pub med_id: Option<u64>,
    pub symptom: String,
    pub severity: u8, // 1..5
    pub logged_at: Timestamp,
}

/// Result of a DrugScan run. Written ONLY by the Inference Service via
/// `record_scan_result` after the full vision + verification pipeline (PRD §10.1).
#[spacetimedb::table(accessor = scans, public)]
pub struct Scan {
    #[primary_key]
    #[auto_inc]
    pub scan_id: u64,
    #[index(btree)]
    pub owner_identity: Identity,
    pub image_ref: String,  // object-storage key
    pub scan_type: String,  // bottle | pill | barcode
    pub identified_drug: String,
    pub identified_ndc: String,
    pub id_confidence: f64,
    pub authenticity: String, // verified | inconclusive | suspect
    pub auth_layers: String,  // JSON: result of each verification layer
    pub raw_analysis: String, // JSON
    pub status: String,       // queued | processing | complete | error
    pub created_at: Timestamp,
}

/// Per-user computed interaction/cascade results. Written ONLY by the Inference
/// Service via `record_interaction_result` after the KB + GNN + cascade run.
#[spacetimedb::table(accessor = interactions_cache, public)]
pub struct InteractionsCache {
    #[primary_key]
    #[auto_inc]
    pub cache_id: u64,
    #[index(btree)]
    pub owner_identity: Identity,
    pub pairs: String,    // JSON: pairwise interactions (KB-sourced + model-predicted, labeled)
    pub cascades: String, // JSON: multi-drug cascade findings
    pub model_version: String,
    pub kb_version: String,
    pub computed_at: Timestamp,
}

/// A clinician appointment with an optional generated brief reference.
#[spacetimedb::table(accessor = appointments, public)]
pub struct Appointment {
    #[primary_key]
    #[auto_inc]
    pub appt_id: u64,
    #[index(btree)]
    pub owner_identity: Identity,
    pub provider_name: String,
    pub provider_type: String,
    pub scheduled_for: Timestamp,
    pub brief_ref: String, // object-storage key for generated brief
    pub created_at: Timestamp,
}

/// A recall/enforcement alert matched to a user's active medication. Written by
/// the recall-monitor job via `record_recall_alert`.
#[spacetimedb::table(accessor = recall_alerts, public)]
pub struct RecallAlert {
    #[primary_key]
    #[auto_inc]
    pub alert_id: u64,
    #[index(btree)]
    pub owner_identity: Identity,
    pub med_id: u64,
    pub openfda_recall_id: String,
    pub severity: String,
    pub summary: String,
    pub acknowledged: bool,
    pub created_at: Timestamp,
}

/// A push subscription (web push keys OR native device token).
#[spacetimedb::table(accessor = push_subscriptions, public)]
pub struct PushSubscription {
    #[primary_key]
    #[auto_inc]
    pub sub_id: u64,
    #[index(btree)]
    pub owner_identity: Identity,
    pub endpoint: String,
    pub keys: String,    // JSON: p256dh + auth (web push) OR device token (native)
    pub platform: String, // web | ios | android
    pub created_at: Timestamp,
}

/// Audit trail of caregiver actions taken on a patient's data (PRD §15).
#[spacetimedb::table(accessor = audit_log, public)]
pub struct AuditEntry {
    #[primary_key]
    #[auto_inc]
    pub entry_id: u64,
    #[index(btree)]
    pub patient_identity: Identity,
    pub actor_identity: Identity,
    pub action: String, // e.g. "log_dose" | "update_medication"
    pub detail: String,
    pub at: Timestamp,
}

// ============================================================
//  SCHEDULED-JOB TABLES (PRD §8 scheduler.rs, §9.5, §10.7)
// ============================================================

/// Drives `regenerate_dose_horizons` nightly: keeps every active med's `doses`
/// rows materialized over a rolling 30-day window.
#[spacetimedb::table(accessor = dose_horizon_timer, scheduled(regenerate_dose_horizons))]
pub struct DoseHorizonTimer {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Drives `sweep_missed_doses`: flips past-due `pending` doses to `missed`.
#[spacetimedb::table(accessor = missed_sweep_timer, scheduled(sweep_missed_doses))]
pub struct MissedSweepTimer {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}
