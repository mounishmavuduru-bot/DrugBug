//! DrugBug reducers (PRD §8). Every mutation authorizes on `ctx.sender()` via
//! `auth.rs`. `record_*` reducers are service-identity-only writebacks from the
//! Inference Service. Owner-scoped reducers take an explicit `owner: Identity` so
//! an authorized caregiver can act on a patient's behalf (the patient passes
//! their own identity).

use spacetimedb::{Identity, ReducerContext, Table, Timestamp};

use crate::auth::{require_access, require_service, Access};
use crate::tables::*;
use crate::util::{audit, materialize_doses};

// ============================================================
//  SERVICE BOOTSTRAP (PRD §8 allowlist, §15 least-privilege)
// ============================================================

/// Grant a service identity. Callable by anyone ONLY while the allowlist is empty
/// (first deploy claims authority); thereafter only an existing service identity
/// may add another. Run once after publish with the Inference Service's identity.
#[spacetimedb::reducer]
pub fn grant_service_identity(
    ctx: &ReducerContext,
    identity: Identity,
    label: String,
) -> Result<(), String> {
    let empty = ctx.db.service_identity().iter().next().is_none();
    if !empty && ctx.db.service_identity().identity().find(ctx.sender()).is_none() {
        return Err("forbidden: only an existing service identity may grant another".into());
    }
    if ctx.db.service_identity().identity().find(identity).is_some() {
        return Ok(());
    }
    ctx.db.service_identity().insert(ServiceIdentity {
        identity,
        label,
        granted_at: ctx.timestamp,
    });
    Ok(())
}

// ============================================================
//  PROFILE
// ============================================================

