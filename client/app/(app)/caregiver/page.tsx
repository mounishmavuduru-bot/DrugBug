"use client";

import { useMemo, useState } from "react";
import { HeartHandshake, Users } from "lucide-react";

import { useConnected, useCaregiverLinks } from "@/lib/hooks";
import { cn } from "@/lib/utils";

import { LoadingState, EmptyState, ErrorState } from "@/components/shared/states";
import { MyCaregiversList } from "@/components/caregiver/my-caregivers-list";
import { PatientDashboardCard } from "@/components/caregiver/patient-dashboard-card";

type Tab = "caregiver" | "patient";

const TABS: { id: Tab; label: string; icon: typeof HeartHandshake }[] = [
  { id: "caregiver", label: "I'm a caregiver", icon: HeartHandshake },
  { id: "patient", label: "My caregivers", icon: Users },
];

export default function CaregiverPage() {
  const connected = useConnected();
  const { asCaregiver, asPatient, ready } = useCaregiverLinks();
  const [tab, setTab] = useState<Tab>("caregiver");

  // Caregiver-side links are already filtered to `accepted` by the hook. Show the
  // patients I actively care for, newest link first so the latest addition leads.
  const patients = useMemo(
    () => [...asCaregiver].sort((a, b) => Number(b.linkId - a.linkId)),
    [asCaregiver]
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Caregiver</h1>
        <p className="text-xs text-muted">
          Care for someone else&apos;s medications, or invite caregivers to help with yours. Changes
          sync in realtime across every device.
        </p>
      </header>

      {/* Section toggle (no Tabs primitive in the foundation — accessible tablist). */}
      <div role="tablist" aria-label="Caregiver sections" className="flex gap-1 rounded-[var(--radius)] border border-border bg-surface p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              id={`tab-${t.id}`}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 py-2 text-xs font-medium transition-fast",
                active
                  ? "bg-elevated text-text shadow-sm"
                  : "text-muted hover:text-text"
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {!connected ? (
        <ErrorState
          title="Not connected"
          description="We lost the realtime connection. Caregiver links and patient summaries can't load until it's back."
        />
      ) : !ready ? (
        <LoadingState label="Loading caregiver links…" />
      ) : tab === "caregiver" ? (
        <section
          role="tabpanel"
          id="panel-caregiver"
          aria-labelledby="tab-caregiver"
          className="space-y-4"
        >
          <div>
            <h2 className="text-sm font-semibold text-text">Patients you care for</h2>
            <p className="text-xs text-muted">
              Live adherence and active alerts for everyone who has accepted your help.
            </p>
          </div>

          {patients.length === 0 ? (
            <EmptyState
              icon={HeartHandshake}
              title="No patients yet"
              description="When someone invites you and you accept their link ID under “My caregivers,” their dashboard appears here."
            />
          ) : (
            <div className="space-y-4">
              {patients.map((link) => (
                <PatientDashboardCard key={link.linkId.toString()} link={link} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section
          role="tabpanel"
          id="panel-patient"
          aria-labelledby="tab-patient"
        >
          <MyCaregiversList links={asPatient} />
        </section>
      )}
    </div>
  );
}
