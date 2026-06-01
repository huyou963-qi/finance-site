import type { EChartsType } from "echarts";
import type { GraphicComponentOption } from "echarts";
import { dataIndexFromConvert } from "@/lib/timeCursor";

export type MacroDrawingTool = "cursor" | "hline" | "vline" | "trend" | "rect" | "text";

export type MacroDrawing =
  | { id: string; kind: "hline"; y: number }
  | { id: string; kind: "vline"; category: string }
  | {
      id: string;
      kind: "trend";
      x0: string;
      y0: number;
      x1: string;
      y1: number;
    }
  | {
      id: string;
      kind: "rect";
      x0: string;
      y0: number;
      x1: string;
      y1: number;
    }
  | { id: string; kind: "text"; category: string; y: number; text: string };

export type MacroDrawingDraft = {
  tool: "trend" | "rect";
  x0: string;
  y0: number;
};

export const MACRO_DRAWING_TOOLS: { id: MacroDrawingTool; label: string; title: string }[] = [
  { id: "cursor", label: "十字", title: "十字光标（默认）" },
  { id: "hline", label: "水平", title: "水平参考线" },
  { id: "vline", label: "垂直", title: "垂直参考线" },
  { id: "trend", label: "趋势", title: "趋势线（两点）" },
  { id: "rect", label: "矩形", title: "矩形区域（两点）" },
  { id: "text", label: "文本", title: "文本标注" },
];

const STROKE = "#fbbf24";
const FILL = "rgba(251, 191, 36, 0.12)";

export type MacroPointerData = {
  category: string;
  y: number;
  index: number;
};

export function pointerToData(
  chart: EChartsType,
  categories: string[],
  offsetX: number,
  offsetY: number,
): MacroPointerData | null {
  try {
    if (!chart.containPixel({ gridIndex: 0 }, [offsetX, offsetY])) return null;
    const conv = chart.convertFromPixel({ seriesIndex: 0 }, [offsetX, offsetY]);
    if (!Array.isArray(conv) || conv.length < 2) return null;
    const index = dataIndexFromConvert(conv, categories);
    const y = typeof conv[1] === "number" ? conv[1] : Number(conv[1]);
    if (index === null || !Number.isFinite(y)) return null;
    const category = categories[index];
    if (!category) return null;
    return { category, y, index };
  } catch {
    return null;
  }
}

function categoryYToPixel(
  chart: EChartsType,
  categories: string[],
  category: string,
  y: number,
): [number, number] | null {
  const idx = categories.indexOf(category);
  if (idx < 0) return null;
  try {
    const pt = chart.convertToPixel({ seriesIndex: 0 }, [idx, y]);
    if (!Array.isArray(pt) || pt.length < 2) return null;
    const x = pt[0];
    const py = pt[1];
    if (typeof x !== "number" || typeof py !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(py)) return null;
    return [x, py];
  } catch {
    return null;
  }
}

function gridSpanX(chart: EChartsType, categories: string[]): [number, number] | null {
  if (categories.length === 0) return null;
  const left = categoryYToPixel(chart, categories, categories[0]!, 0);
  const right = categoryYToPixel(chart, categories, categories[categories.length - 1]!, 0);
  if (!left || !right) return null;
  return [Math.min(left[0], right[0]), Math.max(left[0], right[0])];
}

function gridSpanY(chart: EChartsType, categories: string[]): [number, number] | null {
  if (categories.length === 0) return null;
  const mid = categories[Math.floor(categories.length / 2)]!;
  const pts: number[] = [];
  for (const y of [-1e6, 0, 1e6, 1e9]) {
    const p = categoryYToPixel(chart, categories, mid, y);
    if (p) pts.push(p[1]);
  }
  if (pts.length < 2) return null;
  return [Math.min(...pts), Math.max(...pts)];
}

