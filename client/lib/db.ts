"use client";

// DrugBug ⇄ SpacetimeDB client wiring (PRD §6/§7).
//
// One realtime WebSocket connection per device, managed by the first-party
// React provider (`spacetimedb/react`). Screens never build connections — they
// read live rows with `useTable(tables.X)` and mutate via `useReducer(reducers.Y)`
// or the typed helpers below. Identity/token persistence keeps the same user
// across reloads so SpacetimeDB's RLS + reducer authz resolve to the right rows.

import { DbConnection, tables, reducers } from "@/lib/spacetime";
import { Identity } from "spacetimedb";

export { tables, reducers, DbConnection };

// ---- server target (override per-env via NEXT_PUBLIC_*) ----
const URI =
  process.env.NEXT_PUBLIC_STDB_URI || "wss://maincloud.spacetimedb.com";
const DB = process.env.NEXT_PUBLIC_STDB_DB || "drugbug";

export const STDB = { uri: URI, db: DB } as const;

// ---- token persistence ----
// SpacetimeDB returns a private auth token on first connect (anonymous identity).
// In production this is replaced by an OIDC token (Clerk/SpacetimeAuth, PRD §15);
// see `withToken` below. We persist whichever token we hold so identity is stable.
const TOKEN_KEY = `drugbug:stdb-token:${DB}`;

export function loadToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(TOKEN_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function saveToken(token: string | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage disabled — connection still works, just not resumable */
  }
}

export function clearToken(): void {
  saveToken(undefined);
}

/**
 * Build a configured (not-yet-connected) connection builder for the React
 * provider. `oidcToken` (when present) is the OIDC id-token from the auth
 * provider; otherwise we resume the persisted anonymous token (dev / first run).
 */
export function buildConnection(oidcToken?: string) {
  return DbConnection.builder()
    .withUri(URI)
    .withDatabaseName(DB)
    .withToken(oidcToken ?? loadToken())
    .onConnect((_conn, _identity, token) => saveToken(token));
}

// ---- identity helpers ----
export function identityHex(id?: Identity): string {
  return id ? id.toHexString() : "";
}

export function sameIdentity(a?: Identity, b?: Identity): boolean {
  return !!a && !!b && a.isEqual(b);
}

export function parseIdentity(hex: string): Identity {
  return Identity.fromString(hex);
}
