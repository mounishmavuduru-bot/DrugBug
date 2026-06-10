# DrugBug client foundation — API reference for screen builders

This file is the contract for building screens. The foundation below is **already
built and typechecks**. Build screens on top of it. **Do not modify** anything in
`lib/` (except adding NEW files), `components/ui/`, `components/shared/`,
`app/globals.css`, `app/layout.tsx`, `app/providers.tsx`, or the generated
`lib/spacetime/` bindings.

## Stack rules (Next.js 16 + React 19 + Tailwind v4)

- Every screen that reads realtime data or uses hooks is a **client component**:
  put `"use client"` at the top.
- Dynamic route params are async on the server. For `meds/[id]`, make the page a
  client component and read the id with `useParams()` from `next/navigation`
  (`const { id } = useParams<{ id: string }>()`). Do **not** use synchronous
  `params` props.
- Tailwind v4: colors are theme tokens — use `bg-surface`, `text-muted`,
  `border-border`, `text-primary`, `bg-danger`, etc. (see palette below). No
  `tailwind.config.js`; tokens live in `app/globals.css`.
- Icons: `lucide-react` only. **No emojis in UI** (PRD §17).
- Drug names + doses render in mono: add `className="mono"`.
- Every screen needs loading / empty / error states (PRD §18) — use the shared
  state components.
- Mobile-first; correct at 375×812 and scales up. Main content is already wrapped
  in a centered `max-w-3xl` container by `app/(app)/layout.tsx`.

## Design tokens (already in globals.css)

Palette: `background #0A0E1A`, `surface`, `elevated`, `primary #06B6D4`,
`success`, `warning`, `danger`, `text`, `muted`, `border`. Severity: monitor
(yellow) / caution (orange) / contraindicated (red).

## UI primitives (import and use; do not recreate)

```ts
import { Button } from "@/components/ui/button";          // variant: primary|secondary|ghost|danger|outline; size: sm|md|lg|icon
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";             // variant: neutral|primary|success|warning|danger
import { Input, Textarea, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";             // <Modal open onClose title>...</Modal>
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { ConfidenceBar, SourceTag } from "@/components/shared/confidence";
import { SeverityBadge, severityColor } from "@/components/shared/severity";
```

## Data hooks (import from `@/lib/hooks`)

All return live data via SpacetimeDB subscriptions and are already identity-scoped.

```ts
useMyIdentity(): Identity | undefined
useConnected(): boolean
useMyProfile(): { profile?, ready }            // profile fields camelCase: fullName, dateOfBirth, weightKg, conditions, allergies, pgxPhenotypes, pgxConsent
useMyMeds(): { meds, ready }                   // Medication rows
usePatientMeds(patient?): { meds, ready }
useDoses(owner?): { doses, ready }             // Dose rows
useSideEffects(owner?): { sideEffects, ready }
useScans(): { scans, ready }                   // newest-first
useInteractions(owner?): { cache, ready }      // single InteractionsCache row (or undefined)
useRecalls(owner?): { recalls, ready }
useAppointments(): { appointments, ready }
useCaregiverLinks(): { asCaregiver, asPatient, ready }
```

Row field names are **camelCase** (e.g. `medId`, `ownerIdentity`, `scheduledAt`,
`takenAt`, `dosesRemaining`, `isOtc`, `scheduleTimes`, `idConfidence`,
`authLayers`). `u64` ids are `bigint`. `Timestamp` values: use helpers below.

## Time / format helpers (`@/lib/format`)

```ts
tsToDate(ts): Date | null
toTs(date): Timestamp            // for reducer args of type Timestamp
clockTime(date), dayLabel(date), relativeTo(date), countdown(date)
doseStatusStyle[status] -> { label, variant }   // status: pending|taken|missed|skipped|late
```

## Calling reducers (mutations)

Use the React hook `useReducer` from `spacetimedb/react`, passing the reducer def
from `reducers`. It returns an async fn taking a **single object** of camelCase
args. Always wrap in try/catch (errors surface reducer `Err(String)`).

