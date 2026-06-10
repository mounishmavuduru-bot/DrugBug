"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { Sidebar, BottomBar } from "@/components/app/nav";
import { LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/lib/hooks";
import { identityHex, STDB } from "@/lib/db";

/**
 * App chrome + gates. Waits for the realtime connection, then ensures a profile
 * exists (PRD §4 "all onboarding is real"). No profile → redirect to /welcome.
 * Surfaces connection state instead of hanging forever, so failures are visible.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const conn = useSpacetimeDB();
  const connected = conn.isActive;
  const { profile, ready } = useMyProfile();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (connected && ready && !profile) router.replace("/welcome");
  }, [connected, ready, profile, router]);

  useEffect(() => {
    if (connected && ready) return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [connected, ready]);

  if (!connected || !ready) {
    const err = conn.connectionError?.message;
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <LoadingState label="Connecting to DrugBug…" />
          {(slow || err) && (
            <div className="w-full rounded-[var(--radius)] border border-border bg-elevated p-3 text-xs text-muted">
              <p className="mb-2 font-medium text-text">Connection diagnostics</p>
              <ul className="space-y-1 mono">
                <li>server: {STDB.uri} / {STDB.db}</li>
                <li>websocket active: {String(connected)}</li>
                <li>subscription ready: {String(ready)}</li>
                <li>identity: {identityHex(conn.identity).slice(0, 16) || "—"}</li>
                {err ? <li className="text-danger">error: {err}</li> : null}
              </ul>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoadingState label="Setting up your account…" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-5 md:pb-10">
          {children}
        </main>
      </div>
      <BottomBar />
    </div>
  );
}
