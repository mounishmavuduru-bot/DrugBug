//! Row-Level Security filters (PRD §8 authorization, §15).
//!
//! Read-path enforcement: these SQL filters decide which rows each subscribing
//! client may *see*. Filters on the same table are UNIONed — a row is visible if
//! any filter matches. Two rules cover every owner-scoped table:
//!   (1) the owner sees their own rows, and
//!   (2) an accepted caregiver sees their linked patients' rows.
//!
//! Push tokens are self-only (a caregiver must never read another user's push
//! credentials). Write-path checks live in `auth.rs`.

use spacetimedb::{client_visibility_filter, Filter};

// ---- profiles ----
#[client_visibility_filter]
const PROFILE_SELF: Filter =
    Filter::Sql("SELECT p.* FROM profiles p WHERE p.identity = :sender");
#[client_visibility_filter]
const PROFILE_CAREGIVER: Filter = Filter::Sql(
    "SELECT p.* FROM profiles p \
     JOIN caregiver_links c ON p.identity = c.patient_identity \
     WHERE c.caregiver_identity = :sender AND c.status = 'accepted'",
);

// ---- caregiver_links (both parties may see the link) ----
#[client_visibility_filter]
const LINK_CAREGIVER: Filter =
    Filter::Sql("SELECT c.* FROM caregiver_links c WHERE c.caregiver_identity = :sender");
#[client_visibility_filter]
const LINK_PATIENT: Filter =
    Filter::Sql("SELECT c.* FROM caregiver_links c WHERE c.patient_identity = :sender");

// ---- medications ----
#[client_visibility_filter]
const MED_SELF: Filter =
    Filter::Sql("SELECT m.* FROM medications m WHERE m.owner_identity = :sender");
#[client_visibility_filter]
const MED_CAREGIVER: Filter = Filter::Sql(
    "SELECT m.* FROM medications m \
     JOIN caregiver_links c ON m.owner_identity = c.patient_identity \
     WHERE c.caregiver_identity = :sender AND c.status = 'accepted'",
);

// ---- doses ----
#[client_visibility_filter]
const DOSE_SELF: Filter =
    Filter::Sql("SELECT d.* FROM doses d WHERE d.owner_identity = :sender");
#[client_visibility_filter]
const DOSE_CAREGIVER: Filter = Filter::Sql(
    "SELECT d.* FROM doses d \
     JOIN caregiver_links c ON d.owner_identity = c.patient_identity \
     WHERE c.caregiver_identity = :sender AND c.status = 'accepted'",
);

// ---- side_effects ----
#[client_visibility_filter]
const SE_SELF: Filter =
    Filter::Sql("SELECT s.* FROM side_effects s WHERE s.owner_identity = :sender");
#[client_visibility_filter]
const SE_CAREGIVER: Filter = Filter::Sql(
    "SELECT s.* FROM side_effects s \
     JOIN caregiver_links c ON s.owner_identity = c.patient_identity \
     WHERE c.caregiver_identity = :sender AND c.status = 'accepted'",
);

// ---- scans ----
#[client_visibility_filter]
const SCAN_SELF: Filter =
    Filter::Sql("SELECT s.* FROM scans s WHERE s.owner_identity = :sender");
#[client_visibility_filter]
const SCAN_CAREGIVER: Filter = Filter::Sql(
    "SELECT s.* FROM scans s \
     JOIN caregiver_links c ON s.owner_identity = c.patient_identity \
     WHERE c.caregiver_identity = :sender AND c.status = 'accepted'",
);

// ---- interactions_cache ----
#[client_visibility_filter]
const IX_SELF: Filter =
    Filter::Sql("SELECT i.* FROM interactions_cache i WHERE i.owner_identity = :sender");
#[client_visibility_filter]
const IX_CAREGIVER: Filter = Filter::Sql(
    "SELECT i.* FROM interactions_cache i \
     JOIN caregiver_links c ON i.owner_identity = c.patient_identity \
     WHERE c.caregiver_identity = :sender AND c.status = 'accepted'",
);

// ---- appointments ----
#[client_visibility_filter]
const APPT_SELF: Filter =
    Filter::Sql("SELECT a.* FROM appointments a WHERE a.owner_identity = :sender");
#[client_visibility_filter]
const APPT_CAREGIVER: Filter = Filter::Sql(
    "SELECT a.* FROM appointments a \
     JOIN caregiver_links c ON a.owner_identity = c.patient_identity \
     WHERE c.caregiver_identity = :sender AND c.status = 'accepted'",
);

// ---- recall_alerts ----
#[client_visibility_filter]
const RECALL_SELF: Filter =
    Filter::Sql("SELECT r.* FROM recall_alerts r WHERE r.owner_identity = :sender");
#[client_visibility_filter]
const RECALL_CAREGIVER: Filter = Filter::Sql(
    "SELECT r.* FROM recall_alerts r \
     JOIN caregiver_links c ON r.owner_identity = c.patient_identity \
     WHERE c.caregiver_identity = :sender AND c.status = 'accepted'",
);

// ---- push_subscriptions (self only — never expose another user's push creds) ----
#[client_visibility_filter]
const PUSH_SELF: Filter =
    Filter::Sql("SELECT s.* FROM push_subscriptions s WHERE s.owner_identity = :sender");

// ---- audit_log (patient sees actions on them; an actor sees their own actions) ----
#[client_visibility_filter]
const AUDIT_PATIENT: Filter =
    Filter::Sql("SELECT a.* FROM audit_log a WHERE a.patient_identity = :sender");
#[client_visibility_filter]
const AUDIT_ACTOR: Filter =
    Filter::Sql("SELECT a.* FROM audit_log a WHERE a.actor_identity = :sender");
