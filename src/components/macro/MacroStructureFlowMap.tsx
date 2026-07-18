"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  getMacroTemplateDimension,
  type MacroTemplateDimensionId,
} from "@/lib/data/macroTemplateTaxonomy";

type DimNodeData = {
  dimId: MacroTemplateDimensionId;
  count: number;
  selected: boolean;
  subtitle?: string;
};

type DimNode = Node<DimNodeData, "dim">;

const NODE_W = 78;
const HUB_W = 118;
const POLICY_W = 92;
const CANVAS_W = 500;

const LAYER_LABELS: { top: number; text: string }[] = [
  { top: 156, text: "实体与需求" },
  { top: 256, text: "价格" },
  { top: 356, text: "政策" },
  { top: 456, text: "综合研判" },
  { top: 538, text: "专题" },
];

function buildLayout(
  counts: Record<MacroTemplateDimensionId, number>,
  selected: MacroTemplateDimensionId,
): { nodes: DimNode[]; edges: Edge[] } {
  const realIds: MacroTemplateDimensionId[] = [
    "consumer-balance",
    "labor",
    "industry-inventory",
    "housing",
    "external-dollar",
  ];
  const gap = 12;
  const rowW = realIds.length * NODE_W + (realIds.length - 1) * gap;
  const rowStart = Math.max(8, (CANVAS_W - rowW) / 2);
  const yHub = 12;
  /** Overview 与实体行拉开，避免主传导竖线过短 */
  const yReal = 152;
  const yPrice = 252;
  const yPolicy = 352;
  const yMeta = 452;
  const yTopic = 534;

  const mk = (
    id: MacroTemplateDimensionId,
    x: number,
    y: number,
    w: number,
    extra?: Partial<DimNodeData>,
  ): DimNode => ({
    id,
    type: "dim",
    position: { x, y },
    data: {
      dimId: id,
      count: counts[id] ?? 0,
      selected: selected === id,
      ...extra,
    },
    style: { width: w },
    draggable: false,
  });

  const industryX = rowStart + 2 * (NODE_W + gap);
  const centerX = industryX + NODE_W / 2;

  const nodes: DimNode[] = [
    mk("economy", centerX - HUB_W / 2, yHub, HUB_W, {
      subtitle: "L1–L5",
    }),
    ...realIds.map((id, i) => mk(id, rowStart + i * (NODE_W + gap), yReal, NODE_W)),
    mk("inflation", centerX - NODE_W / 2, yPrice, NODE_W),
    mk("monetary", centerX - POLICY_W - 24, yPolicy, POLICY_W),
    mk("fiscal", centerX + 24, yPolicy, POLICY_W),
    mk("cycle-risk", centerX - (NODE_W + 8) / 2, yMeta, NODE_W + 8),
    mk("topic", rowStart, yTopic, NODE_W),
  ];

  const solid = (source: string, target: string, id: string): Edge => ({
    id,
    source,
    target,
    type: "smoothstep",
    style: { stroke: "#3f3f46", strokeWidth: 1.35, opacity: 0.65 },
  });

  const dashed = (source: string, target: string, id: string): Edge => ({
    id,
    source,
    target,
    type: "smoothstep",
    style: {
      stroke: "#a1a1aa",
      strokeWidth: 1.2,
      strokeDasharray: "5 4",
      opacity: 0.9,
    },
  });

  const edges: Edge[] = [
    ...realIds.map((id) => solid("economy", id, `e-hub-${id}`)),
    solid("industry-inventory", "inflation", "e-ind-infl"),
    solid("inflation", "monetary", "e-infl-mon"),
    solid("inflation", "fiscal", "e-infl-fis"),
    dashed("consumer-balance", "cycle-risk", "e-cons-meta"),
    dashed("labor", "cycle-risk", "e-labor-meta"),
    dashed("housing", "cycle-risk", "e-house-meta"),
    dashed("external-dollar", "cycle-risk", "e-ext-meta"),
    dashed("monetary", "cycle-risk", "e-mon-meta"),
    dashed("fiscal", "cycle-risk", "e-fis-meta"),
  ];

  return { nodes, edges };
}

