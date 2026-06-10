"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pill, Plus, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { useMyMeds, useDoses } from "@/lib/hooks";
import { MedRow } from "@/components/med/med-card";
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule-strong pb-5">
        <div>
          <h1 className="font-display text-3xl leading-tight text-ink">Your formulary</h1>
          <p className="mt-1.5 text-sm text-muted">
            Every medication on file, with its schedule and how often you take it on time.
          </p>
        </div>
        <Link href="/meds/add" className={cn(buttonVariants({ variant: "primary", size: "sm" }), "shrink-0")}>
          <Plus aria-hidden /> Add medication
        </Link>
      </header>

      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
            strokeWidth={1.75}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or generic"
            className="pl-9"
            aria-label="Search medications"
          />
        </div>

        <div
          className="inline-flex w-full overflow-hidden rounded-[var(--radius-sm)] border border-rule-strong sm:w-auto"
          role="tablist"
          aria-label="Filter medications"
        >
          {FILTERS.map((f, i) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex-1 px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ease-[var(--ease)] sm:flex-none",
                i > 0 && "border-l border-rule-strong",
                filter === f.key
                  ? "bg-brand text-brand-ink"
                  : "bg-card text-muted hover:bg-brand-tint hover:text-ink"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!ready ? (
        <LoadingState label="Loading your medications" />
      ) : meds.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="No medications on file"
          description="Add the first one by scanning a label or typing it in. Once it's here, you'll see its schedule and how often you've taken it on time."
          action={
            <Link href="/meds/add" className={buttonVariants({ variant: "primary", size: "sm" })}>
              <Plus /> Add medication
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing matches that"
          description="Try a different search term, or switch the filter back to All."
        />
      ) : (
        <section aria-label="Medications" className="overflow-hidden rounded-[var(--radius-md)] border border-rule bg-card">
          <div className="flex items-center justify-between border-b border-rule-strong px-4 py-2.5">
            <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
              <span className="tnum text-muted">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "entry" : "entries"}
            </p>
            <p className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
              On time, 7 days
            </p>
          </div>
          <ul className="divide-y divide-rule">
            {filtered.map((med) => (
              <li key={med.medId.toString()}>
                <MedRow med={med} doses={doses} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
