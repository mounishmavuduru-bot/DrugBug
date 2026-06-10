"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchDrugs, type DrugSuggestion } from "@/lib/inference-client";

/**
 * RxNorm-backed name autocomplete (PRD §9.4). Debounced searchDrugs(q); on
 * select, the parent prefills genericName + rxnormCode. The visible text input
 * is fully controlled by the parent (react-hook-form), so typing also works as a
 * free-text fallback when the service is unavailable.
 */
export function DrugAutocomplete({
  value,
  onValueChange,
  onSelect,
  placeholder = "e.g. Lisinopril",
  id,
}: {
  value: string;
  onValueChange: (name: string) => void;
  onSelect: (s: DrugSuggestion) => void;
  placeholder?: string;
  id?: string;
}) {
  const [results, setResults] = useState<DrugSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const skipNext = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    // All state updates run inside async callbacks (never synchronously in the
    // effect body) so the search debounce doesn't cause cascading renders.
    if (q.length < 2) {
      const reset = setTimeout(() => {
        setResults([]);
        setOpen(false);
        setLoading(false);
      }, 0);
      return () => clearTimeout(reset);
    }
    const start = setTimeout(() => {
      setLoading(true);
      setFailed(false);
    }, 0);
    const handle = setTimeout(async () => {
      try {
        const { results } = await searchDrugs(q);
        setResults(results);
        setOpen(true);
        setActiveIdx(-1);
      } catch {
        setResults([]);
        setFailed(true);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(start);
      clearTimeout(handle);
    };
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (s: DrugSuggestion) => {
    skipNext.current = true;
    onValueChange(s.name);
    onSelect(s);
    setOpen(false);
    setResults([]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      choose(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
          strokeWidth={1.75}
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="label-mono pl-9"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-faint" />
        ) : null}
      </div>

      {open ? (
        <div
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius-md)] border border-rule-strong bg-card shadow-[0_18px_44px_-22px_rgba(24,19,13,0.4)]"
        >
          {failed ? (
            <p className="px-3 py-2 text-xs text-muted">
              The drug lookup isn&apos;t responding right now. You can still type the name yourself.
            </p>
          ) : results.length === 0 && !loading ? (
            <p className="px-3 py-2 text-xs text-muted">No matches yet. Keep typing, or just enter the name.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.rxcui}-${i}`}
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                onClick={() => choose(r)}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b border-rule px-3 py-2 text-left transition-colors duration-150 ease-[var(--ease)] last:border-b-0",
                  i === activeIdx ? "bg-brand-tint" : "hover:bg-brand-tint"
                )}
              >
                <span className="label-mono text-sm text-ink">{r.name}</span>
                <span className="text-[11px] text-muted">
                  {r.genericName ? <span className="label-mono">{r.genericName}</span> : null}
                  {r.rxcui ? <span className="ml-2 label-mono">RxCUI {r.rxcui}</span> : null}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
