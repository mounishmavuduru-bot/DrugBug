//! Row-Level Security filters (PRD §8 authorization, §15).
//!
//! EXPERIMENT (2026-06-10): in spacetimedb 2.4.1, enabling the JOIN-based
//! caregiver filters broke websocket subscriptions (SubscribeApplied never
//! fired → clients hung). This variant keeps ONLY simple self-scoping filters
//! (`WHERE owner_identity = :sender`) to test whether owner-level read
//! enforcement works without the joins. If it does, each user can only read
//! their own rows — the primary PHI protection — while caregiver cross-access is
//! deferred until join-RLS is supported upstream (caregivers would then re-gain
//! visibility, or it is mediated server-side).

use spacetimedb::{client_visibility_filter, Filter};

// ---- profiles (self only) ----
#[client_visibility_filter]
const PROFILE_SELF: Filter =
    Filter::Sql("SELECT p.* FROM profiles p WHERE p.identity = :sender");

// ---- caregiver_links (both parties — simple, no join) ----
#[client_visibility_filter]
const LINK_CAREGIVER: Filter =
    Filter::Sql("SELECT c.* FROM caregiver_links c WHERE c.caregiver_identity = :sender");
#[client_visibility_filter]
const LINK_PATIENT: Filter =
    Filter::Sql("SELECT c.* FROM caregiver_links c WHERE c.patient_identity = :sender");

// ---- owner-scoped tables (self only) ----
#[client_visibility_filter]
const MED_SELF: Filter =
    Filter::Sql("SELECT m.* FROM medications m WHERE m.owner_identity = :sender");
#[client_visibility_filter]
const DOSE_SELF: Filter =
    Filter::Sql("SELECT d.* FROM doses d WHERE d.owner_identity = :sender");
#[client_visibility_filter]
const SE_SELF: Filter =
    Filter::Sql("SELECT s.* FROM side_effects s WHERE s.owner_identity = :sender");
#[client_visibility_filter]
const SCAN_SELF: Filter =
    Filter::Sql("SELECT s.* FROM scans s WHERE s.owner_identity = :sender");
#[client_visibility_filter]
const IX_SELF: Filter =
    Filter::Sql("SELECT i.* FROM interactions_cache i WHERE i.owner_identity = :sender");
#[client_visibility_filter]
const APPT_SELF: Filter =
    Filter::Sql("SELECT a.* FROM appointments a WHERE a.owner_identity = :sender");
#[client_visibility_filter]
const RECALL_SELF: Filter =
    Filter::Sql("SELECT r.* FROM recall_alerts r WHERE r.owner_identity = :sender");
#[client_visibility_filter]
const PUSH_SELF: Filter =
    Filter::Sql("SELECT s.* FROM push_subscriptions s WHERE s.owner_identity = :sender");

// ---- audit_log (patient sees actions on them; an actor sees their own) ----
#[client_visibility_filter]
const AUDIT_PATIENT: Filter =
    Filter::Sql("SELECT a.* FROM audit_log a WHERE a.patient_identity = :sender");
#[client_visibility_filter]
const AUDIT_ACTOR: Filter =
    Filter::Sql("SELECT a.* FROM audit_log a WHERE a.actor_identity = :sender");
