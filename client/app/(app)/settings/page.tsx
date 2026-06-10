"use client";

import { useMemo } from "react";
import { UserPlus } from "lucide-react";
import Link from "next/link";

import {
  useMyIdentity,
  useMyProfile,
  useConnected,
  useCaregiverLinks,
} from "@/lib/hooks";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { ProfileSection } from "@/components/settings/profile-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { PrivacySection } from "@/components/settings/privacy-section";
import { CaregiverEntry } from "@/components/settings/caregiver-entry";
import { AboutSection } from "@/components/settings/about-section";

export default function SettingsPage() {
  const connected = useConnected();
  const me = useMyIdentity();
  const { profile, ready: profileReady } = useMyProfile();
  const { asCaregiver, asPatient, ready: linksReady } = useCaregiverLinks();

  // `asPatient` includes pending/revoked rows; count accepted people caring for me.
  const patientCount = useMemo(
    () => asPatient.filter((l) => l.status === "accepted").length,
    [asPatient]
  );
  const caregiverCount = asCaregiver.length;

  const header = (
    <header className="border-b border-rule-strong pb-5">
      <p className="label-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        Account
      </p>
      <h1 className="mt-2 font-display text-[2.4rem] leading-[1.05] tracking-tight text-ink">
        Settings
      </h1>
      <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted">
        Edit the details DrugBug uses to check your doses, turn dose reminders on or off,
        and manage who can see your record.
      </p>
    </header>
  );

  // ---- connection gating (loading) ----
  if (!connected || !me || !profileReady) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingState rows={3} label="Connecting to DrugBug" />
      </div>
    );
  }

  // ---- no profile yet (empty) ----
  if (!profile) {
    return (
      <div className="space-y-6 pb-8">
        {header}
        <EmptyState
          icon={UserPlus}
          title="No profile yet"
          description="Set up your profile so dose checks, interaction warnings, and reminders work for you."
          action={
            <Link
              href="/today"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Set up profile
            </Link>
          }
        />
        <NotificationsSection me={me} />
        <PrivacySection />
        <AboutSection />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {header}

      <ProfileSection me={me} profile={profile} />

      <NotificationsSection me={me} />

      <CaregiverEntry
        patientCount={linksReady ? patientCount : 0}
        caregiverCount={linksReady ? caregiverCount : 0}
      />

      <PrivacySection />

      <AboutSection />
    </div>
  );
}
