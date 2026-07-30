/**
 * 行情图可配置序列层（ChartLayer）：多资产价格、表达式、基本面统一模型。
 * 主 K 线不在此列表内；Layers 仅描述额外叠加。
 */

import { randomUUID } from "@/lib/randomId";

export const CHART_LAYER_MAX = 5;
export const CHART_LAYERS_STORAGE_PREFIX = "markets:chartLayers:v1:";

export const LAYER_COLORS = [
  "#38bdf8",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
] as const;

export type FundamentalMetric =
  | "ttmPe"
  | "forwardPe"
  | "pb"
  | "eps"
  | "revenue"
  | "grossMargin"
  | "operatingMargin"
  | "netMargin";

export const FUNDAMENTAL_METRIC_LABEL: Record<FundamentalMetric, string> = {
  ttmPe: "TTM PE",
  forwardPe: "Forward PE",
  pb: "PB",
  eps: "EPS（季）",
  revenue: "营收（季）",
  grossMargin: "毛利率",
  operatingMargin: "营业利润率",
  netMargin: "净利率",
};

export type ChartLayerSource =
  | { kind: "price"; symbol: string; field: "close" | "ohlc" }
  | { kind: "expr"; expr: string }
  | { kind: "fundamental"; symbol: string; metric: FundamentalMetric };

export type AxisBinding =
  | { mode: "right" }
  | { mode: "left" }
  | { mode: "scale"; scaleId: string }
  | { mode: "pane"; paneSlot: "sub1" | "sub2" | "overlayPane" };

export type LayerTransform = "raw" | "index100" | "pctChange";
export type LayerStyle = "line" | "step" | "histogram";

export type ChartLayer = {
  id: string;
  label: string;
  visible: boolean;
  color: string;
  lineWidth: 1 | 2 | 3;
  style: LayerStyle;
  source: ChartLayerSource;
  transform: LayerTransform;
  axis: AxisBinding;
};

export type ChartLayersPrefs = {
  layers: ChartLayer[];
  /** 一键对比：可见价格层统一 index100（主 K 仍为绝对价） */
  compareMode: boolean;
};

export const DEFAULT_CHART_LAYERS_PREFS: ChartLayersPrefs = {
  layers: [],
  compareMode: false,
};

const FUNDAMENTAL_METRICS = new Set<string>([
  "ttmPe",
  "forwardPe",
  "pb",
  "eps",
  "revenue",
  "grossMargin",
  "operatingMargin",
  "netMargin",
]);

function nextColor(existing: ChartLayer[]): string {
  const used = new Set(existing.map((l) => l.color));
  for (const c of LAYER_COLORS) {
    if (!used.has(c)) return c;
  }
  return LAYER_COLORS[existing.length % LAYER_COLORS.length]!;
}

/** 按来源类型给出默认轴（可手改） */
export function defaultAxisForSource(source: ChartLayerSource): AxisBinding {
  if (source.kind === "price") {
    return { mode: "left" };
  }
  if (source.kind === "expr") {
    const expr = source.expr;
    if (/\//.test(expr) && !/-/.test(expr.replace(/\s/g, ""))) {
      return { mode: "left" };
    }
    if (/-|\+|\*/.test(expr)) {
      return { mode: "scale", scaleId: `spread_${randomUUID().slice(0, 8)}` };
    }
    return { mode: "left" };
  }
  const m = source.metric;
  if (m === "ttmPe" || m === "forwardPe" || m === "pb") {
    return { mode: "scale", scaleId: `fund_${m}` };
  }
  if (m === "eps" || m === "revenue") {
    return { mode: "pane", paneSlot: "sub2" };
  }
  return { mode: "pane", paneSlot: "sub1" };
}

export function defaultStyleForSource(source: ChartLayerSource): LayerStyle {
  if (source.kind !== "fundamental") return "line";
  const m = source.metric;
  if (m === "eps" || m === "revenue" || m.endsWith("Margin")) return "step";
  return "line";
}

export function defaultLabelForSource(source: ChartLayerSource): string {
  if (source.kind === "price") return source.symbol.toUpperCase();
  if (source.kind === "expr") return source.expr.trim();
  const sym = source.symbol.toUpperCase();
  return `${sym} ${FUNDAMENTAL_METRIC_LABEL[source.metric]}`;
}

export function createChartLayer(
  source: ChartLayerSource,
  existing: ChartLayer[] = [],
  partial?: Partial<Pick<ChartLayer, "label" | "color" | "transform" | "axis" | "style" | "lineWidth" | "visible">>,
): ChartLayer {
  const normalized = normalizeSource(source);
  return {
    id: randomUUID(),
    label: partial?.label ?? defaultLabelForSource(normalized),
    visible: partial?.visible ?? true,
    color: partial?.color ?? nextColor(existing),
    lineWidth: partial?.lineWidth ?? 2,
    style: partial?.style ?? defaultStyleForSource(normalized),
    source: normalized,
    transform: partial?.transform ?? "raw",
    axis: partial?.axis ?? defaultAxisForSource(normalized),
  };
}

