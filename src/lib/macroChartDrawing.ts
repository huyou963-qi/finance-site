import type { EChartsType } from "echarts";
import type { GraphicComponentOption } from "echarts";
import { dataIndexFromConvert } from "@/lib/timeCursor";
import { CHART, SITE } from "@/lib/siteTheme";

export type MacroDrawingTool = "cursor" | "hline" | "vline" | "trend" | "rect" | "text";

export type MacroLineStyleKind = "solid" | "dashed" | "dotted";

export type MacroDrawingStyle = {
  color: string;
  lineWidth: number;
  lineStyle: MacroLineStyleKind;
  fontSize: number;
  textColor: string;
  fillOpacity: number;
};

export const DEFAULT_MACRO_DRAWING_STYLE: MacroDrawingStyle = {
  color: "#f59e0b",
  lineWidth: 1.5,
  lineStyle: "solid",
  fontSize: 11,
  textColor: CHART.text,
  fillOpacity: 0.12,
};

export type MacroDrawing =
  | { id: string; kind: "hline"; y: number; style?: MacroDrawingStyle }
  | { id: string; kind: "vline"; category: string; style?: MacroDrawingStyle }
  | {
      id: string;
      kind: "trend";
      x0: string;
      y0: number;
      x1: string;
      y1: number;
      style?: MacroDrawingStyle;
    }
  | {
      id: string;
      kind: "rect";
      x0: string;
      y0: number;
      x1: string;
      y1: number;
      style?: MacroDrawingStyle;
    }
  | {
      id: string;
      kind: "text";
      category: string;
      y: number;
      text: string;
      style?: MacroDrawingStyle;
    };

export type MacroDrawingDraft = {
  tool: "trend" | "rect";
  x0: string;
  y0: number;
};

export const MACRO_DRAWING_TOOLS: { id: MacroDrawingTool; label: string; title: string }[] = [
  { id: "cursor", label: "十字", title: "十字光标：选择/移动标注" },
  { id: "hline", label: "水平", title: "水平参考线" },
  { id: "vline", label: "垂直", title: "垂直参考线" },
  { id: "trend", label: "趋势", title: "趋势线（两点）" },
  { id: "rect", label: "矩形", title: "矩形区域（两点）" },
  { id: "text", label: "文本", title: "文本标注" },
];

const SELECT_STROKE = SITE.accent;

export type MacroPointerData = {
  category: string;
  y: number;
  index: number;
  /** convertFromPixel 的原始横轴刻度（可为小数），拖拽时比取整下标更平滑 */
  rawIndex: number;
};

export function resolveDrawingStyle(style?: MacroDrawingStyle): MacroDrawingStyle {
  return { ...DEFAULT_MACRO_DRAWING_STYLE, ...(style ?? {}) };
}

export function withDefaultStyle<T extends Omit<MacroDrawing, "style">>(
  drawing: T,
  defaults: MacroDrawingStyle,
): MacroDrawing {
  const partial = drawing as T & { style?: MacroDrawingStyle };
  return {
    ...partial,
    style: { ...defaults, ...(partial.style ?? {}) },
  } as unknown as MacroDrawing;
}

export function cloneDrawing(drawing: MacroDrawing): MacroDrawing {
  if (drawing.style) {
    return { ...drawing, style: { ...drawing.style } };
  }
  return { ...drawing };
}

export function lineDashFromStyle(kind: MacroLineStyleKind): number[] | undefined {
  if (kind === "dashed") return [6, 4];
  if (kind === "dotted") return [2, 3];
  return undefined;
}

export function patchDrawing(
  drawings: MacroDrawing[],
  id: string,
  patch: Partial<MacroDrawing> & { style?: Partial<MacroDrawingStyle> },
): MacroDrawing[] {
  return drawings.map((d) => {
    if (d.id !== id) return d;
    const next = { ...d, ...patch } as MacroDrawing;
    if (patch.style) {
      next.style = { ...resolveDrawingStyle(d.style), ...patch.style };
    }
    return next;
  });
}

function pointerToDataInner(
  chart: EChartsType,
  categories: string[],
  offsetX: number,
  offsetY: number,
): MacroPointerData | null {
  try {
    const conv = chart.convertFromPixel({ seriesIndex: 0 }, [offsetX, offsetY]);
    if (!Array.isArray(conv) || conv.length < 2) return null;
    const index = dataIndexFromConvert(conv, categories);
    const y = typeof conv[1] === "number" ? conv[1] : Number(conv[1]);
    if (index === null || !Number.isFinite(y)) return null;
    const category = categories[index];
    if (!category) return null;
    const v0 = conv[0];
    const rawIndex =
      typeof v0 === "number" && Number.isFinite(v0)
        ? Math.max(0, Math.min(categories.length - 1, v0))
        : index;
    return { category, y, index, rawIndex };
  } catch {
    return null;
  }
}

