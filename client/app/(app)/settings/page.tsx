"use client";

import { useMemo } from "react";
import { Settings as SettingsIcon, UserPlus } from "lucide-react";
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
    <header className="flex items-center gap-2">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <SettingsIcon className="size-5 text-primary" /> Settings
      </h1>
    </header>
  );

  // ---- connection gating ----
  if (!connected || !me || !profileReady) {
    return <LoadingState label="Connecting to DrugBug…" />;
  }

  // ---- no profile yet ----
  if (!profile) {
    return (
      <div className="space-y-5 pb-8">
        {header}
        <EmptyState
          icon={UserPlus}
          title="Set up your profile"
          description="Create your profile to manage your medication safety settings."
          action={
            <Link href="/today" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Get started
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
    <div className="space-y-6 pb-8">
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
