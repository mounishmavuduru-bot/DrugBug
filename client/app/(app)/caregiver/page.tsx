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
    <div className="space-y-6">
      <header className="border-b border-rule-strong pb-5">
        <p className="label-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          Shared care
        </p>
        <h1 className="mt-2 font-display text-[2.4rem] leading-[1.05] tracking-tight text-ink">
          Caregiver
        </h1>
        <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted">
          Follow another person&apos;s doses and alerts, or hand a family member the same
          view of yours. What they can do depends on the access level you grant.
        </p>
      </header>

      {/* Section toggle — a quiet ruled segmented control, not a shadowed pill row.
          No Tabs primitive in the foundation, so this is a hand-built accessible tablist. */}
      <div
        role="tablist"
        aria-label="Caregiver sections"
        className="inline-flex rounded-[var(--radius-sm)] border border-rule-strong bg-surface p-0.5"
      >
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
                "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ease-[var(--ease)]",
                active
                  ? "bg-brand text-brand-ink"
                  : "text-muted hover:text-ink"
              )}
            >
              <Icon className="size-3.5" strokeWidth={1.75} />
              {t.label}
            </button>
          );
        })}
      </div>

      {!connected ? (
        <ErrorState
          title="Not connected"
          description="The realtime link dropped. Caregiver links and patient summaries will load once it reconnects."
        />
      ) : !ready ? (
        <LoadingState rows={3} label="Loading caregiver links…" />
      ) : tab === "caregiver" ? (
        <section
          role="tabpanel"
          id="panel-caregiver"
          aria-labelledby="tab-caregiver"
          className="space-y-4"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-1.5">
            <h2 className="text-xl">Patients you care for</h2>
            {patients.length > 0 ? (
              <span className="label-mono shrink-0 text-[11px] uppercase tracking-[0.12em] text-faint">
                <span className="tnum">{patients.length}</span>{" "}
                {patients.length === 1 ? "person" : "people"}
              </span>
            ) : null}
          </div>

          {patients.length === 0 ? (
            <EmptyState
              icon={HeartHandshake}
              title="No patients yet"
              description="When someone invites you and you accept their link ID under “My caregivers,” their dashboard shows up here — adherence, open alerts, and today's doses."
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
        <section role="tabpanel" id="panel-patient" aria-labelledby="tab-patient">
          <MyCaregiversList links={asPatient} />
        </section>
      )}
    </div>
  );
}