function DimNodeView({ data }: NodeProps<DimNode>) {
  const dim = getMacroTemplateDimension(data.dimId);
  const isHub = data.dimId === "economy";

  let shellClass =
    "border border-fs-border/80 bg-fs-elevated text-fs-text shadow-sm hover:border-fs-border";
  if (isHub && data.selected) {
    shellClass =
      "border-2 border-fs-text bg-fs-elevated text-fs-text shadow-md ring-2 ring-fs-accent/25";
  } else if (isHub) {
    shellClass = "border-2 border-fs-text/70 bg-fs-elevated text-fs-text shadow-sm";
  } else if (data.selected) {
    shellClass =
      "border border-fs-accent/50 bg-fs-accent-soft text-fs-accent-text shadow-md ring-2 ring-fs-accent/20";
  }

  return (
    <div
      className={`relative box-border h-full w-full rounded-md px-1 py-2 text-center transition-all ${shellClass}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-zinc-400"
      />
      <div className="text-[11px] font-semibold leading-tight">{dim.shortLabel}</div>
      <div
        className={`mt-0.5 text-[9px] tabular-nums ${
          data.selected && !isHub ? "text-fs-accent-text/80" : "text-fs-muted"
        }`}
      >
        {data.count}
      </div>
      {data.subtitle ? (
        <div
          className={`mt-0.5 text-[9px] ${
            data.selected && !isHub ? "text-fs-accent-text/70" : "text-fs-muted"
          }`}
        >
          {data.subtitle}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-zinc-400"
      />
    </div>
  );
}

const nodeTypes = { dim: DimNodeView };

function FlowCanvas({
  counts,
  selectedDimensionId,
  onSelect,
}: {
  counts: Record<MacroTemplateDimensionId, number>;
  selectedDimensionId: MacroTemplateDimensionId;
  onSelect: (id: MacroTemplateDimensionId) => void;
}) {
  const { nodes, edges } = useMemo(
    () => buildLayout(counts, selectedDimensionId),
    [counts, selectedDimensionId],
  );

  const onNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      onSelect(node.id as MacroTemplateDimensionId);
    },
    [onSelect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling
      proOptions={{ hideAttribution: true }}
      defaultViewport={{ x: 12, y: 4, zoom: 1 }}
      minZoom={1}
      maxZoom={1}
      className="macro-structure-flow !bg-transparent"
    />
  );
}

export function MacroStructureFlowMap({
  counts,
  selectedDimensionId,
  loading,
  onSelect,
}: {
  counts: Record<MacroTemplateDimensionId, number>;
  selectedDimensionId: MacroTemplateDimensionId;
  loading: boolean;
  onSelect: (id: MacroTemplateDimensionId) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <aside className="min-w-0" aria-label="宏观结构图">
      <div className="mb-2">
        <h4 className="text-[13px] font-semibold text-fs-text">宏观结构图</h4>
      </div>

      <div className="relative grid grid-cols-[5rem_minmax(0,1fr)] gap-1.5">
        <div className="relative h-[38rem]" aria-hidden>
          {LAYER_LABELS.map((l) => (
            <div
              key={l.text}
              className="absolute left-0 text-[13px] font-bold leading-tight text-fs-text"
              style={{ top: l.top }}
            >
              {l.text}
            </div>
          ))}
        </div>

        <div
          className={`h-[38rem] w-full overflow-hidden rounded-md border border-fs-border/40 bg-fs-bg/20 ${
            loading ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {mounted ? (
            <ReactFlowProvider>
              <FlowCanvas
                counts={counts}
                selectedDimensionId={selectedDimensionId}
                onSelect={onSelect}
              />
            </ReactFlowProvider>
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-fs-muted">
              加载结构图…
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
