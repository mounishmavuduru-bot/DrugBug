"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar, BottomBar } from "@/components/app/nav";
import { LoadingState } from "@/components/shared/states";
import { useConnected, useMyProfile } from "@/lib/hooks";

/**
 * App chrome + gates. Waits for the realtime connection, then ensures a profile
 * exists (PRD §4 "all onboarding is real"). No profile → redirect to /welcome.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const connected = useConnected();
  const { profile, ready } = useMyProfile();

  useEffect(() => {
    if (connected && ready && !profile) router.replace("/welcome");
  }, [connected, ready, profile, router]);

  if (!connected || !ready) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoadingState label="Connecting to DrugBug…" />
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
