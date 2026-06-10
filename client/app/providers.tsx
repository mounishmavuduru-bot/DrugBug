"use client";

import { useMemo } from "react";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { buildConnection } from "@/lib/db";

/**
 * Wraps the app in the SpacetimeDB realtime context. The connection builder is
 * constructed once on the client (it touches localStorage for token resume).
 *
 * Auth model (PRD §15): the baseline identity is SpacetimeDB's per-device
 * cryptographic token, persisted for stable identity across reloads. To enable
 * cross-device OIDC accounts + MFA, pass the provider's id-token into
 * `buildConnection(oidcToken)` here (Clerk/SpacetimeAuth) — a config change, not
 * a rewrite, since every reducer already authorizes on `ctx.sender()`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const connectionBuilder = useMemo(() => buildConnection(), []);
  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}
