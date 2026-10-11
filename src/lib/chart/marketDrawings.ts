export type DrawingTool = "cursor" | "trend" | "ray" | "extended" | "arrow" | "hline" | "vline" | "rect" | "ellipse" | "fib" | "channel" | "text" | "measure" | "long" | "short";
export type DrawingPoint = { t: number; p: number };
export type DrawingStyle = { color?: string; lineWidth?: number; dash?: "solid" | "dashed" | "dotted"; locked?: boolean; hidden?: boolean; name?: string };
export type MarketDrawing = DrawingStyle & (
  | { id: string; kind: "hline"; price: number }
  | { id: string; kind: "vline"; t: number }
  | { id: string; kind: "text"; t: number; p: number; text: string }
  | { id: string; kind: "trend" | "ray" | "extended" | "arrow" | "rect" | "ellipse" | "fib" | "measure"; t1: number; p1: number; t2: number; p2: number }
  | { id: string; kind: "channel" | "long" | "short"; t1: number; p1: number; t2: number; p2: number; t3: number; p3: number }
);
export const DRAWING_GROUPS: { label: string; tools: { id: DrawingTool; label: string; icon: string }[] }[] = [
  { label: "线与趋势", tools: [{ id: "trend", label: "线段", icon: "╱" }, { id: "extended", label: "直线", icon: "⤢" }, { id: "ray", label: "射线", icon: "↗" }, { id: "hline", label: "水平线", icon: "─" }, { id: "vline", label: "垂直线", icon: "│" }, { id: "channel", label: "平行通道", icon: "∥" }] },
  { label: "形状与标注", tools: [{ id: "rect", label: "矩形", icon: "▭" }, { id: "ellipse", label: "椭圆", icon: "◯" }, { id: "arrow", label: "箭头", icon: "➚" }, { id: "text", label: "文字", icon: "T" }] },
  { label: "分析与交易计划", tools: [{ id: "fib", label: "斐波那契回撤", icon: "≋" }, { id: "measure", label: "价差／时间测量", icon: "↔" }, { id: "long", label: "多头仓位", icon: "+" }, { id: "short", label: "空头仓位", icon: "−" }] },
];
export const drawingLabel = (kind: DrawingTool) => DRAWING_GROUPS.flatMap(g => g.tools).find(t => t.id === kind)?.label ?? "选择";
export const pointCount = (tool: DrawingTool) => ["hline", "vline", "text"].includes(tool) ? 1 : ["channel", "long", "short"].includes(tool) ? 3 : 2;
export function drawingPoints(d: MarketDrawing): DrawingPoint[] {
  if (d.kind === "hline") return [];
  if (d.kind === "vline") return [{ t: d.t, p: 0 }];
  if (d.kind === "text") return [{ t: d.t, p: d.p }];
  return [{ t: d.t1, p: d.p1 }, { t: d.t2, p: d.p2 }, ...("t3" in d ? [{ t: d.t3, p: d.p3 }] : [])];
}
export function updateDrawingPoint(d: MarketDrawing, index: number, point: DrawingPoint): MarketDrawing {
  if (d.kind === "hline") return { ...d, price: point.p };
  if (d.kind === "vline") return { ...d, t: point.t };
  if (d.kind === "text") return { ...d, ...point };
  return { ...d, [`t${index + 1}`]: point.t, [`p${index + 1}`]: point.p };
}
export function createDrawing(tool: Exclude<DrawingTool, "cursor">, points: DrawingPoint[], id: string, text = "备注"): MarketDrawing {
  const a = points[0], b = points[1], c = points[2];
  const style = { id, color: "#38bdf8", lineWidth: 2, dash: "solid" as const };
  if (tool === "hline") return { ...style, kind: tool, price: a.p };
  if (tool === "vline") return { ...style, kind: tool, t: a.t };
  if (tool === "text") return { ...style, kind: tool, ...a, text };
  if (tool === "channel" || tool === "long" || tool === "short") return { ...style, kind: tool, t1: a.t, p1: a.p, t2: b.t, p2: b.p, t3: c.t, p3: c.p };
  return { ...style, kind: tool, t1: a.t, p1: a.p, t2: b.t, p2: b.p };
}
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
/** Strictly validate and rebuild JSON so arbitrary fields never reach storage/rendering. */
export function validateDrawings(value: unknown): MarketDrawing[] {
  if (!Array.isArray(value) || value.length > 300) throw new Error("每个标的最多保存 300 个图形");
  const ids = new Set<string>();
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e13;
  return value.map(raw => {
    if (!raw || typeof raw !== "object") throw new Error("图形格式不正确");
    const r = raw as Record<string, unknown>;
    const kind = r.kind as DrawingTool;
    if (typeof r.id !== "string" || !/^[\w-]{1,80}$/.test(r.id) || ids.has(r.id) || !DRAWING_GROUPS.some(g => g.tools.some(t => t.id === kind))) throw new Error("图形标识不正确");
    ids.add(r.id);
    const count = pointCount(kind);
    const points: DrawingPoint[] = [];
    if (kind === "hline") { if (!finite(r.price)) throw new Error("价格不正确"); points.push({ t: 0, p: r.price }); }
    else for (let i = 0; i < count; i++) {
      const t = r[count === 1 ? "t" : `t${i + 1}`], p = kind === "vline" ? 0 : r[count === 1 ? "p" : `p${i + 1}`];
      if (!finite(t) || t < 0 || t > 7258118400 || !finite(p)) throw new Error("图形坐标不正确");
      points.push({ t, p });
    }
    if (kind === "text" && (typeof r.text !== "string" || !r.text.trim() || r.text.length > 500)) throw new Error("文字需为 1–500 个字符");
    const d = createDrawing(kind as Exclude<DrawingTool, "cursor">, points, r.id, r.text as string);
    // Legacy rgba colors are allowed, but CSS URLs and arbitrary values are rejected.
    if (r.color !== undefined) {
      if (typeof r.color !== "string" || !/^(#[0-9a-fA-F]{6}|rgba?\([\d.,\s]+\))$/.test(r.color)) throw new Error("颜色不正确");
      d.color = r.color;
    }
    if (r.lineWidth !== undefined) { if (![1, 2, 3, 4].includes(r.lineWidth as number)) throw new Error("线宽不正确"); d.lineWidth = r.lineWidth as number; }
    if (r.dash !== undefined) { if (!["solid", "dashed", "dotted"].includes(String(r.dash))) throw new Error("线型不正确"); d.dash = r.dash as DrawingStyle["dash"]; }
    for (const key of ["locked", "hidden"] as const) if (r[key] !== undefined) { if (typeof r[key] !== "boolean") throw new Error("状态不正确"); d[key] = r[key]; }
    if (r.name !== undefined) { if (typeof r.name !== "string" || r.name.length > 80) throw new Error("名称过长"); d.name = r.name; }
    return d;
  });
}
export function drawingStorageKey(userId: string | null, source: string, symbol: string, adjustment: string) {
  return `market-drawings:v2:${userId ?? "guest"}:${source}:${symbol.trim().toUpperCase()}:${adjustment}`;
}
export function mergeDrawingVersions(remote: MarketDrawing[], local: MarketDrawing[], newId: () => string): MarketDrawing[] {
  const used = new Set(remote.map(d => d.id));
  return [...remote, ...local.filter(d => !remote.some(r => JSON.stringify(r) === JSON.stringify(d))).map(d => {
    const id = used.has(d.id) ? newId() : d.id; used.add(id); return { ...d, id };
  })];
}
