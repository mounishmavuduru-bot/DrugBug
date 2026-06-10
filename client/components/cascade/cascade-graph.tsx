"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  MarkerType,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";

import { severityColor } from "@/components/shared/severity";
import type { Medication } from "@/components/med/med-utils";
import { PillNode, type PillNodeData } from "@/components/cascade/pill-node";
import {
  circularLayout,
  medKeyFor,
  pairEdgeId,
  severityRank,
  type CascadeChain,
  type CascadePair,
} from "@/components/cascade/cascade-utils";

const nodeTypes: NodeTypes = { pill: PillNode };

/** Edge payload we attach so the click handler can open the right side panel. */
export interface PairEdgeData {
  pair: CascadePair;
}

export function CascadeGraph({
  meds,
  pairs,
  cascades,
  onEdgeSelect,
}: {
  meds: Medication[];
  pairs: CascadePair[];
  cascades: CascadeChain[];
  onEdgeSelect: (pair: CascadePair) => void;
}) {
  const { nodes, edges, hasCascade } = useMemo(() => {
    const pts = circularLayout(meds.length);

    // Map med id -> set of severities touching it, and which meds sit in a cascade.
    const worstByNode = new Map<string, string>();
    const cascadeMedIds = new Set<string>();

    // Resolve each cascade's drugs to node ids; mark them for the highlighted subgraph.
    for (const c of cascades) {
      for (const label of c.drugs) {
        const id = medKeyFor(label, meds);
        if (id) cascadeMedIds.add(id);
      }
    }

    // Build edges from pairwise findings, attaching them to resolved node ids.
    const edgeList: Edge<PairEdgeData>[] = [];
    const seenEdge = new Set<string>();
    for (const p of pairs) {
      const aId = medKeyFor(p.drugA, meds);
      const bId = medKeyFor(p.drugB, meds);
      if (!aId || !bId || aId === bId) continue;
      const id = pairEdgeId(aId, bId);
      if (seenEdge.has(id)) continue; // de-dupe symmetric findings
      seenEdge.add(id);

      const color = severityColor(p.severity);
      // Track the worst severity color on each endpoint for node tinting.
      for (const nid of [aId, bId]) {
        const prev = worstByNode.get(nid);
        if (!prev || severityRank(p.severity) > severityRank(prev)) {
          worstByNode.set(nid, p.severity);
        }
      }

      const inCascade = cascadeMedIds.has(aId) && cascadeMedIds.has(bId);
      const predicted = p.source === "model";
      edgeList.push({
        id,
        source: aId,
        target: bId,
        data: { pair: p },
        animated: inCascade,
        style: {
          stroke: color,
          strokeWidth: severityRank(p.severity) + 0.75,
          // Model-predicted edges are dashed; reference facts are solid (PRD §10.2).
          strokeDasharray: predicted ? "5 3" : undefined,
          // Cascade edges read as the focal subgraph; quiet the rest slightly.
          opacity: cascadeMedIds.size > 0 && !inCascade ? 0.55 : 1,
          cursor: "pointer",
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        // Mark model-predicted edges so reference facts read differently (PRD §10.2).
        label: predicted ? "predicted" : undefined,
        labelStyle: { fill: "#6f5b62", fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" },
        labelBgStyle: { fill: "#ffffff", stroke: "#f3d9e1", strokeWidth: 0.75 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 2,
      });
    }

    const nodeList: Node<PillNodeData>[] = meds.map((m, i) => {
      const id = m.medId.toString();
      const worst = worstByNode.get(id);
      return {
        id,
        type: "pill",
        position: pts[i] ?? { x: 0, y: 0 },
        data: {
          name: m.name,
          strength: m.strength,
          severityColor: worst ? severityColor(worst) : undefined,
          inCascade: cascadeMedIds.has(id),
          isolated: !worstByNode.has(id),
        },
        draggable: true,
      };
    });

    return { nodes: nodeList, edges: edgeList, hasCascade: cascadeMedIds.size > 0 };
  }, [meds, pairs, cascades]);

  // Which severities actually appear, worst-first, for the canvas legend.
  const legend = useMemo(() => {
    const present = new Set(pairs.map((p) => severityColor(p.severity)));
    return [
      { color: "#c01526", label: "Contraindicated" },
      { color: "#b8541b", label: "Caution" },
      { color: "#98690f", label: "Monitor" },
    ].filter((s) => present.has(s.color));
  }, [pairs]);

  const handleEdgeClick: EdgeMouseHandler = (_evt, edge) => {
    const data = (edge as Edge<PairEdgeData>).data;
    if (data?.pair) onEdgeSelect(data.pair);
  };

  return (
    <div className="h-[440px] w-full overflow-hidden rounded-[var(--radius-md)] border border-rule bg-paper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onEdgeClick={handleEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        edgesFocusable
        aria-label="Map of how your medications interact"
      >
        {/* Faint dotted grid on warm paper — a ruled worksheet, not a dark canvas. */}
        <Background color="#e6bccb" gap={22} size={1} />
        <Controls
          showInteractive={false}
          className="!border !border-rule !bg-card !shadow-none [&_button]:!border-rule [&_button]:!bg-card [&_button]:!fill-muted hover:[&_button]:!bg-brand-tint"
        />

        {/* Severity key — reads like the legend on a printed reference, top-left. */}
        {(legend.length > 0 || hasCascade) && (
          <Panel position="top-left" className="!m-3">
            <div className="space-y-1.5 rounded-[var(--radius-sm)] border border-rule bg-card px-3 py-2.5 text-[11px] text-muted">
              <p className="label-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                Severity
              </p>
              {legend.map((s) => (
                <div key={s.color} className="flex items-center gap-2">
                  <span
                    className="h-0.5 w-5 shrink-0 rounded-[var(--radius-pill)]"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  />
                  <span>{s.label}</span>
                </div>
              ))}
              {hasCascade ? (
                <div className="flex items-center gap-2 border-t border-rule pt-1.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-[var(--radius-sm)] ring-1 ring-brand"
                    aria-hidden
                  />
                  <span>In a cascade</span>
                </div>
              ) : null}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
