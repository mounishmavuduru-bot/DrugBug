"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { Sidebar, BottomBar, Wordmark } from "@/components/app/nav";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/lib/hooks";
import { identityHex, STDB } from "@/lib/db";

/**
 * App chrome + gates. Waits for the realtime connection, then ensures a profile
 * exists (PRD §4 — onboarding is real). No profile → /welcome. Surfaces
 * connection state instead of hanging forever.
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
        <div className="w-full max-w-sm">
          <Wordmark className="mb-8" />
          <p className="font-display text-2xl text-ink">Connecting your record…</p>
          <p className="mt-1.5 text-sm text-muted">
            Syncing your medications across your devices. This is usually instant.
          </p>
          <div className="mt-6 h-px w-full overflow-hidden bg-rule">
            <div className="h-full w-1/3 animate-pulse bg-brand" />
          </div>

          {(slow || err) && (
            <div className="mt-6 rounded-[var(--radius-md)] border border-rule bg-surface p-4 text-xs text-muted">
              <p className="mb-2 label-mono uppercase tracking-[0.12em] text-faint">Connection status</p>
              <dl className="label-mono space-y-1">
                <div className="flex justify-between gap-4"><dt>server</dt><dd className="text-ink">{STDB.db}</dd></div>
                <div className="flex justify-between gap-4"><dt>websocket</dt><dd className="text-ink">{connected ? "active" : "connecting"}</dd></div>
                <div className="flex justify-between gap-4"><dt>data synced</dt><dd className="text-ink">{String(ready)}</dd></div>
                <div className="flex justify-between gap-4"><dt>identity</dt><dd className="text-ink">{identityHex(conn.identity).slice(0, 12) || "—"}</dd></div>
                {err ? <div className="pt-1 text-danger">error: {err}</div> : null}
              </dl>
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => window.location.reload()}>
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
      <div className="grid min-h-dvh place-items-center px-6">
        <p className="font-display text-2xl text-ink">Setting up your account…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile header */}
        <header className="flex items-center justify-between border-b border-rule px-4 py-3 md:hidden">
          <Wordmark />
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-12">
          {children}
        </main>
      </div>
      <BottomBar />
    </div>
  );
}
