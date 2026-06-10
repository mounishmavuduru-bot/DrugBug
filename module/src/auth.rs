//! Authorization helpers (PRD §8 "Authorization rule", §15 least-privilege).
//!
//! Write-path enforcement. Every mutating reducer calls one of these before
//! touching a row. Read-path enforcement lives in `rls.rs` (Row-Level Security).

use spacetimedb::{Identity, ReducerContext};

use crate::tables::{caregiver_links, service_identity};

/// Graded caregiver access. Ordering is meaningful: a higher level subsumes the
/// permissions of every lower level.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Access {
    /// read adherence + alerts
    View = 0,
    /// also log doses on the patient's behalf
    Log = 1,
    /// also add/edit meds
    Manage = 2,
}

impl Access {
    pub fn parse(s: &str) -> Option<Access> {
        match s {
            "view" => Some(Access::View),
            "log" => Some(Access::Log),
            "manage" => Some(Access::Manage),
            _ => None,
        }
    }
}

/// True if `ctx.sender()` is an allowlisted service identity (Inference Service).
pub fn is_service(ctx: &ReducerContext) -> bool {
    ctx.db
        .service_identity()
        .identity()
        .find(ctx.sender())
        .is_some()
}

/// Require the caller to be a service identity; used by every `record_*` reducer.
pub fn require_service(ctx: &ReducerContext) -> Result<(), String> {
    if is_service(ctx) {
        Ok(())
    } else {
        Err("forbidden: caller is not an allowlisted service identity".into())
    }
}

/// Does `ctx.sender` hold at least `required` access over `owner`'s data?
/// True when the sender IS the owner, or holds an accepted caregiver link of
/// sufficient level.
pub fn can_access(ctx: &ReducerContext, owner: Identity, required: Access) -> bool {
    if ctx.sender() == owner {
        return true;
    }
    ctx.db
        .caregiver_links()
        .caregiver_identity()
        .filter(ctx.sender())
        .any(|l| {
            l.patient_identity == owner
                && l.status == "accepted"
                && Access::parse(&l.access_level)
                    .map(|a| a >= required)
                    .unwrap_or(false)
        })
}

/// `can_access` as a `Result`, with a uniform error message.
pub fn require_access(
    ctx: &ReducerContext,
    owner: Identity,
    required: Access,
) -> Result<(), String> {
    if can_access(ctx, owner, required) {
        Ok(())
    } else {
        Err("forbidden: insufficient access to this user's data".into())
    }
}
