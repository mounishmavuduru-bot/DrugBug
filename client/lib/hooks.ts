"use client";

// Shared data hooks. Screens use these instead of touching the SDK directly, so
// identity scoping + sorting are consistent everywhere.
//
// Read scoping note (PRD §15): SpacetimeDB RLS read-enforcement is still landing
// upstream (see module/README.md). Until then we scope reads client-side by
// identity. The `.where(...)` subscriptions become server-enforced for free once
// RLS is live — no screen changes required.

import { useMemo } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { Identity } from "spacetimedb";
import { tables } from "@/lib/db";
import { identityHex } from "@/lib/db";

/** The current device/user identity, or undefined before connect. */
export function useMyIdentity(): Identity | undefined {
  const conn = useSpacetimeDB();
  return conn.identity;
}

export function useConnected(): boolean {
  return useSpacetimeDB().isActive;
}

type WithOwner = { ownerIdentity: Identity };

function filterByOwner<T extends WithOwner>(rows: readonly T[], owner?: Identity): T[] {
  if (!owner) return [];
  const hex = identityHex(owner);
  return rows.filter((r) => identityHex(r.ownerIdentity) === hex);
}

/** My medications (active + inactive); caller filters further. */
export function useMyMeds() {
  const me = useMyIdentity();
  const [rows, ready] = useTable(tables.medications);
  const mine = useMemo(() => filterByOwner(rows, me), [rows, me]);
  return { meds: mine, ready };
}

/** Medications owned by a specific patient (caregiver views). */
export function usePatientMeds(patient?: Identity) {
  const [rows, ready] = useTable(tables.medications);
  const list = useMemo(() => filterByOwner(rows, patient), [rows, patient]);
  return { meds: list, ready };
}

/** My doses, optionally a specific patient's. */
export function useDoses(owner?: Identity) {
  const me = useMyIdentity();
  const target = owner ?? me;
  const [rows, ready] = useTable(tables.doses);
  const mine = useMemo(() => filterByOwner(rows, target), [rows, target]);
  return { doses: mine, ready };
}

export function useSideEffects(owner?: Identity) {
  const me = useMyIdentity();
  const target = owner ?? me;
  const [rows, ready] = useTable(tables.side_effects);
  const mine = useMemo(() => filterByOwner(rows, target), [rows, target]);
  return { sideEffects: mine, ready };
}

export function useScans() {
  const me = useMyIdentity();
  const [rows, ready] = useTable(tables.scans);
  const mine = useMemo(() => filterByOwner(rows, me), [rows, me]);
  const sorted = useMemo(
    () =>
      [...mine].sort(
        (a, b) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch)
      ),
    [mine]
  );
  return { scans: sorted, ready };
}

export function useInteractions(owner?: Identity) {
  const me = useMyIdentity();
  const target = owner ?? me;
  const [rows, ready] = useTable(tables.interactions_cache);
  const cache = useMemo(() => filterByOwner(rows, target)[0], [rows, target]);
  return { cache, ready };
}

export function useRecalls(owner?: Identity) {
  const me = useMyIdentity();
  const target = owner ?? me;
  const [rows, ready] = useTable(tables.recall_alerts);
  const mine = useMemo(() => filterByOwner(rows, target), [rows, target]);
  return { recalls: mine, ready };
}

export function useAppointments() {
  const me = useMyIdentity();
  const [rows, ready] = useTable(tables.appointments);
  const mine = useMemo(() => filterByOwner(rows, me), [rows, me]);
  return { appointments: mine, ready };
}

/** My profile row (PK = identity), or undefined if not yet created. */
export function useMyProfile() {
  const me = useMyIdentity();
  const [rows, ready] = useTable(tables.profiles);
  const profile = useMemo(() => {
    if (!me) return undefined;
    const hex = identityHex(me);
    return rows.find((r) => identityHex(r.identity) === hex);
  }, [rows, me]);
  return { profile, ready };
}

/** Caregiver links where I am the caregiver or the patient. */
export function useCaregiverLinks() {
  const me = useMyIdentity();
  const [rows, ready] = useTable(tables.caregiver_links);
  const hex = identityHex(me);
  const asCaregiver = useMemo(
    () => rows.filter((r) => identityHex(r.caregiverIdentity) === hex && r.status === "accepted"),
    [rows, hex]
  );
  const asPatient = useMemo(
    () => rows.filter((r) => identityHex(r.patientIdentity) === hex),
    [rows, hex]
  );
  return { asCaregiver, asPatient, ready };
}