function normalizeSource(source: ChartLayerSource): ChartLayerSource {
  if (source.kind === "price") {
    return {
      kind: "price",
      symbol: source.symbol.trim().toUpperCase(),
      field: source.field === "ohlc" ? "ohlc" : "close",
    };
  }
  if (source.kind === "expr") {
    return { kind: "expr", expr: source.expr.trim() };
  }
  return {
    kind: "fundamental",
    symbol: source.symbol.trim().toUpperCase(),
    metric: source.metric,
  };
}

function sanitizeAxis(raw: unknown, fallback: AxisBinding): AxisBinding {
  if (!raw || typeof raw !== "object") return fallback;
  const a = raw as Record<string, unknown>;
  if (a.mode === "right" || a.mode === "left") return { mode: a.mode };
  if (a.mode === "scale" && typeof a.scaleId === "string" && a.scaleId.trim()) {
    return { mode: "scale", scaleId: a.scaleId.trim().slice(0, 48) };
  }
  if (a.mode === "pane") {
    const slot = a.paneSlot;
    if (slot === "sub1" || slot === "sub2" || slot === "overlayPane") {
      return { mode: "pane", paneSlot: slot };
    }
  }
  return fallback;
}

function sanitizeSource(raw: unknown): ChartLayerSource | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.kind === "price" && typeof s.symbol === "string" && s.symbol.trim()) {
    return {
      kind: "price",
      symbol: s.symbol.trim().toUpperCase(),
      field: s.field === "ohlc" ? "ohlc" : "close",
    };
  }
  if (s.kind === "expr" && typeof s.expr === "string" && s.expr.trim()) {
    return { kind: "expr", expr: s.expr.trim().slice(0, 120) };
  }
  if (
    s.kind === "fundamental" &&
    typeof s.symbol === "string" &&
    s.symbol.trim() &&
    typeof s.metric === "string" &&
    FUNDAMENTAL_METRICS.has(s.metric)
  ) {
    return {
      kind: "fundamental",
      symbol: s.symbol.trim().toUpperCase(),
      metric: s.metric as FundamentalMetric,
    };
  }
  return null;
}

export function sanitizeChartLayer(
  raw: unknown,
  existing: ChartLayer[] = [],
): ChartLayer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const source = sanitizeSource(r.source);
  if (!source) return null;
  const fallbackAxis = defaultAxisForSource(source);
  const id =
    typeof r.id === "string" && r.id.trim() ? r.id.trim().slice(0, 64) : randomUUID();
  const lw = r.lineWidth === 1 || r.lineWidth === 3 ? r.lineWidth : 2;
  const style: LayerStyle =
    r.style === "step" || r.style === "histogram" ? r.style : "line";
  const transform: LayerTransform =
    r.transform === "index100" || r.transform === "pctChange" ? r.transform : "raw";
  return {
    id,
    label:
      typeof r.label === "string" && r.label.trim()
        ? r.label.trim().slice(0, 64)
        : defaultLabelForSource(source),
    visible: typeof r.visible === "boolean" ? r.visible : true,
    color:
      typeof r.color === "string" && /^#[0-9a-fA-F]{6}$/.test(r.color)
        ? r.color
        : nextColor(existing),
    lineWidth: lw,
    style,
    source,
    transform,
    axis: sanitizeAxis(r.axis, fallbackAxis),
  };
}

export function sanitizeChartLayersPrefs(raw: unknown): ChartLayersPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CHART_LAYERS_PREFS };
  const r = raw as Record<string, unknown>;
  const layers: ChartLayer[] = [];
  if (Array.isArray(r.layers)) {
    for (const item of r.layers) {
      if (layers.length >= CHART_LAYER_MAX) break;
      const layer = sanitizeChartLayer(item, layers);
      if (layer) layers.push(layer);
    }
  }
  return {
    layers,
    compareMode: typeof r.compareMode === "boolean" ? r.compareMode : false,
  };
}

export function storageKeyForLayers(primarySymbol: string): string {
  const sym = primarySymbol.trim().toUpperCase() || "_none";
  return `${CHART_LAYERS_STORAGE_PREFIX}${sym}`;
}

export function loadChartLayersPrefs(primarySymbol: string): ChartLayersPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_CHART_LAYERS_PREFS };
  try {
    const raw = window.localStorage.getItem(storageKeyForLayers(primarySymbol));
    if (!raw) return { ...DEFAULT_CHART_LAYERS_PREFS };
    return sanitizeChartLayersPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CHART_LAYERS_PREFS };
  }
}

export function saveChartLayersPrefs(
  primarySymbol: string,
  prefs: ChartLayersPrefs,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKeyForLayers(primarySymbol),
      JSON.stringify({
        layers: prefs.layers.slice(0, CHART_LAYER_MAX),
        compareMode: prefs.compareMode,
      }),
    );
  } catch {
    /* ignore quota */
  }
}