export function pointerToData(
  chart: EChartsType,
  categories: string[],
  offsetX: number,
  offsetY: number,
): MacroPointerData | null {
  try {
    if (!chart.containPixel({ gridIndex: 0 }, [offsetX, offsetY])) return null;
  } catch {
    return null;
  }
  return pointerToDataInner(chart, categories, offsetX, offsetY);
}

/** 拖拽时使用：允许在绘图区边缘外继续换算坐标，避免跟手中断 */
export function pointerToDataForDrag(
  chart: EChartsType,
  categories: string[],
  offsetX: number,
  offsetY: number,
): MacroPointerData | null {
  return pointerToDataInner(chart, categories, offsetX, offsetY);
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

type ChartGridRect = { x: number; y: number; width: number; height: number };

function chartGridRect(chart: EChartsType): ChartGridRect | null {
  try {
    const internal = chart as unknown as {
      getModel(): { getComponent(name: string, index: number): unknown };
    };
    const grid = internal.getModel().getComponent("grid", 0) as
      | {
          coordinateSystem?: {
            getRect?: () => ChartGridRect;
          };
        }
      | undefined;
    const rect = grid?.coordinateSystem?.getRect?.();
    if (
      rect &&
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height) &&
      rect.width > 0 &&
      rect.height > 0
    ) {
      return rect;
    }
  } catch {
    /* chart 未就绪 */
  }
  return null;
}

function yAxisSpanData(chart: EChartsType): [number, number] | null {
  try {
    const raw = chart.getOption().yAxis;
    const ya = (Array.isArray(raw) ? raw[0] : raw) as
      | { min?: number | string; max?: number | string }
      | undefined;
    const min = typeof ya?.min === "number" ? ya.min : null;
    const max = typeof ya?.max === "number" ? ya.max : null;
    if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max)) {
      return min <= max ? [min, max] : [max, min];
    }
  } catch {
    /* ignore */
  }
  return null;
}

function gridSpanX(chart: EChartsType, categories: string[]): [number, number] | null {
  const rect = chartGridRect(chart);
  if (rect) return [rect.x, rect.x + rect.width];
  if (categories.length === 0) return null;
  const left = categoryYToPixel(chart, categories, categories[0]!, 0);
  const right = categoryYToPixel(chart, categories, categories[categories.length - 1]!, 0);
  if (!left || !right) return null;
  return [Math.min(left[0], right[0]), Math.max(left[0], right[0])];
}

function gridSpanY(chart: EChartsType, categories: string[]): [number, number] | null {
  const rect = chartGridRect(chart);
  if (rect) return [rect.y, rect.y + rect.height];
  if (categories.length === 0) return null;
  const mid = categories[Math.floor(categories.length / 2)]!;
  const span = yAxisSpanData(chart);
  if (span) {
    const top = categoryYToPixel(chart, categories, mid, span[1]);
    const bottom = categoryYToPixel(chart, categories, mid, span[0]);
    if (top && bottom) return [Math.min(top[1], bottom[1]), Math.max(top[1], bottom[1])];
  }
  const zero = categoryYToPixel(chart, categories, mid, 0);
  if (!zero) return null;
  return [zero[1], zero[1]];
}

function shiftCategory(categories: string[], category: string, deltaIdx: number): string {
  const idx = categories.indexOf(category);
  if (idx < 0) return category;
  const next = Math.max(0, Math.min(categories.length - 1, idx + deltaIdx));
  return categories[next] ?? category;
}

function distPointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

const HIT_PX = 8;

