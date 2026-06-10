"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WEEKDAYS } from "@/components/med/med-utils";

export interface ScheduleValue {
  times: string[]; // ["08:00","20:00"]
  days: number[]; // 0..6 (empty = daily)
  prn: boolean;
}

interface Preset {
  label: string;
  time: string;
}

const PRESETS: Preset[] = [
  { label: "Morning 8am", time: "08:00" },
  { label: "Noon 12pm", time: "12:00" },
  { label: "Evening 8pm", time: "20:00" },
  { label: "Bedtime 10pm", time: "22:00" },
];

function Chip({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition-colors duration-150 ease-[var(--ease)]",
        active
          ? "border-brand bg-brand text-brand-ink"
          : "border-rule-strong bg-card text-muted hover:bg-brand-tint hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Schedule builder (PRD §9.4): preset chips ("Morning 8am" / "Evening 8pm"),
 * custom times -> scheduleTimes ["HH:MM"], weekday selection, and a PRN toggle.
 * Controlled component — emits a normalized ScheduleValue to the parent form.
 */
export function ScheduleBuilder({
  value,
  onChange,
}: {
  value: ScheduleValue;
  onChange: (next: ScheduleValue) => void;
}) {
  const [customTime, setCustomTime] = useState("");

  const toggleTime = (time: string) => {
    const has = value.times.includes(time);
    const times = has ? value.times.filter((t) => t !== time) : [...value.times, time].sort();
    onChange({ ...value, times });
  };

  const addCustom = () => {
    if (!customTime || value.times.includes(customTime)) return;
    onChange({ ...value, times: [...value.times, customTime].sort() });
    setCustomTime("");
  };

  const toggleDay = (day: number) => {
    const has = value.days.includes(day);
    const days = has ? value.days.filter((d) => d !== day) : [...value.days, day].sort((a, b) => a - b);
    onChange({ ...value, days });
  };

  const setPrn = (prn: boolean) => onChange({ ...value, prn });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Chip active={value.prn} onClick={() => setPrn(!value.prn)} ariaLabel="Taken only when needed">
          Taken only when needed
        </Chip>
        <span className="text-[11px] text-muted">No fixed dose times.</span>
      </div>

      {!value.prn ? (
        <>
          <div>
            <Label>Preset times</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Chip key={p.time} active={value.times.includes(p.time)} onClick={() => toggleTime(p.time)}>
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <Label>Custom time</Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="max-w-[10rem]"
                aria-label="Custom dose time"
              />
              <Button type="button" variant="secondary" size="sm" onClick={addCustom} disabled={!customTime}>
                <Plus className="size-3" /> Add
              </Button>
            </div>
          </div>

          {value.times.length > 0 ? (
            <div>
              <Label>Selected times</Label>
              <div className="flex flex-wrap gap-2">
                {value.times.map((t) => (
                  <span
                    key={t}
                    className="label-mono inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-brand bg-brand-tint px-2.5 py-1 text-xs text-brand"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => toggleTime(t)}
                      aria-label={`Remove ${t}`}
                      className="rounded-[var(--radius-sm)] hover:text-ink"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-caution">Add at least one time, or mark this as taken only when needed.</p>
          )}

          <div>
            <Label>Days — leave empty for every day</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d, i) => (
                <Chip key={d} active={value.days.includes(i)} onClick={() => toggleDay(i)}>
                  {d}
                </Chip>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
