"use client";

import {
  CheckCircle2,
  CircleHelp,
  Lock,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  parseAuthLayers,
  verdictLabel,
  verdictVariant,
  type AuthLayer,
  type LayerState,
} from "./scan-utils";

const STATE_META: Record<
  LayerState,
  { label: string; icon: LucideIcon; cls: string; badge: "positive" | "danger" | "caution" | "neutral" }
> = {
  pass: { label: "Pass", icon: CheckCircle2, cls: "text-positive", badge: "positive" },
  fail: { label: "Concern", icon: XCircle, cls: "text-danger", badge: "danger" },
  inconclusive: { label: "Inconclusive", icon: CircleHelp, cls: "text-caution", badge: "caution" },
  unavailable: { label: "Unavailable", icon: Lock, cls: "text-faint", badge: "neutral" },
};

const VERDICT_ICON: Record<string, LucideIcon> = {
  verified: ShieldCheck,
  suspect: ShieldAlert,
  inconclusive: ShieldQuestion,
};

/**
 * Renders the aggregate authenticity verdict (prominent, colored) plus the
 * per-layer breakdown as a ruled ledger — each verification layer is one ruled
 * row with a pass/inconclusive/unavailable state + the reason it landed there
 * (PRD §10.1). The verdict and per-layer results are computed by the server; we
 * only display them, and always show *why* each layer landed where it did.
 */
export function AuthenticityBreakdown({
  verdict,
  authLayersJson,
}: {
  verdict: string;
  authLayersJson: string;
}) {
  const layers: AuthLayer[] = parseAuthLayers(authLayersJson);
  const variant = verdictVariant(verdict);
  const VerdictIcon = VERDICT_ICON[verdict.toLowerCase()] ?? ShieldQuestion;

  // Aggregate verdict block — solid signal color, no glow, no left-stripe.
  const verdictTone =
    variant === "success"
      ? "border-positive bg-positive-tint text-positive"
      : variant === "danger"
        ? "border-danger bg-danger-tint text-danger"
        : variant === "warning"
          ? "border-caution bg-[color:var(--color-monitor-tint)] text-caution"
          : "border-rule-strong bg-surface text-muted";

  const passCount = layers.filter((l) => l.state === "pass").length;
  const concernCount = layers.filter((l) => l.state === "fail").length;
  const checkedCount = layers.filter((l) => l.state !== "unavailable").length;

  return (
    <section aria-label="Authenticity verification" className="space-y-4">
      <div className="flex items-baseline justify-between border-b border-rule-strong pb-1.5">
        <h2 className="font-display text-xl text-ink">Authenticity ledger</h2>
        {layers.length > 0 ? (
          <span className="label-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            {layers.length} {layers.length === 1 ? "layer" : "layers"}
          </span>
        ) : null}
      </div>

      {/* Aggregate verdict — the one dominant element of the ledger. */}
      <div
        className={cn(
          "flex items-center gap-4 rounded-[var(--radius-md)] border px-5 py-4",
          verdictTone
        )}
      >
        <VerdictIcon className="size-8 shrink-0 sm:size-9" strokeWidth={1.5} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="label-mono text-[10px] uppercase tracking-[0.18em] opacity-70">Verdict</p>
          <p className="font-display text-[1.75rem] leading-none sm:text-[2rem]">
            {verdictLabel(verdict)}
          </p>
        </div>
        {checkedCount > 0 ? (
          <div className="shrink-0 border-l border-current/20 pl-4 text-right opacity-90">
            <p className="label-mono tnum text-xl leading-none">
              {passCount}<span className="text-sm opacity-60">/{checkedCount}</span>
            </p>
            <p className="label-mono mt-1 text-[10px] uppercase tracking-[0.12em] opacity-70">
              checks clear
            </p>
          </div>
        ) : null}
      </div>

      {layers.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-rule bg-card px-4 py-4 text-xs leading-relaxed text-muted">
          No per-layer breakdown came back for this scan, so we can&apos;t show the ledger. The
          verdict above is the server&apos;s aggregate.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-rule bg-card">
          {/* Ledger header row — a real table header, not a card title. */}
          <div className="grid grid-cols-[1fr_auto] items-baseline border-b border-rule-strong px-4 py-2">
            <span className="label-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              Verification layer
            </span>
            <span className="label-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              Result
            </span>
          </div>
          <ul>
            {layers.map((layer, idx) => {
              const meta = STATE_META[layer.state];
              const Icon = meta.icon;
              return (
                <li
                  key={layer.key}
                  className="grid grid-cols-[1.75rem_1fr] gap-x-2 border-b border-rule px-4 py-3 last:border-b-0"
                >
                  {/* Fixed state gutter — every row's status icon aligns like a ledger. */}
                  <span className="label-mono tnum pt-0.5 text-[11px] text-faint" aria-hidden>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ink">{layer.label}</span>
                      <span className={cn("flex shrink-0 items-center gap-1.5", meta.cls)}>
                        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                        <Badge variant={meta.badge}>{meta.label}</Badge>
                      </span>
                    </div>
                    {layer.reasons.length > 0 ? (
                      <ul className="space-y-0.5 text-xs leading-relaxed text-muted">
                        {layer.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : null}
                    {layer.state === "unavailable" && layer.credentialGated ? (
                      <p className="text-[11px] leading-relaxed text-faint">
                        Serialized verification needs Authorized Trading Partner credentials
                        (DSCSA). We don&apos;t hold those here, so this layer is skipped rather than
                        failed.
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {/* Legend — reads like the key on a printed report, not decoration. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule-strong bg-surface px-4 py-2.5 text-[11px] text-muted">
            <LegendItem dotClass="bg-positive" label="Pass" />
            <LegendItem dotClass="bg-danger" label="Concern" />
            <LegendItem dotClass="bg-caution" label="Inconclusive" />
            <LegendItem dotClass="bg-faint" label="Unavailable" />
            {concernCount > 0 ? (
              <span className="ml-auto text-danger">
                {concernCount} layer{concernCount === 1 ? "" : "s"} flagged a concern
              </span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function LegendItem({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-[var(--radius-pill)]", dotClass)} aria-hidden />
      {label}
    </span>
  );
}