#[spacetimedb::reducer]
pub fn create_profile(
    ctx: &ReducerContext,
    full_name: String,
    date_of_birth: Timestamp,
    weight_kg: f64,
    conditions: Vec<String>,
    allergies: Vec<String>,
) -> Result<(), String> {
    if ctx.db.profiles().identity().find(ctx.sender()).is_some() {
        return Err("profile already exists".into());
    }
    ctx.db.profiles().insert(Profile {
        identity: ctx.sender(),
        full_name,
        date_of_birth,
        weight_kg,
        conditions,
        allergies,
        pgx_phenotypes: String::new(),
        pgx_consent: false,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[spacetimedb::reducer]
pub fn update_profile(
    ctx: &ReducerContext,
    owner: Identity,
    full_name: String,
    date_of_birth: Timestamp,
    weight_kg: f64,
    conditions: Vec<String>,
    allergies: Vec<String>,
) -> Result<(), String> {
    require_access(ctx, owner, Access::Manage)?;
    let mut p = ctx
        .db
        .profiles()
        .identity()
        .find(owner)
        .ok_or("profile not found")?;
    p.full_name = full_name;
    p.date_of_birth = date_of_birth;
    p.weight_kg = weight_kg;
    p.conditions = conditions;
    p.allergies = allergies;
    ctx.db.profiles().identity().update(p);
    audit(ctx, owner, "update_profile", String::new());
    Ok(())
}

#[spacetimedb::reducer]
pub fn set_pgx_consent(ctx: &ReducerContext, consent: bool) -> Result<(), String> {
    // PGx consent is personal and non-delegable: only the data subject may set it.
    let mut p = ctx
        .db
        .profiles()
        .identity()
        .find(ctx.sender())
        .ok_or("profile not found")?;
    p.pgx_consent = consent;
    if !consent {
        // Revoking consent clears derived phenotypes (PRD §10.4 revocable).
        p.pgx_phenotypes = String::new();
    }
    ctx.db.profiles().identity().update(p);
    Ok(())
}

/// Service writeback: store CPIC phenotypes after PharmCAT (field-level encrypted
/// by the service before this call). Rejected unless the subject has consented.
#[spacetimedb::reducer]
pub fn set_pgx_phenotypes(
    ctx: &ReducerContext,
    owner: Identity,
    phenotypes_json: String,
) -> Result<(), String> {
    require_service(ctx)?;
    let mut p = ctx
        .db
        .profiles()
        .identity()
        .find(owner)
        .ok_or("profile not found")?;
    if !p.pgx_consent {
        return Err("pgx consent not granted".into());
    }
    p.pgx_phenotypes = phenotypes_json;
    ctx.db.profiles().identity().update(p);
    Ok(())
}

// ============================================================
//  MEDICATIONS
// ============================================================

#[allow(clippy::too_many_arguments)]
#[spacetimedb::reducer]
pub fn add_medication(
    ctx: &ReducerContext,
    owner: Identity,
    name: String,
    generic_name: String,
    rxnorm_code: String,
    strength: String,
    form: String,
    schedule_times: Vec<String>,
    schedule_days: Vec<u8>,
    prn: bool,
    prescriber: String,
    pharmacy: String,
    ndc: String,
    refill_date: Timestamp,
    doses_remaining: i32,
    is_otc: bool,
) -> Result<(), String> {
    require_access(ctx, owner, Access::Manage)?;
    let med = ctx.db.medications().insert(Medication {
        med_id: 0,
        owner_identity: owner,
        name,
        generic_name,
        rxnorm_code,
        strength,
        form,
        schedule_times,
        schedule_days,
        prn,
        prescriber,
        pharmacy,
        ndc,
        refill_date,
        doses_remaining,
        is_otc,
        active: true,
        last_scan_id: 0,
        created_at: ctx.timestamp,
    });
    materialize_doses(ctx, &med);
    audit(ctx, owner, "add_medication", med.name.clone());
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[spacetimedb::reducer]
pub fn update_medication(
    ctx: &ReducerContext,
    med_id: u64,
    name: String,
    generic_name: String,
    rxnorm_code: String,
    strength: String,
    form: String,
    schedule_times: Vec<String>,
    schedule_days: Vec<u8>,
    prn: bool,
    prescriber: String,
    pharmacy: String,
    ndc: String,
    refill_date: Timestamp,
    doses_remaining: i32,
    is_otc: bool,
) -> Result<(), String> {
    let mut med = ctx
        .db
        .medications()
        .med_id()
        .find(med_id)
        .ok_or("medication not found")?;
    require_access(ctx, med.owner_identity, Access::Manage)?;

    med.name = name;
    med.generic_name = generic_name;
    med.rxnorm_code = rxnorm_code;
    med.strength = strength;
    med.form = form;
    med.schedule_times = schedule_times;
    med.schedule_days = schedule_days;
    med.prn = prn;
    med.prescriber = prescriber;
    med.pharmacy = pharmacy;
    med.ndc = ndc;
    med.refill_date = refill_date;
    med.doses_remaining = doses_remaining;
    med.is_otc = is_otc;
    let med = ctx.db.medications().med_id().update(med);

    // Schedule may have changed: drop untaken future doses, then re-materialize.
    clear_future_pending(ctx, med_id);
    materialize_doses(ctx, &med);
    audit(ctx, med.owner_identity, "update_medication", med.name.clone());
    Ok(())
}

#[spacetimedb::reducer]
pub fn deactivate_medication(ctx: &ReducerContext, med_id: u64) -> Result<(), String> {
    let mut med = ctx
        .db
        .medications()
        .med_id()
        .find(med_id)
        .ok_or("medication not found")?;
    require_access(ctx, med.owner_identity, Access::Manage)?;
    med.active = false;
    let owner = med.owner_identity;
    let name = med.name.clone();
    ctx.db.medications().med_id().update(med);
    clear_future_pending(ctx, med_id);
    audit(ctx, owner, "deactivate_medication", name);
    Ok(())
}

/// Explicit (re)materialization trigger (PRD §8 generate_dose_schedule).
#[spacetimedb::reducer]
pub fn generate_dose_schedule(ctx: &ReducerContext, med_id: u64) -> Result<(), String> {
    let med = ctx
        .db
        .medications()
        .med_id()
        .find(med_id)
        .ok_or("medication not found")?;
    require_access(ctx, med.owner_identity, Access::Log)?;
    materialize_doses(ctx, &med);
    Ok(())
}

/// Delete untaken future doses for a med (used on schedule change/deactivate).
fn clear_future_pending(ctx: &ReducerContext, med_id: u64) {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let stale: Vec<u64> = ctx
        .db
        .doses()
        .med_id()
        .filter(med_id)
        .filter(|d| d.status == "pending" && d.scheduled_at.to_micros_since_unix_epoch() > now)
        .map(|d| d.dose_id)
        .collect();
    for id in stale {
        ctx.db.doses().dose_id().delete(id);
    }
}

// ============================================================
//  DOSES
// ============================================================

#[spacetimedb::reducer]
pub fn log_dose(
    ctx: &ReducerContext,
    dose_id: u64,
    status: String,
    notes: String,
) -> Result<(), String> {
    let mut dose = ctx
        .db
        .doses()
        .dose_id()
        .find(dose_id)
        .ok_or("dose not found")?;
    require_access(ctx, dose.owner_identity, Access::Log)?;

    let valid = matches!(status.as_str(), "taken" | "missed" | "skipped" | "late" | "pending");
    if !valid {
        return Err("invalid dose status".into());
    }

    let was_taken = dose.status == "taken" || dose.status == "late";
    let now_taken = status == "taken" || status == "late";

    dose.status = status.clone();
    dose.notes = notes;
    dose.logged_by = ctx.sender();
    dose.taken_at = if now_taken { Some(ctx.timestamp) } else { None };
    let owner = dose.owner_identity;
    let med_id = dose.med_id;
    ctx.db.doses().dose_id().update(dose);

    // Decrement remaining count on transition into a "taken" state; restore on
    // transition out (PRD §9.5 doses_remaining drives refill prediction).
    if now_taken != was_taken {
        if let Some(mut med) = ctx.db.medications().med_id().find(med_id) {
            med.doses_remaining += if now_taken { -1 } else { 1 };
            ctx.db.medications().med_id().update(med);
        }
    }
    audit(ctx, owner, "log_dose", format!("dose {dose_id} -> {status}"));
    Ok(())
}

// ============================================================
//  SIDE EFFECTS
// ============================================================

#[spacetimedb::reducer]
pub fn log_side_effect(
    ctx: &ReducerContext,
    owner: Identity,
    med_id: Option<u64>,
    symptom: String,
    severity: u8,
    logged_at: Timestamp,
) -> Result<(), String> {
    require_access(ctx, owner, Access::Log)?;
    if !(1..=5).contains(&severity) {
        return Err("severity must be 1..5".into());
    }
    ctx.db.side_effects().insert(SideEffect {
        effect_id: 0,
        owner_identity: owner,
        med_id,
        symptom,
        severity,
        logged_at,
    });
    audit(ctx, owner, "log_side_effect", String::new());
    Ok(())
}

// ============================================================
//  SCANS (PRD §10.1)
// ============================================================

/// User enqueues a scan so the UI shows "processing" immediately via realtime;
/// the Inference Service then fills the result via `record_scan_result`.
#[spacetimedb::reducer]
pub fn enqueue_scan(
    ctx: &ReducerContext,
    image_ref: String,
    scan_type: String,
) -> Result<(), String> {
    ctx.db.scans().insert(Scan {
        scan_id: 0,
        owner_identity: ctx.sender(),
        image_ref,
        scan_type,
        identified_drug: String::new(),
        identified_ndc: String::new(),
        id_confidence: 0.0,
        authenticity: String::new(),
        auth_layers: "{}".into(),
        raw_analysis: "{}".into(),
        status: "queued".into(),
        created_at: ctx.timestamp,
    });
    Ok(())
}

/// Service writeback after the full vision + verification pipeline completes.
#[allow(clippy::too_many_arguments)]
#[spacetimedb::reducer]
pub fn record_scan_result(
    ctx: &ReducerContext,
    scan_id: u64,
    identified_drug: String,
    identified_ndc: String,
    id_confidence: f64,
    authenticity: String,
    auth_layers: String,
    raw_analysis: String,
) -> Result<(), String> {
    require_service(ctx)?;
    let mut scan = ctx
        .db
        .scans()
        .scan_id()
        .find(scan_id)
        .ok_or("scan not found")?;
    scan.identified_drug = identified_drug;
    scan.identified_ndc = identified_ndc;
    scan.id_confidence = id_confidence;
    scan.authenticity = authenticity;
    scan.auth_layers = auth_layers;
    scan.raw_analysis = raw_analysis;
    scan.status = "complete".into();
    ctx.db.scans().scan_id().update(scan);
    Ok(())
}

#[spacetimedb::reducer]
pub fn fail_scan(ctx: &ReducerContext, scan_id: u64, reason: String) -> Result<(), String> {
    require_service(ctx)?;
    let mut scan = ctx
        .db
        .scans()
        .scan_id()
        .find(scan_id)
        .ok_or("scan not found")?;
    scan.status = "error".into();
    scan.raw_analysis = format!("{{\"error\":{:?}}}", reason);
    ctx.db.scans().scan_id().update(scan);
    Ok(())
}

// ============================================================
//  INTERACTIONS / CASCADE (PRD §10.2)
// ============================================================

/// Service writeback after KB + GNN + cascade run. Keeps a single latest cache
/// row per owner (delete-then-insert) so clients always read the current set.
#[spacetimedb::reducer]
pub fn record_interaction_result(
    ctx: &ReducerContext,
    owner: Identity,
    pairs: String,
    cascades: String,
    model_version: String,
    kb_version: String,
) -> Result<(), String> {
    require_service(ctx)?;
    let stale: Vec<u64> = ctx
        .db
        .interactions_cache()
        .owner_identity()
        .filter(owner)
        .map(|c| c.cache_id)
        .collect();
    for id in stale {
        ctx.db.interactions_cache().cache_id().delete(id);
    }
    ctx.db.interactions_cache().insert(InteractionsCache {
        cache_id: 0,
        owner_identity: owner,
        pairs,
        cascades,
        model_version,
        kb_version,
        computed_at: ctx.timestamp,
    });
    Ok(())
}

// ============================================================
//  RECALLS (PRD §10.7)
// ============================================================

#[spacetimedb::reducer]
pub fn record_recall_alert(
    ctx: &ReducerContext,
    owner: Identity,
    med_id: u64,
    openfda_recall_id: String,
    severity: String,
    summary: String,
) -> Result<(), String> {
    require_service(ctx)?;
    // Dedupe: skip if this recall id is already on file for this med.
    let dup = ctx
        .db
        .recall_alerts()
        .owner_identity()
        .filter(owner)
        .any(|r| r.med_id == med_id && r.openfda_recall_id == openfda_recall_id);
    if dup {
        return Ok(());
    }
    ctx.db.recall_alerts().insert(RecallAlert {
        alert_id: 0,
        owner_identity: owner,
        med_id,
        openfda_recall_id,
        severity,
        summary,
        acknowledged: false,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[spacetimedb::reducer]
pub fn acknowledge_recall(ctx: &ReducerContext, alert_id: u64) -> Result<(), String> {
    let mut a = ctx
        .db
        .recall_alerts()
        .alert_id()
        .find(alert_id)
        .ok_or("alert not found")?;
    require_access(ctx, a.owner_identity, Access::View)?;
    a.acknowledged = true;
    ctx.db.recall_alerts().alert_id().update(a);
    Ok(())
}

// ============================================================
//  CAREGIVER LINKS (PRD §10.6)
// ============================================================

/// Patient invites a caregiver by email. `caregiver_identity` is seeded with the
/// inviter's identity as an unclaimed placeholder; it is overwritten on accept.
/// Access is never granted until `status == "accepted"`, so the placeholder is
/// inert (see `auth::can_access`).
#[spacetimedb::reducer]
pub fn invite_caregiver(
    ctx: &ReducerContext,
    caregiver_email: String,
    access_level: String,
) -> Result<(), String> {
    if Access::parse(&access_level).is_none() {
        return Err("access_level must be view|log|manage".into());
    }
    ctx.db.caregiver_links().insert(CaregiverLink {
        link_id: 0,
        caregiver_identity: ctx.sender(), // placeholder until accepted
        patient_identity: ctx.sender(),
        caregiver_email,
        access_level,
        status: "pending".into(),
        created_at: ctx.timestamp,
    });
    Ok(())
}

/// Caregiver accepts via a link id delivered in the invite email.
#[spacetimedb::reducer]
pub fn accept_caregiver_link(ctx: &ReducerContext, link_id: u64) -> Result<(), String> {
    let mut link = ctx
        .db
        .caregiver_links()
        .link_id()
        .find(link_id)
        .ok_or("link not found")?;
    if link.status != "pending" {
        return Err("link is not pending".into());
    }
    if link.patient_identity == ctx.sender() {
        return Err("cannot be your own caregiver".into());
    }
    link.caregiver_identity = ctx.sender();
    link.status = "accepted".into();
    let patient = link.patient_identity;
    ctx.db.caregiver_links().link_id().update(link);
    audit(ctx, patient, "accept_caregiver_link", String::new());
    Ok(())
}

#[spacetimedb::reducer]
pub fn revoke_caregiver_link(ctx: &ReducerContext, link_id: u64) -> Result<(), String> {
    let mut link = ctx
        .db
        .caregiver_links()
        .link_id()
        .find(link_id)
        .ok_or("link not found")?;
    // Either party may revoke.
    if link.patient_identity != ctx.sender() && link.caregiver_identity != ctx.sender() {
        return Err("forbidden: not a party to this link".into());
    }
    link.status = "revoked".into();
    let patient = link.patient_identity;
    ctx.db.caregiver_links().link_id().update(link);
    audit(ctx, patient, "revoke_caregiver_link", String::new());
    Ok(())
}

// ============================================================
//  PUSH SUBSCRIPTIONS (PRD §14)
// ============================================================

#[spacetimedb::reducer]
pub fn register_push_subscription(
    ctx: &ReducerContext,
    endpoint: String,
    keys: String,
    platform: String,
) -> Result<(), String> {
    // Replace any existing subscription with the same endpoint for this user.
    let dup: Vec<u64> = ctx
        .db
        .push_subscriptions()
        .owner_identity()
        .filter(ctx.sender())
        .filter(|s| s.endpoint == endpoint)
        .map(|s| s.sub_id)
        .collect();
    for id in dup {
        ctx.db.push_subscriptions().sub_id().delete(id);
    }
    ctx.db.push_subscriptions().insert(PushSubscription {
        sub_id: 0,
        owner_identity: ctx.sender(),
        endpoint,
        keys,
        platform,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[spacetimedb::reducer]
pub fn remove_push_subscription(ctx: &ReducerContext, sub_id: u64) -> Result<(), String> {
    let sub = ctx
        .db
        .push_subscriptions()
        .sub_id()
        .find(sub_id)
        .ok_or("subscription not found")?;
    if sub.owner_identity != ctx.sender() {
        return Err("forbidden".into());
    }
    ctx.db.push_subscriptions().sub_id().delete(sub_id);
    Ok(())
}

// ============================================================
//  APPOINTMENTS (PRD §10.5)
// ============================================================

#[spacetimedb::reducer]
pub fn create_appointment(
    ctx: &ReducerContext,
    owner: Identity,
    provider_name: String,
    provider_type: String,
    scheduled_for: Timestamp,
) -> Result<(), String> {
    require_access(ctx, owner, Access::Manage)?;
    ctx.db.appointments().insert(Appointment {
        appt_id: 0,
        owner_identity: owner,
        provider_name,
        provider_type,
        scheduled_for,
        brief_ref: String::new(),
        created_at: ctx.timestamp,
    });
    Ok(())
}

/// Attach a generated brief reference. Callable by the owner/caregiver OR by the
/// Inference Service (which generates the brief and stores it in object storage).
#[spacetimedb::reducer]
pub fn attach_brief(ctx: &ReducerContext, appt_id: u64, brief_ref: String) -> Result<(), String> {
    let mut a = ctx
        .db
        .appointments()
        .appt_id()
        .find(appt_id)
        .ok_or("appointment not found")?;
    if !crate::auth::is_service(ctx) {
        require_access(ctx, a.owner_identity, Access::Manage)?;
    }
    a.brief_ref = brief_ref;
    ctx.db.appointments().appt_id().update(a);
    Ok(())
}
