"use client";

import { Eye, ClipboardCheck, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { accessLabel, statusVariant } from "@/components/caregiver/caregiver-utils";

const ACCESS_ICON = {
  view: Eye,
  log: ClipboardCheck,
  manage: Settings2,
} as const;

/** Access-level chip with an icon that hints at the capability. */
export function AccessBadge({ level }: { level: string }) {
  const Icon = ACCESS_ICON[level as keyof typeof ACCESS_ICON] ?? Eye;
  return (
    <Badge variant="primary" aria-label={`Access level: ${accessLabel(level)}`}>
      <Icon className="size-3" />
      {accessLabel(level)}
    </Badge>
  );
}

/** Link-status chip (pending / accepted / revoked). */
export function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge variant={statusVariant(status)}>{label}</Badge>;
}