export function hitTestDrawing(
  chart: EChartsType,
  categories: string[],
  drawing: MacroDrawing,
  offsetX: number,
  offsetY: number,
): boolean {
  if (drawing.kind === "hline") {
    const p = categoryYToPixel(chart, categories, categories[0] ?? "", drawing.y);
    const spanX = gridSpanX(chart, categories);
    if (!p || !spanX) return false;
    return (
      offsetX >= spanX[0] - HIT_PX &&
      offsetX <= spanX[1] + HIT_PX &&
      Math.abs(offsetY - p[1]) <= HIT_PX
    );
  }
  if (drawing.kind === "vline") {
    const p = categoryYToPixel(chart, categories, drawing.category, 0);
    const spanY = gridSpanY(chart, categories);
    if (!p || !spanY) return false;
    return (
      Math.abs(offsetX - p[0]) <= HIT_PX &&
      offsetY >= spanY[0] - HIT_PX &&
      offsetY <= spanY[1] + HIT_PX
    );
  }
  if (drawing.kind === "trend") {
    const a = categoryYToPixel(chart, categories, drawing.x0, drawing.y0);
    const b = categoryYToPixel(chart, categories, drawing.x1, drawing.y1);
    if (!a || !b) return false;
    return distPointToSegment(offsetX, offsetY, a[0], a[1], b[0], b[1]) <= HIT_PX;
  }
  if (drawing.kind === "rect") {
    const a = categoryYToPixel(chart, categories, drawing.x0, drawing.y0);
    const b = categoryYToPixel(chart, categories, drawing.x1, drawing.y1);
    if (!a || !b) return false;
    const x = Math.min(a[0], b[0]);
    const y = Math.min(a[1], b[1]);
    const w = Math.abs(b[0] - a[0]);
    const h = Math.abs(b[1] - a[1]);
    const nearBorder =
      (offsetX >= x - HIT_PX &&
        offsetX <= x + w + HIT_PX &&
        offsetY >= y - HIT_PX &&
        offsetY <= y + h + HIT_PX) &&
      (offsetX <= x + HIT_PX ||
        offsetX >= x + w - HIT_PX ||
        offsetY <= y + HIT_PX ||
        offsetY >= y + h - HIT_PX);
    return nearBorder || (offsetX >= x && offsetX <= x + w && offsetY >= y && offsetY <= y + h);
  }
  if (drawing.kind === "text") {
    const p = categoryYToPixel(chart, categories, drawing.category, drawing.y);
    if (!p) return false;
    const style = resolveDrawingStyle(drawing.style);
    const tx = p[0] + 4;
    const ty = p[1] - 8;
    const w = Math.max(24, drawing.text.length * style.fontSize * 0.62) + 8;
    const h = style.fontSize + 10;
    return (
      offsetX >= tx - 4 &&
      offsetX <= tx + w &&
      offsetY >= ty - 4 &&
      offsetY <= ty + h
    );
  }
  return false;
}

export function hitTestDrawings(
  chart: EChartsType,
  categories: string[],
  drawings: MacroDrawing[],
  offsetX: number,
  offsetY: number,
): string | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]!;
    if (hitTestDrawing(chart, categories, d, offsetX, offsetY)) return d.id;
  }
  return null;
}

function categoryShiftFromPointerDelta(
  categories: string[],
  anchor: MacroPointerData,
  current: MacroPointerData,
): number {
  const d = current.rawIndex - anchor.rawIndex;
  if (!Number.isFinite(d) || Math.abs(d) < 0.35) return 0;
  return Math.round(d);
}

