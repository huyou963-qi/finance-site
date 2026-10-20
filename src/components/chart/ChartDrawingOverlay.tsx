"use client";
import type { ReactNode } from "react";
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";
import { SITE } from "@/lib/siteTheme";
import { createDrawing, pointCount, type DrawingTool, type DrawingPoint, type MarketDrawing } from "@/lib/chart/marketDrawings";
import { drawingGeometry, drawingHandles, drawingProjector } from "@/lib/chart/drawingGeometry";
export type SvgOverlayShape = MarketDrawing;
export type DrawingDraftPreview = { tool: Exclude<DrawingTool, "cursor">; placed: DrawingPoint[]; hover: DrawingPoint | null };
export type VisibleExtremaOverlay = {
  high: { t: UTCTimestamp; price: number; text: string };
  low: { t: UTCTimestamp; price: number; text: string };
};

type Props = {
 chart: IChartApi | null; candleSeries: ISeriesApi<"Candlestick", Time> | null;
 shapes: MarketDrawing[]; width: number; height: number;
 draftPreview?: DrawingDraftPreview | null; selectedShapeId?: string | null;
 visibleExtrema?: VisibleExtremaOverlay | null;
 onHandlePointerDown?: (event: React.PointerEvent<SVGCircleElement>, id: string, index: number) => void;
};
function renderExtremaMarker(
  pt: { x: number; y: number },
  text: string,
  kind: "high" | "low",
  paneHeight: number,
  peerX: number | null,
): ReactNode {
  const isHigh = kind === "high";
  const stroke = isHigh ? "#fb7185" : "#34d399";
  const nearTop = pt.y < 24;
  const nearBottom = pt.y > paneHeight - 24;
  const labelAbove = isHigh ? !nearTop : nearBottom;
  const textY = labelAbove ? pt.y - 10 : pt.y + 18;
  let textX = pt.x;
  if (peerX != null && Math.abs(pt.x - peerX) < 10) {
    textX += isHigh ? -42 : 42;
  }
  return (
    <g key={kind}>
      <line
        x1={pt.x}
        y1={pt.y}
        x2={pt.x}
        y2={labelAbove ? pt.y - 6 : pt.y + 6}
        stroke={stroke}
        strokeWidth={1.5}
        strokeOpacity={0.9}
      />
      <circle cx={pt.x} cy={pt.y} r={3.5} fill={stroke} stroke={SITE.bg} strokeWidth={1} />
      <text
        x={textX}
        y={textY}
        fill={stroke}
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
        paintOrder="stroke"
        stroke={SITE.bg}
        strokeWidth={3}
      >
        {text}
      </text>
    </g>
  );
}

export function ChartDrawingOverlay({ chart, candleSeries, shapes, width, height, draftPreview, selectedShapeId, visibleExtrema, onHandlePointerDown }: Props) {
 if (!chart || !candleSeries || width <= 0) return null;
 const project = drawingProjector(chart, candleSeries);
 const draw = (d: MarketDrawing, draft = false) => {
   const selected = d.id === selectedShapeId;
   const color = d.color ?? "#38bdf8";
   const dash = draft ? "5 4" : d.dash === "dashed" ? "8 5" : d.dash === "dotted" ? "2 4" : undefined;
   return <g key={d.id} opacity={draft ? 0.65 : 1}>
    {drawingGeometry(d, project, width, height).map((s, i) => {
      const col = s.color ?? color, strokeWidth = (d.lineWidth ?? 2) + (selected ? 0.5 : 0);
      if (s.kind === "text") return <text key={i} x={s.a.x + 4} y={s.a.y} fill={col} fontSize={12} paintOrder="stroke" stroke={SITE.bg} strokeWidth={3}>{s.label}</text>;
      if (s.kind === "line") return <g key={i}><line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={col} strokeWidth={strokeWidth} strokeDasharray={dash} />{s.label && <text x={Math.min(width - 6, Math.max(6, s.b.x))} y={s.b.y - 5} textAnchor="end" fontSize={11} fill={col} paintOrder="stroke" stroke={SITE.bg} strokeWidth={3}>{s.label}</text>}</g>;
      const x = Math.min(s.a.x, s.b.x), y = Math.min(s.a.y, s.b.y), w = Math.abs(s.b.x - s.a.x), h = Math.abs(s.b.y - s.a.y);
      return s.kind === "ellipse" ? <ellipse key={i} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={col} fillOpacity={0.12} stroke={col} strokeWidth={strokeWidth} strokeDasharray={dash}/> : <rect key={i} x={x} y={y} width={w} height={h} fill={col} fillOpacity={0.12} stroke={col} strokeWidth={strokeWidth} strokeDasharray={dash}/>;
    })}
    {(selected || draft) && !d.hidden && drawingHandles(d, project, width).map((p, i) => <circle key={`handle-${i}`} cx={p.x} cy={d.kind === "vline" ? height / 2 : p.y} r={6} fill={SITE.bg} stroke={color} strokeWidth={2} style={{ pointerEvents: draft || d.locked ? "none" : "auto", touchAction: "none", cursor: "grab" }} onPointerDown={e => onHandlePointerDown?.(e, d.id, i)} />)}
   </g>;
 };
 const preview = draftPreview;
 let draft: MarketDrawing | null = null;
 if (preview?.placed.length && preview.hover) {
   const points = [...preview.placed, preview.hover];
   if (points.length >= pointCount(preview.tool)) draft = createDrawing(preview.tool, points, "draft");
   else draft = createDrawing("trend", points, "draft");
 }
 return <svg className="pointer-events-none absolute left-0 top-0 z-10 overflow-hidden" width={width} height={height}>
  {shapes.map(d => draw(d))}{draft && draw(draft, true)}
  {preview?.placed.map((p, i) => { const pt = project(p.t, p.p); return pt ? <circle key={`anchor-${i}`} cx={pt.x} cy={pt.y} r={4} fill="#38bdf8" /> : null; })}
  {visibleExtrema && ["high", "low"].map(k => { const kind = k as "high" | "low", point = visibleExtrema[kind], pt = project(point.t, point.price); return pt ? renderExtremaMarker(pt, point.text, kind, height, null) : null; })}
 </svg>;
}