function lineGraphic(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dashed = false,
): GraphicComponentOption {
  return {
    id,
    type: "line",
    shape: { x1, y1, x2, y2 },
    style: {
      stroke: STROKE,
      lineWidth: 1.5,
      lineDash: dashed ? [4, 4] : undefined,
    },
    silent: true,
    z: 100,
  };
}

export function buildMacroChartGraphics(
  chart: EChartsType,
  categories: string[],
  drawings: MacroDrawing[],
  draft: MacroDrawingDraft | null,
  hover: MacroPointerData | null,
): GraphicComponentOption[] {
  const out: GraphicComponentOption[] = [];

  for (const d of drawings) {
    if (d.kind === "hline") {
      const p = categoryYToPixel(chart, categories, categories[0] ?? "", d.y);
      const spanX = gridSpanX(chart, categories);
      const spanY = gridSpanY(chart, categories);
      if (!p || !spanX || !spanY) continue;
      out.push(lineGraphic(d.id, spanX[0], p[1], spanX[1], p[1]));
    } else if (d.kind === "vline") {
      const p = categoryYToPixel(chart, categories, d.category, 0);
      const spanY = gridSpanY(chart, categories);
      if (!p || !spanY) continue;
      out.push(lineGraphic(d.id, p[0], spanY[0], p[0], spanY[1]));
    } else if (d.kind === "trend") {
      const a = categoryYToPixel(chart, categories, d.x0, d.y0);
      const b = categoryYToPixel(chart, categories, d.x1, d.y1);
      if (!a || !b) continue;
      out.push(lineGraphic(d.id, a[0], a[1], b[0], b[1]));
    } else if (d.kind === "rect") {
      const a = categoryYToPixel(chart, categories, d.x0, d.y0);
      const b = categoryYToPixel(chart, categories, d.x1, d.y1);
      if (!a || !b) continue;
      const x = Math.min(a[0], b[0]);
      const y = Math.min(a[1], b[1]);
      const w = Math.abs(b[0] - a[0]);
      const h = Math.abs(b[1] - a[1]);
      out.push({
        id: d.id,
        type: "rect",
        shape: { x, y, width: w, height: h },
        style: { fill: FILL, stroke: STROKE, lineWidth: 1.2 },
        silent: true,
        z: 100,
      });
    } else if (d.kind === "text") {
      const p = categoryYToPixel(chart, categories, d.category, d.y);
      if (!p) continue;
      out.push({
        id: d.id,
        type: "text",
        style: {
          text: d.text,
          fill: "#e2e8f0",
          fontSize: 11,
          backgroundColor: "rgba(15, 23, 42, 0.85)",
          padding: [2, 4],
          borderRadius: 2,
        },
        x: p[0] + 4,
        y: p[1] - 8,
        silent: true,
        z: 101,
      });
    }
  }

  if (draft && hover) {
    const a = categoryYToPixel(chart, categories, draft.x0, draft.y0);
    const b = categoryYToPixel(chart, categories, hover.category, hover.y);
    if (a && b) {
      if (draft.tool === "trend") {
        out.push(lineGraphic("__draft__", a[0], a[1], b[0], b[1], true));
      } else {
        const x = Math.min(a[0], b[0]);
        const y = Math.min(a[1], b[1]);
        out.push({
          id: "__draft_rect__",
          type: "rect",
          shape: { x, y, width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) },
          style: { fill: FILL, stroke: STROKE, lineWidth: 1, lineDash: [4, 4] },
          silent: true,
          z: 100,
        });
      }
    }
  }

  return out;
}

export function applyMacroChartGraphics(
  chart: EChartsType,
  categories: string[],
  drawings: MacroDrawing[],
  draft: MacroDrawingDraft | null,
  hover: MacroPointerData | null,
): void {
  if (chart.isDisposed()) return;
  const graphic = buildMacroChartGraphics(chart, categories, drawings, draft, hover);
  chart.setOption({ graphic }, { replaceMerge: ["graphic"] });
}
