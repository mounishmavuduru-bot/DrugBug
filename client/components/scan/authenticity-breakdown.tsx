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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  parseAuthLayers,
  verdictLabel,
  verdictVariant,
  type AuthLayer,
  type LayerState,
} from "./scan-utils";

const STATE_META: Record<LayerState, { label: string; icon: LucideIcon; cls: string }> = {
  pass: { label: "Pass", icon: CheckCircle2, cls: "text-success" },
  fail: { label: "Concern", icon: XCircle, cls: "text-danger" },
  inconclusive: { label: "Inconclusive", icon: CircleHelp, cls: "text-warning" },
  unavailable: { label: "Unavailable", icon: Lock, cls: "text-muted" },
};

const VERDICT_ICON: Record<string, LucideIcon> = {
  verified: ShieldCheck,
  suspect: ShieldAlert,
  inconclusive: ShieldQuestion,
};

/**
 * Renders the aggregate authenticity verdict (prominent, colored) plus the
 * per-layer breakdown with pass/inconclusive/unavailable states + reasons
 * (PRD §10.1). The verdict and per-layer results are computed by the server;
 * we only display them — and always show *why* each layer landed where it did.
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

  const verdictTone =
    variant === "success"
      ? "border-success/40 bg-success/10 text-success"
      : variant === "danger"
        ? "border-danger/40 bg-danger/10 text-danger"
        : variant === "warning"
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-elevated text-muted";

  return (
    <section aria-label="Authenticity verification" className="space-y-3">
      <div className={cn("flex items-center gap-3 rounded-[var(--radius)] border p-4", verdictTone)}>
        <VerdictIcon className="size-7 shrink-0" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Authenticity verdict
          </p>
          <p className="text-lg font-semibold">{verdictLabel(verdict)}</p>
        </div>
      </div>

      {layers.length === 0 ? (
        <Card className="text-xs text-muted">
          No per-layer breakdown was returned for this scan.
        </Card>
      ) : (
        <ul className="space-y-2">
          {layers.map((layer) => {
            const meta = STATE_META[layer.state];
            const Icon = meta.icon;
            return (
              <li key={layer.key}>
                <Card className="space-y-1.5 p-3">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("size-4 shrink-0", meta.cls)} />
                    <span className="text-sm font-medium text-text">{layer.label}</span>
                    <Badge
                      variant={
                        layer.state === "pass"
                          ? "success"
                          : layer.state === "fail"
                            ? "danger"
                            : layer.state === "inconclusive"
                              ? "warning"
                              : "neutral"
                      }
                      className="ml-auto"
                    >
                      {meta.label}
                    </Badge>
                  </div>
                  {layer.reasons.length > 0 ? (
                    <ul className="space-y-0.5 pl-6 text-xs text-muted">
                      {layer.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                  {layer.state === "unavailable" && layer.credentialGated ? (
                    <p className="pl-6 text-[11px] text-muted">
                      Serialized verification requires Authorized Trading Partner credentials
                      (DSCSA). This is an honest capability boundary, not a failure.
                    </p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