```ts
import { useReducer } from "spacetimedb/react";
import { reducers } from "@/lib/db";

const addMed = useReducer(reducers.addMedication);
await addMed({ owner: myIdentity, name, genericName, rxnormCode, strength, form,
  scheduleTimes, scheduleDays /* number[] */, prn, prescriber, pharmacy, ndc,
  refillDate /* Timestamp */, dosesRemaining /* number */, isOtc });
```

Available reducers (camelCase accessor → args). For "owner-scoped" reducers pass
your own identity (caregivers pass the patient's):

- `createProfile({ fullName, dateOfBirth, weightKg, conditions, allergies })`
- `updateProfile({ owner, fullName, dateOfBirth, weightKg, conditions, allergies })`
- `setPgxConsent({ consent })`
- `addMedication({ owner, name, genericName, rxnormCode, strength, form, scheduleTimes, scheduleDays, prn, prescriber, pharmacy, ndc, refillDate, dosesRemaining, isOtc })`
- `updateMedication({ medId, ...same fields as add minus owner })`
- `deactivateMedication({ medId })`
- `generateDoseSchedule({ medId })`
- `logDose({ doseId, status, notes })`  // status: taken|missed|skipped|late|pending
- `logSideEffect({ owner, medId /* bigint | undefined (Option) */, symptom, severity /* 1..5 */, loggedAt })`
- `enqueueScan({ imageRef, scanType })` // scanType: bottle|pill|barcode
- `acknowledgeRecall({ alertId })`
- `inviteCaregiver({ caregiverEmail, accessLevel })` // accessLevel: view|log|manage
- `acceptCaregiverLink({ linkId })`
- `revokeCaregiverLink({ linkId })`
- `registerPushSubscription({ endpoint, keys /* JSON string */, platform })`
- `removePushSubscription({ subId })`
- `createAppointment({ owner, providerName, providerType, scheduledFor })`
- `attachBrief({ apptId, briefRef })`

Note `record*`/`setPgxPhenotypes`/`failScan` are service-only — never called from the client.

## Inference service client (`@/lib/inference-client`)

```ts
searchDrugs(q) -> { results: DrugSuggestion[] }                 // RxNorm autocomplete
checkInteractions(rxcuis, identityHex) -> InteractionReport     // pre-commit, { pairs, cascades, hasMajor, modelVersion, kbVersion }
recomputeInteractions(identityHex)                              // writes back -> arrives via useInteractions
submitScan({ scanId, identityHex, scanType, image: Blob })      // writes back -> arrives via useScans
generateBrief({ identityHex, apptId?, providerType? }) -> { briefRef }
uploadGenotype({ identityHex, file }) ; getPgxFlags(identityHex) -> { flags, caveat }
adherenceForecast(identityHex) -> { forecasts: {doseId, scheduledAt, pMiss}[] }
sideEffectPatterns(identityHex) -> { patterns: {medication, symptom, r, n, lagHours}[] }
```

Use `identityHex(myIdentity)` from `@/lib/db` to get the hex string.

## Missed-Dose Recovery (`@/lib/missed-dose`)

```ts
recoveryGuidance({ genericName, name, atcClass? }) -> RecoveryGuidance
// { klass, title, steps[], neverDouble, flagPrescriber, callPharmacist:true }
```

Deterministic — render its `steps`, plus a one-tap "Call pharmacist" action.

## Web push (`@/lib/push`)

```ts
pushSupported(); subscribeWebPush() -> WebPushSub | null; unsubscribeWebPush()
// After subscribeWebPush(), persist via registerPushSubscription({ endpoint, keys: JSON.stringify(keys), platform: "web" })
```

## Disclaimer requirement

Every clinical-adjacent output (interactions, pill ID, counterfeit verdict, PGx)
must show "Decision-support — confirm with your pharmacist or prescriber" and a
visible confidence where applicable (PRD §5/§16/§18).
