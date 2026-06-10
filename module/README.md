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

## Security note — RLS read-enforcement (owner-scoping ON; caregiver join deferred)

**Write-path authorization IS enforced.** Every mutating reducer calls `auth.rs`
before touching a row: a caller may only mutate rows it owns (or where an accepted
`caregiver_links` row grants sufficient `view`/`log`/`manage` access), and the
`record_*` reducers require an allowlisted service identity. Scheduled reducers
require `ctx.sender() == ctx.database_identity()` so a client cannot spoof a tick.

**Read-path (RLS) — owner-scoping IS enforced.** `src/rls.rs` defines
`#[client_visibility_filter]` rules and `mod rls;` is compiled with the `unstable`
feature. Verified on spacetimedb 2.4.1 (both local and maincloud): simple
self-scoping filters (`WHERE owner_identity = :sender`) both **apply** (the
subscription's `SubscribeApplied` fires) and **enforce** (a different identity
subscribing to the same table receives zero rows). So a subscribing client can read
only its own `profiles`/`medications`/`doses`/`side_effects`/`scans`/
`interactions_cache`/`appointments`/`recall_alerts`/`push_subscriptions` rows, plus
its own `caregiver_links` (as either party).

**Known limitation — caregiver cross-user read view is deferred.** The earlier
JOIN-based caregiver filters (`... JOIN caregiver_links ... WHERE caregiver_identity
= :sender`) break the websocket subscription path in 2.4.1 (`SubscribeApplied` never
fires → clients hang). They are therefore omitted. Consequence: with owner-scoping
RLS on, a caregiver subscribing to a *patient's* tables receives nothing — the
caregiver dashboard's cross-user read view does not function until SpacetimeDB ships
working join RLS (then re-add the `*_CAREGIVER` filters, which are kept in git
history) or until caregiver reads are mediated server-side via the service identity.
Caregiver invites/links themselves still work (the link filters are simple).
This is the right trade for PHI safety: owner isolation is the critical property.

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