/** 结构指纹：仅影响序列条数/轴/样式的字段（数据刷新不应触发重建） */
export function chartLayersStructKey(prefs: ChartLayersPrefs): string {
  const parts = prefs.layers.map((l) => {
    const src =
      l.source.kind === "price"
        ? `p:${l.source.symbol}:${l.source.field}`
        : l.source.kind === "expr"
          ? `e:${l.source.expr}`
          : `f:${l.source.symbol}:${l.source.metric}`;
    const axis =
      l.axis.mode === "scale"
        ? `s:${l.axis.scaleId}`
        : l.axis.mode === "pane"
          ? `pane:${l.axis.paneSlot}`
          : l.axis.mode;
    return `${l.id}|${l.visible ? 1 : 0}|${src}|${axis}|${l.style}|${l.color}|${l.lineWidth}|${l.transform}`;
  });
  return `${prefs.compareMode ? "c1" : "c0"}::${parts.join(";")}`;
}

/** 解析 Layer 需要拉取的价格 symbol（含表达式内 token） */
export function collectPriceSymbolsFromLayers(
  layers: ChartLayer[],
  exprSymbols: (expr: string) => string[],
): string[] {
  const set = new Set<string>();
  for (const l of layers) {
    if (!l.visible) continue;
    if (l.source.kind === "price") set.add(l.source.symbol);
    if (l.source.kind === "expr") {
      for (const s of exprSymbols(l.source.expr)) set.add(s);
    }
  }
  return [...set];
}

export function collectFundamentalRequests(
  layers: ChartLayer[],
): { symbol: string; metrics: FundamentalMetric[] }[] {
  const bySym = new Map<string, Set<FundamentalMetric>>();
  for (const l of layers) {
    if (!l.visible || l.source.kind !== "fundamental") continue;
    const sym = l.source.symbol;
    const set = bySym.get(sym) ?? new Set();
    set.add(l.source.metric);
    bySym.set(sym, set);
  }
  return [...bySym.entries()].map(([symbol, metrics]) => ({
    symbol,
    metrics: [...metrics],
  }));
}

/** 内置模板 */
export type LayerTemplateId = "vsSpy" | "peOnChart" | "spreadVsPeer";

export function applyLayerTemplate(
  templateId: LayerTemplateId,
  primarySymbol: string,
  existing: ChartLayer[],
  peerSymbol = "MSFT",
): ChartLayer[] {
  const primary = primarySymbol.trim().toUpperCase();
  const peer = peerSymbol.trim().toUpperCase() || "MSFT";
  const out = [...existing];
  const room = () => CHART_LAYER_MAX - out.length;

  if (templateId === "vsSpy") {
    if (room() > 0) {
      out.push(
        createChartLayer(
          { kind: "price", symbol: "SPY", field: "close" },
          out,
          { transform: "index100", axis: { mode: "right" }, label: "SPY (指数化)" },
        ),
      );
    }
    if (room() > 0 && primary) {
      out.push(
        createChartLayer(
          { kind: "expr", expr: `${primary} / SPY` },
          out,
          { transform: "index100", axis: { mode: "left" }, label: `${primary}/SPY` },
        ),
      );
    }
    return out;
  }

  if (templateId === "peOnChart") {
    if (room() > 0 && primary) {
      out.push(
        createChartLayer(
          { kind: "fundamental", symbol: primary, metric: "ttmPe" },
          out,
          { axis: { mode: "scale", scaleId: "fund_ttmPe" } },
        ),
      );
    }
    return out;
  }

  if (templateId === "spreadVsPeer" && primary && peer && primary !== peer) {
    if (room() > 0) {
      out.push(
        createChartLayer(
          { kind: "price", symbol: peer, field: "close" },
          out,
          { axis: { mode: "left" } },
        ),
      );
    }
    if (room() > 0) {
      out.push(
        createChartLayer(
          { kind: "expr", expr: `${primary} - ${peer}` },
          out,
          { label: `${primary}-${peer}` },
        ),
      );
    }
    return out;
  }

  return out;
}

/** LWC priceScaleId：right 用默认 ""；left 用 "left"；scale/pane 用自定义 */
export function resolvePriceScaleId(axis: AxisBinding): string {
  if (axis.mode === "right") return "right";
  if (axis.mode === "left") return "left";
  if (axis.mode === "scale") return axis.scaleId;
  if (axis.paneSlot === "overlayPane") return `overlay_${axis.paneSlot}`;
  return `pane_layer_${axis.paneSlot}`;
}

export function layerNeedsLeftScale(layers: ChartLayer[]): boolean {
  return layers.some((l) => l.visible && l.axis.mode === "left");
}

export function effectiveTransform(
  layer: ChartLayer,
  compareMode: boolean,
): LayerTransform {
  if (compareMode && layer.source.kind === "price" && layer.transform === "raw") {
    return "index100";
  }
  return layer.transform;
}
