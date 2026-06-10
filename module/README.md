# DrugBug — SpacetimeDB module (Rust → WASM)

The realtime backbone (PRD §6/§8). This module owns **all** user/transactional
state and pushes it to every subscribed device automatically (patient phone +
caregiver phone always consistent). Heavy ML, vision, and external API calls live
in the Python Inference Service, which writes its results back here through an
allowlisted **service identity** calling the `record_*` reducers.

- `src/lib.rs` — module entrypoint + `init` (seeds the scheduler timers)
- `src/tables.rs` — every `#[table]` (PRD §8)
- `src/reducers.rs` — all CRUD + service-writeback reducers
- `src/auth.rs` — write-path authorization helpers
- `src/rls.rs` — Row-Level Security read filters
- `src/scheduler.rs` — nightly dose-horizon + hourly missed-dose sweep
- `src/util.rs` — dose materialization + audit logging

## Build & publish

Install the SpacetimeDB CLI, start a local instance (or target maincloud), then
build and publish:

```bash
curl -sSf https://install.spacetimedb.com | sh

spacetime start                     # local dev instance (separate terminal)

# from this directory:
spacetime build                     # compiles the Rust module to wasm32-unknown-unknown
spacetime publish drugbug           # deploys the module under the name "drugbug"
```

`Cargo.toml` sets `crate-type = ["cdylib"]` and pins `spacetimedb = "2.4"` with the
`unstable` feature (needed for `client_visibility_filter` / RLS). `chrono` is built
with `default-features = false` (no `clock`) so it compiles cleanly to wasm — the
module never reads the host clock directly; it uses `ctx.timestamp`.

### Generate the TypeScript client bindings

After every publish that changes tables or reducers, regenerate the client SDK
bindings into the client (already committed at `client/lib/spacetime/`):

```bash
spacetime generate --lang typescript \
  --out-dir ../client/lib/spacetime \
  --project-path .
```

## Service-identity bootstrap (`grant_service_identity`)

The Inference Service authenticates to SpacetimeDB as a dedicated identity and
calls the `record_*` / `set_pgx_phenotypes` / `attach_brief` reducers over the
HTTP API. That identity must be **allowlisted once** via `grant_service_identity`.

`grant_service_identity(identity, label)` is callable by **anyone only while the
allowlist (the `service_identity` table) is empty**. After the first grant, only
an existing service identity may grant another. This is the least-privilege
bootstrap from PRD §15: the service identity can call the writeback reducers but
cannot mutate arbitrary user rows.

```bash
# 1) Publish the module (see above).
# 2) Obtain the service identity's hex. Easiest: a dedicated login for the service.
spacetime login
SERVICE_IDENTITY=$(spacetime identity list | awk '/<your service identity>/{print $1}')

# 3) Grant it once (works only while the allowlist is empty).
spacetime call drugbug grant_service_identity "${SERVICE_IDENTITY}" "inference-service"

# 4) Put the service identity's bearer token in inference/.env as
#    SPACETIME_SERVICE_TOKEN, set SPACETIME_HTTP to the https:// host
#    (default https://maincloud.spacetimedb.com) and SPACETIME_DB=drugbug.
```

See `inference/README.md` for the writeback reducer signatures and the SQL-HTTP
read pattern the service uses to fetch a user's meds.

## Security note — RLS read-enforcement is still landing upstream

**Write-path authorization IS enforced today.** Every mutating reducer calls
`auth.rs` before touching a row: a caller may only mutate rows it owns (or where an
accepted `caregiver_links` row grants sufficient `view`/`log`/`manage` access), and
the `record_*` reducers require an allowlisted service identity. The scheduled
reducers additionally require `ctx.sender() == ctx.database_identity()` so a client
cannot spoof a scheduler tick.

**Read-path (RLS) enforcement is NOT yet active — and is currently disabled in the
build.** All tables are declared `public`. The `#[client_visibility_filter]` rules in
`src/rls.rs` are written correctly (owner-sees-own + accepted-caregiver-sees-patient,
`push_subscriptions` self-only), **but they are not compiled**: `mod rls;` is commented
out in `src/lib.rs` and the `unstable` feature is off in `Cargo.toml`. Reason: as of
**spacetimedb 2.4.1** RLS is unstable and **not enforced at runtime**, and worse,
*defining* `client_visibility_filter` rules breaks the websocket subscription path —
`SubscribeApplied` never fires, so clients hang on connect (observed: `isActive:true,
subscription ready:false`). Re-enabling is a two-line change (uncomment `mod rls;` +
restore `features = ["unstable"]`) once upstream ships enforcing RLS.

**Implication for production PHI:** until upstream RLS is enforcing, a subscribing
client could in principle read rows beyond its own. Before handling real PHI in
production you must either (a) run on a SpacetimeDB version with RLS read-enforcement
on, or (b) adopt a server-mediated read pattern (clients read through an authorized
intermediary instead of subscribing directly to the public tables). This is an honest
capability boundary, consistent with PRD §15 (least privilege) and the
credential/GPU-gating posture in the root README.

## Scheduler timers (`src/scheduler.rs`)

Seeded in `init` on first publish:

| Timer | Interval | Reducer | Effect |
|---|---|---|---|
| `dose_horizon_timer` | 24h | `regenerate_dose_horizons` | Re-materializes `doses` rows for every active med over the rolling 30-day window (PRD §8/§9.5). |
| `missed_sweep_timer` | 1h | `sweep_missed_doses` | Flips `pending` doses past a 4h grace window to `missed`, keeping adherence stats + the caregiver dashboard accurate. |

Both scheduled reducers reject any caller other than the module identity.

## Tables (PRD §8)

`service_identity` (writeback allowlist), `profiles`, `caregiver_links`,
`medications`, `doses`, `side_effects`, `scans`, `interactions_cache`,
`appointments`, `recall_alerts`, `push_subscriptions`, `audit_log`, plus the two
scheduler timer tables (`dose_horizon_timer`, `missed_sweep_timer`). All
user-facing tables are owner-scoped on an OIDC `Identity`.

## Reducers (PRD §8)

**User CRUD / logic** (authorized on `ctx.sender` via `auth.rs`):
`create_profile`, `update_profile`, `set_pgx_consent`, `add_medication`,
`update_medication`, `deactivate_medication`, `generate_dose_schedule`, `log_dose`,
`log_side_effect`, `enqueue_scan`, `acknowledge_recall`, `invite_caregiver`,
`accept_caregiver_link`, `revoke_caregiver_link`, `register_push_subscription`,
`remove_push_subscription`, `create_appointment`.

**Service-only** (require an allowlisted service identity):
`record_scan_result`, `fail_scan`, `record_interaction_result`,
`record_recall_alert`, `set_pgx_phenotypes`, `attach_brief`.
`set_pgx_phenotypes` is additionally rejected unless the subject has granted PGx
consent.

**Bootstrap:** `grant_service_identity` (see above).

**Scheduled:** `regenerate_dose_horizons`, `sweep_missed_doses`.
