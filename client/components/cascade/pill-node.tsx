"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "@/lib/utils";

/** Data carried by each med node in the Cascade graph. */
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
 * A medication tablet chip: name + strength in prescription-label mono. A thin
 * top band tints to the worst severity touching it (no full colored stripe);
 * meds inside a detected cascade get a brand ring so the subgraph reads at a
 * glance (PRD §10.2). White data sheet on paper — no drop shadow.
 */
function PillNodeImpl({ data, selected }: NodeProps<PillNodeData>) {
  const highlighted = data.inCascade || selected;
  return (
    <div
      className={cn(
        "min-w-[120px] max-w-[164px] overflow-hidden rounded-[var(--radius-sm)] border bg-card text-center transition-colors duration-150 ease-[var(--ease)]",
        highlighted ? "border-brand" : "border-rule-strong",
        data.inCascade ? "ring-1 ring-brand ring-offset-2 ring-offset-paper" : "",
        selected && !data.inCascade ? "ring-1 ring-brand ring-offset-2 ring-offset-paper" : "",
        data.isolated ? "opacity-60" : ""
      )}
    >
      {/* Edges connect to these handles; hidden visually since layout is radial. */}
      <Handle type="target" position={Position.Top} className="!opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" isConnectable={false} />
      {/* Severity band: a thin top rule in the worst severity color, or a hairline if none. */}
      <div
        className="h-[3px] w-full"
        style={{ backgroundColor: data.severityColor ?? "var(--color-rule)" }}
        aria-hidden
      />
      <div className="px-3 py-2">
        <span className="label-mono block text-xs font-medium leading-snug text-ink">
          {data.name}
        </span>
        {data.strength ? (
          <span className="label-mono mt-1 block border-t border-rule pt-1 text-[10px] leading-none tracking-tight text-muted">
            {data.strength}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const PillNode = memo(PillNodeImpl);
