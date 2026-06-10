"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pill, Plus, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { useMyMeds, useDoses } from "@/lib/hooks";
import { MedCard } from "@/components/med/med-card";
import { cn } from "@/lib/utils";
import type { Medication } from "@/components/med/med-utils";

type Filter = "all" | "active" | "otc" | "rx" | "prn";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "otc", label: "OTC" },
  { key: "rx", label: "Rx" },
  { key: "prn", label: "PRN" },
];

function matchesFilter(med: Medication, filter: Filter): boolean {
  switch (filter) {
    case "active":
      return med.active;
    case "otc":
      return med.isOtc;
    case "rx":
      return !med.isOtc;
    case "prn":
      return med.prn;
    case "all":
    default:
      return true;
  }
}

export default function MedsListPage() {
  const { meds, ready } = useMyMeds();
  const { doses } = useDoses();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meds
      .filter((m) => matchesFilter(m, filter))
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // active first, then alphabetical by name
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [meds, query, filter]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Medications</h1>
          <p className="text-xs text-muted">Your regimen, schedules, and adherence.</p>
        </div>
        <Link href="/meds/add" className={cn(buttonVariants({ variant: "primary" }), "shrink-0")}>
          <Plus className="size-4" /> Add
        </Link>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search medications…"
          className="pl-9"
          aria-label="Search medications"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter medications">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-fast",
              filter === f.key
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-elevated text-muted hover:text-text"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!ready ? (
        <LoadingState label="Loading medications…" />
      ) : meds.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="No medications yet"
          description="Add your first medication by scanning a label or entering it manually."
          action={
            <Link href="/meds/add" className={buttonVariants({ variant: "primary" })}>
              <Plus className="size-4" /> Add medication
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description="Try a different search term or filter."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((med) => (
            <MedCard key={med.medId.toString()} med={med} doses={doses} />
          ))}
        </div>
      )}
    </div>
  );
}