export function moveDrawingByDelta(
  drawing: MacroDrawing,
  categories: string[],
  anchor: MacroPointerData,
  current: MacroPointerData,
): MacroDrawing {
  const dIdx = categoryShiftFromPointerDelta(categories, anchor, current);
  const dY = current.y - anchor.y;
  if (drawing.kind === "hline") {
    return { ...drawing, y: drawing.y + dY };
  }
  if (drawing.kind === "vline") {
    return { ...drawing, category: shiftCategory(categories, drawing.category, dIdx) };
  }
  if (drawing.kind === "trend") {
    return {
      ...drawing,
      x0: shiftCategory(categories, drawing.x0, dIdx),
      y0: drawing.y0 + dY,
      x1: shiftCategory(categories, drawing.x1, dIdx),
      y1: drawing.y1 + dY,
    };
  }
  if (drawing.kind === "rect") {
    return {
      ...drawing,
      x0: shiftCategory(categories, drawing.x0, dIdx),
      y0: drawing.y0 + dY,
      x1: shiftCategory(categories, drawing.x1, dIdx),
      y1: drawing.y1 + dY,
    };
  }
  return {
    ...drawing,
    category: shiftCategory(categories, drawing.category, dIdx),
    y: drawing.y + dY,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(251, 191, 36, ${alpha})`;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function solidLineGraphic(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  lineWidth: number,
  z: number,
): GraphicComponentOption {
  return {
    id,
    type: "line",
    shape: { x1, y1, x2, y2 },
    style: { stroke, lineWidth },
    silent: true,
    z,
  };
}

function lineGraphic(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: MacroDrawingStyle,
  selected: boolean,
  forceDashed = false,
): GraphicComponentOption {
  const stroke = selected ? SELECT_STROKE : style.color;
  const lineWidth = selected ? style.lineWidth + 1 : style.lineWidth;
  const lineDash = forceDashed ? [4, 4] : lineDashFromStyle(style.lineStyle);
  const z = selected ? 102 : 100;
  if (lineDash) {
    return {
      id,
      type: "line",
      shape: { x1, y1, x2, y2 },
      style: { stroke, lineWidth, lineDash },
      silent: true,
      z,
    };
  }
  return solidLineGraphic(id, x1, y1, x2, y2, stroke, lineWidth, z);
}

/**
 * 水平/垂直线在 x1===x2 或 y1===y2 时，zrender 对 lineDash 的绘制会失效（包围盒一边为 0）。
 * 给 1px 亚像素偏移即可恢复虚线，勿用手动分段（否则长跨度会产生海量 graphic 导致卡死）。
 */
function axisAlignedLineGraphic(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: MacroDrawingStyle,
  selected: boolean,
): GraphicComponentOption {
  const dash = lineDashFromStyle(style.lineStyle);
  let fx1 = x1;
  let fy1 = y1;
  let fx2 = x2;
  let fy2 = y2;
  if (dash) {
    if (Math.abs(x1 - x2) < 0.5) {
      fx1 = x1 - 0.5;
      fx2 = x2 + 0.5;
    }
    if (Math.abs(y1 - y2) < 0.5) {
      fy1 = y1 - 0.5;
      fy2 = y2 + 0.5;
    }
  }
  return lineGraphic(id, fx1, fy1, fx2, fy2, style, selected);
}

export function buildMacroChartGraphics(
  chart: EChartsType,
  categories: string[],
  drawings: MacroDrawing[],
  draft: MacroDrawingDraft | null,
  hover: MacroPointerData | null,
  draftStyle: MacroDrawingStyle,
  selectedId: string | null,
): GraphicComponentOption[] {
  const out: GraphicComponentOption[] = [];

  for (const d of drawings) {
    const style = resolveDrawingStyle(d.style);
    const selected = d.id === selectedId;
    if (d.kind === "hline") {
      const p = categoryYToPixel(chart, categories, categories[0] ?? "", d.y);
      const spanX = gridSpanX(chart, categories);
      if (!p || !spanX) continue;
      out.push(axisAlignedLineGraphic(d.id, spanX[0], p[1], spanX[1], p[1], style, selected));
    } else if (d.kind === "vline") {
      const p = categoryYToPixel(chart, categories, d.category, 0);
      const spanY = gridSpanY(chart, categories);
      if (!p || !spanY) continue;
      out.push(axisAlignedLineGraphic(d.id, p[0], spanY[0], p[0], spanY[1], style, selected));
    } else if (d.kind === "trend") {
      const a = categoryYToPixel(chart, categories, d.x0, d.y0);
      const b = categoryYToPixel(chart, categories, d.x1, d.y1);
      if (!a || !b) continue;
      out.push(lineGraphic(d.id, a[0], a[1], b[0], b[1], style, selected));
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
        style: {
          fill: hexToRgba(style.color, style.fillOpacity),
          stroke: selected ? SELECT_STROKE : style.color,
          lineWidth: selected ? style.lineWidth + 1 : style.lineWidth,
          lineDash: lineDashFromStyle(style.lineStyle),
        },
        silent: true,
        z: selected ? 102 : 100,
      });
    } else if (d.kind === "text") {
      const p = categoryYToPixel(chart, categories, d.category, d.y);
      if (!p) continue;
      out.push({
        id: d.id,
        type: "text",
        style: {
          text: d.text,
          fill: selected ? SELECT_STROKE : style.textColor,
          fontSize: style.fontSize,
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          padding: [2, 4],
          borderRadius: 2,
        },
        x: p[0] + 4,
        y: p[1] - 8,
        silent: true,
        z: selected ? 103 : 101,
      });
    }
  }

  if (draft && hover) {
    const a = categoryYToPixel(chart, categories, draft.x0, draft.y0);
    const b = categoryYToPixel(chart, categories, hover.category, hover.y);
    if (a && b) {
      if (draft.tool === "trend") {
        out.push(lineGraphic("__draft__", a[0], a[1], b[0], b[1], draftStyle, false, true));
      } else {
        const x = Math.min(a[0], b[0]);
        const y = Math.min(a[1], b[1]);
        out.push({
          id: "__draft_rect__",
          type: "rect",
          shape: { x, y, width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) },
          style: {
            fill: hexToRgba(draftStyle.color, draftStyle.fillOpacity),
            stroke: draftStyle.color,
            lineWidth: draftStyle.lineWidth,
            lineDash: [4, 4],
          },
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
  draftStyle: MacroDrawingStyle = DEFAULT_MACRO_DRAWING_STYLE,
  selectedId: string | null = null,
): void {
  if (chart.isDisposed()) return;
  const graphic = buildMacroChartGraphics(
    chart,
    categories,
    drawings,
    draft,
    hover,
    draftStyle,
    selectedId,
  );
  chart.setOption({ graphic }, { replaceMerge: ["graphic"] });
}
