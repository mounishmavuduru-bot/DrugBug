"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Pill } from "lucide-react";
import { cn } from "@/lib/utils";

/** Data carried by each med node in the CascadeMap graph. */
export interface PillNodeData {
  name: string;
  strength: string;
  /** Highest-severity color touching this node, or undefined if no edges. */
  severityColor?: string;
  /** True when this med participates in a detected cascade (highlighted subgraph). */
  inCascade: boolean;
  /** True when this med has no interacting partners. */
  isolated: boolean;
}

/**
 * A medication node: pill icon + name (mono per the design system). Border tints
 * to the worst severity touching it; nodes inside a detected cascade get a primary
 * ring so the highlighted subgraph reads at a glance (PRD §10.2).
 */
function PillNodeImpl({ data, selected }: NodeProps<PillNodeData>) {
  return (
    <div
      className={cn(
        "flex min-w-[120px] max-w-[160px] flex-col items-center gap-1 rounded-[var(--radius)] border bg-elevated px-3 py-2 text-center shadow-md transition-fast",
        data.inCascade ? "ring-2 ring-primary/70" : "",
        selected ? "ring-2 ring-primary" : "",
        data.isolated ? "opacity-70" : ""
      )}
      style={data.severityColor ? { borderColor: data.severityColor } : undefined}
    >
      {/* Edges connect to these handles; hidden visually since layout is radial. */}
      <Handle type="target" position={Position.Top} className="!opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" isConnectable={false} />
      <div className="grid size-7 place-items-center rounded-full bg-surface text-primary">
        <Pill className="size-4" aria-hidden />
      </div>
      <span className="mono text-xs font-medium leading-tight text-text">{data.name}</span>
      {data.strength ? (
        <span className="mono text-[10px] leading-none text-muted">{data.strength}</span>
      ) : null}
    </div>
  );
}

export const PillNode = memo(PillNodeImpl);
