"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
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
  const { nodes, edges } = useMemo(() => {
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
      edgeList.push({
        id,
        source: aId,
        target: bId,
        data: { pair: p },
        animated: inCascade,
        style: {
          stroke: color,
          strokeWidth: severityRank(p.severity) + 1.5,
          cursor: "pointer",
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        label: p.source === "model" ? "predicted" : undefined,
        labelStyle: { fill: "#94a3b8", fontSize: 9 },
        labelBgStyle: { fill: "#0f1729" },
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

    return { nodes: nodeList, edges: edgeList };
  }, [meds, pairs, cascades]);

  const handleEdgeClick: EdgeMouseHandler = (_evt, edge) => {
    const data = (edge as Edge<PairEdgeData>).data;
    if (data?.pair) onEdgeSelect(data.pair);
  };

  return (
    <div className="h-[440px] w-full overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
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
        aria-label="Medication interaction graph"
      >
        <Background color="#1e293b" gap={20} />
        <Controls
          showInteractive={false}
          className="!border-border !bg-elevated [&_button]:!border-border [&_button]:!bg-elevated [&_button]:!fill-muted hover:[&_button]:!bg-surface"
        />
      </ReactFlow>
    </div>
  );
}
