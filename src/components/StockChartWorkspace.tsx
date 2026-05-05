"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { ChartTimeRangeBrush } from "@/components/chart/ChartTimeRangeBrush";
import { KlineRangeStatsPanel } from "@/components/chart/KlineRangeStatsPanel";
import {
  computeKlineRangeStats,
  computeRangeOverlayPx,
  type KlineRangeStatsResult,
} from "@/lib/chart/klineRangeStats";
import {
  pickDrawingAt,
  type DrawingHitTarget,
} from "@/lib/chart/drawingHitTest";
import type { KlinePayload } from "@/lib/data/types";
import {
  bollinger,
  kdj,
  macd,
  rsi,
  sma,
} from "@/lib/chart/technicalIndicators";
import {
  ChartDrawingOverlay,
  type DrawingDraftPreview,
  type SvgOverlayShape,
} from "@/components/chart/ChartDrawingOverlay";
import type { RangeStatWireSegment } from "@/lib/klinePageSyncChannel";

export type StockChartWorkspaceProps = {
  symbol: string;
  interval: string;
  source: "binance" | "yahoo" | "massive" | "ibkr";
  /** 占满父级剩余高度（行情页全屏用） */
  fillHeight?: boolean;
  /** 数据源说明（如 attribution），供顶栏展示 */
  onAttributionChange?: (text: string | null) => void;
  /** 当前标的 K 线拉取成功（含周期切换后成功）时回调，例如收起联想列表避免遮挡图 */
  onKlineLoadSuccess?: () => void;

  /** ---------- 多页面同步（BroadcastChannel，仅行情页勾选「页面同步」时） ---------- */
  pageSyncEnabled?: boolean;
  /** 勾选同步后递增，用于向其它标签广播当前可见时间区间（leader） */
  pageSyncLeadNonce?: number;
  /** leader 快照（当前周期 + 可见时间 unix 秒 + 区间统计时间锚点） */
  onPageSyncLeaderSnapshot?: (payload: {
    interval: string;
    visible: { from: number; to: number };
    rangeStats: RangeStatWireSegment[];
  }) => void;
  /** 远端可见时间区间（Unix 秒）；版本号变化时重新应用 */
  remoteVisibleTimeRange?: { from: number; to: number } | null;
  /** 递增则重新应用 remoteVisibleTimeRange；0 表示尚未同步 */
  remoteVisibleTimeRangeVersion?: number;
  /** 远端十字线锚点（某根 K 线的 time）；版本变化时应用 */
  remoteCrosshairTime?: number | null;
  /** 递增则应用十字线；0 表示尚未同步 */
  remoteCrosshairVersion?: number;
  /** 远端区间统计（柱起止 Unix 秒）；版本变化时按本地 K 线重映射 */
  remoteRangeSpecs?: RangeStatWireSegment[] | null;
  /** 递增则应用 remoteRangeSpecs；0 表示尚未同步 */
  remoteRangeSpecsVersion?: number;
  /** 本图区间统计变化时广播（页面同步开启） */
  onRangeSpecsBroadcast?: (ranges: RangeStatWireSegment[]) => void;
  /** 本图可见区间变化（用户缩放/平移） */
  onLocalVisibleTimeRange?: (from: number, to: number) => void;
  /** 本图十字锚定的柱时间 */
  onLocalCrosshairTime?: (time: UTCTimestamp | null) => void;
};

type DrawingTool =
  | "cursor"
  | "trend"
  | "hline"
  | "vline"
  | "rect"
  | "fib"
  | "channel"
  | "text";

/** 单个副图：成交量或振荡指标之一 */
type SubPaneContent = "volume" | "kdj" | "macd" | "rsi";

/** 主图价格叠加（与副图指标无关） */
type MainOverlayKind = "none" | "ma" | "boll";

export type PersistedDrawing =
  | { id: string; kind: "hline"; price: number }
  | {
      id: string;
      kind: "trend";
      t1: number;
      p1: number;
      t2: number;
      p2: number;
    }
  | SvgOverlayShape;

function storageKey(source: string, symbol: string, interval: string) {
  return `kline-drawings-v1:${source}:${symbol}:${interval}`;
}

function syntheticVolumes(candles: CandlestickData[]): number[] {
  return candles.map(
    (c) => Math.abs(c.close - c.open) * 1_000_000 + Math.random() * 1e3,
  );
}

type SubPaneScaleKey = "a" | "b";

/** 副图顶栏高度（px）；scaleMargins 同步预留，避免压在成交量柱/指标线上 */
const SUB_PANE_TOOLBAR_PX = 26;

/**
 * 顶栏 top 写入 chart 容器 CSS 变量，与测量同一时刻生效。
 * 若只用 React `style={{ top: n }}`，setState 可能晚于绘制提交，拖分界时副图2 顶栏会慢一拍，点按钮再渲染才对齐。
 */
function writeToolbarTopCssVars(
  area: HTMLElement,
  slot1: { top: number } | null,
  slot2: { top: number } | null,
): void {
  if (slot1) {
    area.style.setProperty("--kline-sp1-top", `${slot1.top}px`);
  } else {
    area.style.removeProperty("--kline-sp1-top");
  }
  if (slot2) {
    area.style.setProperty("--kline-sp2-top", `${slot2.top}px`);
  } else {
    area.style.removeProperty("--kline-sp2-top");
  }
}

/** 按当前 pane 高度把顶栏换算进 scaleMargins，使绘制区始终在该条带之下 */
function applySubPaneToolbarScaleMargins(
  chart: IChartApi,
  toolbarPx: number,
  subPane1: { visible: boolean; content: SubPaneContent },
  subPane2: { visible: boolean; content: SubPaneContent },
): void {
  const panes = chart.panes();
  if (panes.length <= 1) return;

  const toolbarFrac = (paneIdx: number, rowMul = 1) =>
    Math.min(
      0.82,
      (toolbarPx * rowMul) / Math.max(panes[paneIdx]?.getHeight() ?? 100, 8),
    );

  const applyOscRight = (paneIdx: number, baseTop: number, rowMul = 1) => {
    const t = Math.max(baseTop, toolbarFrac(paneIdx, rowMul));
    chart.priceScale("right", paneIdx).applyOptions({
      scaleMargins: { top: t, bottom: 0 },
    });
  };

  const v1 = subPane1.visible;
  const v2 = subPane2.visible;

  if (panes.length === 2) {
    const idx = 1;
    /** 仅一块副图 pane 时顶栏叠两行（隐藏槽位仍占位），预留双倍顶边 */
    const tf = toolbarFrac(idx, 2);
    if (v1) {
      const c = subPane1.content;
      if (c === "volume") {
        chart.priceScale("vol_a", idx).applyOptions({
          scaleMargins: { top: Math.max(0.75, tf), bottom: 0 },
        });
      } else if (c === "macd") {
        const t = Math.max(0.3, tf);
        chart.priceScale("macd_a", idx).applyOptions({
          scaleMargins: { top: t, bottom: 0 },
        });
        chart.priceScale("right", idx).applyOptions({
          scaleMargins: { top: t, bottom: 0 },
        });
      } else {
        applyOscRight(idx, 0.12, 2);
      }
    } else if (v2) {
      const c = subPane2.content;
      if (c === "volume") {
        chart.priceScale("vol_b", idx).applyOptions({
          scaleMargins: { top: Math.max(0.75, tf), bottom: 0 },
        });
      } else if (c === "macd") {
        const t = Math.max(0.3, tf);
        chart.priceScale("macd_b", idx).applyOptions({
          scaleMargins: { top: t, bottom: 0 },
        });
        chart.priceScale("right", idx).applyOptions({
          scaleMargins: { top: t, bottom: 0 },
        });
      } else {
        applyOscRight(idx, 0.12, 2);
      }
    }
    return;
  }

  if (v1) {
    const idx = 1;
    const tf = toolbarFrac(idx);
    const c = subPane1.content;
    if (c === "volume") {
      chart.priceScale("vol_a", idx).applyOptions({
        scaleMargins: { top: Math.max(0.75, tf), bottom: 0 },
      });
    } else if (c === "macd") {
      const t = Math.max(0.3, tf);
      chart.priceScale("macd_a", idx).applyOptions({
        scaleMargins: { top: t, bottom: 0 },
      });
      chart.priceScale("right", idx).applyOptions({
        scaleMargins: { top: t, bottom: 0 },
      });
    } else {
      applyOscRight(idx, 0.12);
    }
  }
  if (v2) {
    const idx = 2;
    const tf = toolbarFrac(idx);
    const c = subPane2.content;
    if (c === "volume") {
      chart.priceScale("vol_b", idx).applyOptions({
        scaleMargins: { top: Math.max(0.75, tf), bottom: 0 },
      });
    } else if (c === "macd") {
      const t = Math.max(0.3, tf);
      chart.priceScale("macd_b", idx).applyOptions({
        scaleMargins: { top: t, bottom: 0 },
      });
      chart.priceScale("right", idx).applyOptions({
        scaleMargins: { top: t, bottom: 0 },
      });
    } else {
      applyOscRight(idx, 0.12);
    }
  }
}

function appendSubPaneSeries(
  chart: IChartApi,
  candles: CandlestickData[],
  volumes: number[],
  paneIndex: number,
  content: SubPaneContent,
  scaleKey: SubPaneScaleKey,
): void {
  if (!candles.length) return;
  if (content === "volume") {
    const histData = candles.map((c, i) => ({
      time: c.time,
      value: volumes[i] ?? 0,
      color:
        c.close >= c.open ? "rgba(38,166,154,0.65)" : "rgba(239,83,80,0.65)",
    }));
    const sid = `vol_${scaleKey}`;
    const vol = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: "volume" },
        priceScaleId: sid,
      },
      paneIndex,
    );
    chart.priceScale(sid, paneIndex).applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    });
    vol.setData(histData);
    return;
  }
  if (content === "kdj") {
    const { k, d, j } = kdj(candles);
    const ks = chart.addSeries(
      LineSeries,
      { color: "#fbbf24", lineWidth: 1 },
      paneIndex,
    );
    const ds = chart.addSeries(
      LineSeries,
      { color: "#60a5fa", lineWidth: 1 },
      paneIndex,
    );
    const js = chart.addSeries(
      LineSeries,
      { color: "#f472b6", lineWidth: 1 },
      paneIndex,
    );
    ks.setData(k);
    ds.setData(d);
    js.setData(j);
    return;
  }
  if (content === "macd") {
    const { dif, dea, hist } = macd(candles);
    const sid = `macd_${scaleKey}`;
    const difs = chart.addSeries(
      LineSeries,
      { color: "#fbbf24", lineWidth: 1 },
      paneIndex,
    );
    const deas = chart.addSeries(
      LineSeries,
      { color: "#60a5fa", lineWidth: 1 },
      paneIndex,
    );
    const hi = chart.addSeries(
      HistogramSeries,
      { priceScaleId: sid },
      paneIndex,
    );
    chart.priceScale(sid, paneIndex).applyOptions({
      scaleMargins: { top: 0.3, bottom: 0 },
    });
    difs.setData(dif);
    deas.setData(dea);
    hi.setData(hist);
    return;
  }
  if (content === "rsi") {
    const r = rsi(candles);
    const rs = chart.addSeries(
      LineSeries,
      { color: "#a78bfa", lineWidth: 1 },
      paneIndex,
    );
    rs.setData(r);
  }
}

function parsePersisted(raw: string | null): PersistedDrawing[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter(Boolean) as PersistedDrawing[];
  } catch {
    return [];
  }
}

/** 十字光标当前柱 OHLCV（图内浮动框） */
type CrosshairOhlcv = {
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 相对图宽的横坐标，用于决定浮窗靠左/靠右避让光标 */
  cursorX: number;
};

function formatBarTimeLabel(t: Time, intervalRaw: string): string {
  if (typeof t !== "number") return String(t);
  const d = new Date(t * 1000);
  const daysZh = ["日", "一", "二", "三", "四", "五", "六"];
  const week = "周" + daysZh[d.getDay()];
  const iv = intervalRaw;
  if (iv === "15m" || iv === "1h" || iv === "4h") {
    return `${d.toLocaleString("zh-CN", { hour12: false })} ${week}`;
  }
  return `${d.toLocaleDateString("zh-CN")} ${week}`;
}

function fmtPriceCompact(x: number): string {
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1000) return x.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  if (a >= 1) return x.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
  return x.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
}

function fmtVolumeZh(v: number): string {
  if (!Number.isFinite(v) || v < 0) return "—";
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万`;
  return v.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

/** 与 lightweight-charts 内部 MIN_PANE_HEIGHT 一致 */
const MIN_PANE_PX = 30;

/** 多区间统计：每条区间独立颜色（竖线与弹窗标题同色） */
const RANGE_PALETTE = [
  "#f59e0b",
  "#22d3ee",
  "#a78bfa",
  "#fb7185",
  "#84cc16",
  "#fb923c",
];

type RangeStatEntry = {
  id: string;
  color: string;
  i0: number;
  i1: number;
  stats: KlineRangeStatsResult;
};

function nearestBarIndexForTime(
  candles: CandlestickData[],
  targetTime: number,
): number {
  if (!candles.length) return 0;
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const tt = candles[i].time as number;
    const d = Math.abs(tt - targetTime);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

function mapTimePairToBarIndices(
  candles: CandlestickData[],
  fromTime: number,
  toTime: number,
): { i0: number; i1: number } | null {
  if (!candles.length) return null;
  let f = fromTime;
  let t = toTime;
  if (f > t) [f, t] = [t, f];
  let i0 = nearestBarIndexForTime(candles, f);
  let i1 = nearestBarIndexForTime(candles, t);
  if (i0 > i1) [i0, i1] = [i1, i0];
  return { i0, i1 };
}

function serializeRangeEntriesToWire(
  entries: RangeStatEntry[],
  candles: CandlestickData[],
): RangeStatWireSegment[] {
  const out: RangeStatWireSegment[] = [];
  for (const r of entries) {
    const t0 = candles[r.i0]?.time;
    const t1 = candles[r.i1]?.time;
    if (typeof t0 !== "number" || typeof t1 !== "number") continue;
    out.push({ color: r.color, fromTime: t0, toTime: t1 });
  }
  return out;
}

function wireSpecsToRangeEntries(
  specs: RangeStatWireSegment[],
  candles: CandlestickData[],
  volumes: number[],
  interval: string,
): RangeStatEntry[] {
  const out: RangeStatEntry[] = [];
  for (const s of specs) {
    const m = mapTimePairToBarIndices(candles, s.fromTime, s.toTime);
    if (!m) continue;
    const stats = computeKlineRangeStats(
      candles,
      volumes,
      m.i0,
      m.i1,
      interval,
    );
    if (!stats) continue;
    out.push({
      id: crypto.randomUUID(),
      color: s.color,
      i0: m.i0,
      i1: m.i1,
      stats,
    });
  }
  return out;
}

function rangePanelTitle(index: number): string {
  return index === 0 ? "区间统计" : `区间统计${index + 1}`;
}

export function StockChartWorkspace({
  symbol,
  interval,
  source,
  fillHeight = false,
  onAttributionChange,
  onKlineLoadSuccess,
  pageSyncEnabled = false,
  pageSyncLeadNonce = 0,
  onPageSyncLeaderSnapshot,
  remoteVisibleTimeRange = null,
  remoteVisibleTimeRangeVersion = 0,
  remoteCrosshairTime = null,
  remoteCrosshairVersion = 0,
  remoteRangeSpecs = null,
  remoteRangeSpecsVersion = 0,
  onRangeSpecsBroadcast,
  onLocalVisibleTimeRange,
  onLocalCrosshairTime,
}: StockChartWorkspaceProps) {
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const nativeHandlesRef = useRef<{
    userPriceLines: IPriceLine[];
    userTrendLines: ISeriesApi<"Line", Time>[];
    /** BOLL 或 MA 等主图均线句柄（图表重建时清空） */
    overlayLines: ISeriesApi<"Line", Time>[];
  }>({ userPriceLines: [], userTrendLines: [], overlayLines: [] });

  const [payload, setPayload] = useState<KlinePayload | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [klineError, setKlineError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState<DrawingTool>("cursor");
  const toolRef = useRef<DrawingTool>("cursor");
  const [mainOverlay, setMainOverlay] = useState<MainOverlayKind>("boll");
  /** 两个副图可独立选成交量/指标、可单独关闭 */
  const [subPane1, setSubPane1] = useState<{
    visible: boolean;
    content: SubPaneContent;
  }>({ visible: true, content: "volume" });
  const [subPane2, setSubPane2] = useState<{
    visible: boolean;
    content: SubPaneContent;
  }>({ visible: true, content: "kdj" });
  const [drawings, setDrawings] = useState<PersistedDrawing[]>([]);
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(
    null,
  );
  const [overlaySize, setOverlaySize] = useState({ w: 0, h: 0 });
  const overlaySizeRef = useRef(overlaySize);
  overlaySizeRef.current = overlaySize;
  /** 供底部时间范围条绑定同一 chart 实例（ref 变化不会触发 render） */
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const [crosshairOhlcv, setCrosshairOhlcv] = useState<CrosshairOhlcv | null>(
    null,
  );
  const [rangeDragPx, setRangeDragPx] = useState<{
    x1: number;
    x2: number;
    draftColor: string;
  } | null>(null);
  /** 多条区间统计；标题按顺序为「区间统计」「区间统计2」… */
  const [rangeEntries, setRangeEntries] = useState<RangeStatEntry[]>([]);
  /** 横向缩放/平移后强制重算区间像素位置 */
  const [overlayLayoutTick, setOverlayLayoutTick] = useState(0);
  /** 主图 pane 在行情区内的位置，用于区间选区竖向裁剪 + 分隔条定位 */
  const [mainPaneClip, setMainPaneClip] = useState<{
    top: number;
    height: number;
  } | null>(null);
  const [splitterY, setSplitterY] = useState<{
    sep01: number;
    sep12?: number;
  } | null>(null);
  /** 各副图槽位顶栏的像素位置（相对 chart 容器），与 pane DOM 一致 */
  const [subPaneToolbarGeom, setSubPaneToolbarGeom] = useState<{
    slot1: { top: number; height: number } | null;
    slot2: { top: number; height: number } | null;
  }>({ slot1: null, slot2: null });
  const rangeDragRef = useRef<{ start: number; cur: number } | null>(null);
  /** 多点画线草稿 + 十字跟随预览（虚线辅助） */
  const [plotDraft, setPlotDraft] = useState<DrawingDraftPreview | null>(null);
  const [drawToolMenuOpen, setDrawToolMenuOpen] = useState(false);
  const drawToolMenuRef = useRef<HTMLDivElement>(null);

  const pageSyncEnabledRef = useRef(false);
  const suppressVisibleRangeBroadcastRef = useRef(false);
  const suppressCrosshairBroadcastRef = useRef(false);
  const suppressRangeSpecsBroadcastRef = useRef(false);
  const rangeBroadcastTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const onRangeSpecsBroadcastRef = useRef(onRangeSpecsBroadcast);
  const onLocalVisibleTimeRangeRef = useRef(onLocalVisibleTimeRange);
  const onLocalCrosshairTimeRef = useRef(onLocalCrosshairTime);
  onRangeSpecsBroadcastRef.current = onRangeSpecsBroadcast;
  onLocalVisibleTimeRangeRef.current = onLocalVisibleTimeRange;
  onLocalCrosshairTimeRef.current = onLocalCrosshairTime;
  const onKlineLoadSuccessRef = useRef(onKlineLoadSuccess);
  onKlineLoadSuccessRef.current = onKlineLoadSuccess;
  useEffect(() => {
    pageSyncEnabledRef.current = Boolean(pageSyncEnabled);
  }, [pageSyncEnabled]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    if (!drawToolMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (drawToolMenuRef.current?.contains(e.target as Node)) return;
      setDrawToolMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [drawToolMenuOpen]);

  useEffect(() => {
    onAttributionChange?.(hint);
  }, [hint, onAttributionChange]);

  useEffect(() => {
    return () => {
      onAttributionChange?.(null);
    };
  }, [onAttributionChange]);

  useEffect(() => {
    let cancelled = false;
    if (!symbol.trim()) {
      setLoading(false);
      setPayload(null);
      setHint(null);
      setKlineError(null);
      return;
    }
    setLoading(true);
    setPayload(null);
    setHint(null);
    setKlineError(null);
    const qs = new URLSearchParams({
      source,
      symbol,
      interval,
      limit: "400",
    });
    fetch(`/api/data/klines?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `${r.status}`);
        }
        return r.json() as Promise<KlinePayload>;
      })
      .then((p) => {
        if (cancelled) return;
        setPayload(p);
        setHint(p.attribution ?? null);
        setKlineError(null);
        onKlineLoadSuccessRef.current?.();
      })
      .catch((e) => {
        if (cancelled) return;
        setPayload(null);
        setHint(null);
        setKlineError(
          e instanceof Error ? e.message : "K 线接口请求失败",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, interval, source]);

  useEffect(() => {
    if (!symbol.trim()) {
      setDrawings([]);
      setSelectedDrawingId(null);
      return;
    }
    const key = storageKey(source, symbol, interval);
    setDrawings(parsePersisted(typeof window !== "undefined" ? localStorage.getItem(key) : null));
    setSelectedDrawingId(null);
  }, [source, symbol, interval]);

  useEffect(() => {
    if (!symbol.trim()) return;
    const key = storageKey(source, symbol, interval);
    try {
      localStorage.setItem(key, JSON.stringify(drawings));
    } catch {
      /* ignore */
    }
  }, [drawings, source, symbol, interval]);

  const candles = useMemo(
    () => payload?.candles ?? [],
    [payload?.candles],
  );
  const volumes = useMemo(() => {
    const c = payload?.candles ?? [];
    if (payload?.volumes && payload.volumes.length === c.length) {
      return payload.volumes;
    }
    return c.length ? syntheticVolumes(c) : [];
  }, [payload?.candles, payload?.volumes]);

  const candlesRef = useRef(candles);
  const volumesRef = useRef(volumes);
  const intervalRef = useRef(interval);
  const rangeEntriesRef = useRef(rangeEntries);
  candlesRef.current = candles;
  volumesRef.current = volumes;
  intervalRef.current = interval;
  rangeEntriesRef.current = rangeEntries;

  const syncPaneLayoutMetrics = useCallback(() => {
    const area = chartAreaRef.current;
    const chart = chartRef.current;
    if (!area || !chart) return;
    const panes = chart.panes();
    const ar = area.getBoundingClientRect();
    const p0el = panes[0]?.getHTMLElement();
    if (!p0el) return;
    const r0 = p0el.getBoundingClientRect();

    setMainPaneClip({
      top: r0.top - ar.top,
      height: r0.height,
    });

    let slot1Geom: { top: number; height: number } | null = null;
    let slot2Geom: { top: number; height: number } | null = null;

    /** 双副图均隐藏：仅剩主图，两行指标条叠在主图底边下方（仍可点「显示」） */
    if (panes.length === 1) {
      const belowMain = r0.bottom - ar.top;
      slot1Geom = {
        top: belowMain,
        height: SUB_PANE_TOOLBAR_PX,
      };
      slot2Geom = {
        top: belowMain + SUB_PANE_TOOLBAR_PX,
        height: SUB_PANE_TOOLBAR_PX,
      };
      writeToolbarTopCssVars(area, slot1Geom, slot2Geom);
      setSplitterY(null);
      setSubPaneToolbarGeom({ slot1: slot1Geom, slot2: slot2Geom });
      return;
    }

    /** 与分界条一致：用上一窗格底边作为下一窗格顶边，避免 r2.top 比 r1.bottom 晚一帧导致副图2 顶栏滞后 */
    const sep01Px = r0.bottom - ar.top;

    if (panes.length === 2) {
      setSplitterY({ sep01: sep01Px });
      const p1 = panes[1];
      const hel1 = p1?.getHTMLElement();
      if (hel1) {
        const r1 = hel1.getBoundingClientRect();
        const h1 = p1.getHeight();
        const hPx = h1 || r1.height;
        const p1Top = r1.top - ar.top;
        /** 只有一块副图 pane：两行顶栏垂直叠放，隐藏的槽仍保留按钮（「隐藏」→「显示」） */
        slot1Geom = { top: p1Top, height: hPx };
        slot2Geom = {
          top: p1Top + SUB_PANE_TOOLBAR_PX,
          height: hPx,
        };
      }
      writeToolbarTopCssVars(area, slot1Geom, slot2Geom);
      setSubPaneToolbarGeom({ slot1: slot1Geom, slot2: slot2Geom });
      applySubPaneToolbarScaleMargins(chart, SUB_PANE_TOOLBAR_PX, subPane1, subPane2);
      return;
    }

    const p1el = panes[1]?.getHTMLElement();
    if (!p1el) {
      writeToolbarTopCssVars(area, null, null);
      return;
    }
    const r1 = p1el.getBoundingClientRect();
    const p1Top = r1.top - ar.top;
    const h1Px = panes[1]!.getHeight();
    /**
     * 副图1 底边 = 顶边 + 库返回高度。拖「主图↔副图1」分界时 DOM 的 r1.bottom 常比 stretch 晚一帧，
     * 若用 r1.bottom 算 sep12，会出现「另一条线」对应的副图2 顶栏不同步；getHeight() 与 setStretchFactor 一致。
     */
    const sep12Px = p1Top + h1Px;
    setSplitterY({
      sep01: sep01Px,
      sep12: sep12Px,
    });
    slot1Geom = { top: p1Top, height: h1Px || r1.height };
    if (panes[2]) {
      const h2 = panes[2].getHeight();
      const r2 = panes[2].getHTMLElement()?.getBoundingClientRect();
      slot2Geom = {
        top: sep12Px,
        height: h2 || (r2?.height ?? 0),
      };
    }
    writeToolbarTopCssVars(area, slot1Geom, slot2Geom);
    setSubPaneToolbarGeom({ slot1: slot1Geom, slot2: slot2Geom });
    applySubPaneToolbarScaleMargins(chart, SUB_PANE_TOOLBAR_PX, subPane1, subPane2);
  }, [subPane1, subPane2]);

  /**
   * setStretchFactor 后 DOM 晚一帧才稳定，双 rAF 再量。
   * 用递增 generation：拖动时连续调用不会丢最后一次（避免「排队中则跳过」导致副图2 顶栏不跟分界）。
   */
  const layoutMetricsGenRef = useRef(0);
  const schedulePaneLayoutMetrics = useCallback(() => {
    const gen = ++layoutMetricsGenRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gen !== layoutMetricsGenRef.current) return;
        syncPaneLayoutMetrics();
      });
    });
  }, [syncPaneLayoutMetrics]);

  const clearAllRangeStats = useCallback(() => {
    setRangeEntries([]);
    setRangeDragPx(null);
  }, []);

  const removeRangeEntry = useCallback((id: string) => {
    setRangeEntries((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const finalizeRangeSelection = useCallback((x1: number, x2: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const c = candlesRef.current;
    if (!c.length) return;
    const v = volumesRef.current;
    const log1 = chart.timeScale().coordinateToLogical(x1);
    const log2 = chart.timeScale().coordinateToLogical(x2);
    if (log1 === null || log2 === null) return;
    const L = Math.min(log1 as number, log2 as number);
    const R = Math.max(log1 as number, log2 as number);
    let i0 = Math.floor(L);
    let i1 = Math.ceil(R);
    i0 = Math.max(0, Math.min(c.length - 1, i0));
    i1 = Math.max(0, Math.min(c.length - 1, i1));
    if (i1 < i0) [i0, i1] = [i1, i0];
    const stats = computeKlineRangeStats(
      c,
      v,
      i0,
      i1,
      intervalRef.current,
    );
    if (!stats) return;
    setRangeEntries((prev) => {
      const color = RANGE_PALETTE[prev.length % RANGE_PALETTE.length];
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          color,
          i0,
          i1,
          stats,
        },
      ];
    });
  }, []);

  const attachRangeEdgeDrag = useCallback(
    (rangeId: string, edge: "left" | "right") =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (tool !== "cursor") return;
        e.preventDefault();
        e.stopPropagation();
        const chart = chartRef.current;
        const wrap = wrapRef.current;
        if (!chart || !wrap) return;
        const rect = wrap.getBoundingClientRect();
        const pid = e.pointerId;
        const captureEl = e.currentTarget;
        captureEl.setPointerCapture(pid);

        chart.applyOptions({
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: false,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
        });

        const onMove = (ev: PointerEvent) => {
          const x = Math.max(
            0,
            Math.min(rect.width, ev.clientX - rect.left),
          );
          const log = chart.timeScale().coordinateToLogical(x);
          if (log === null) return;
          const n = candlesRef.current.length;
          let idx = Math.round(log as number);
          idx = Math.max(0, Math.min(n - 1, idx));

          setRangeEntries((prev) =>
            prev.map((r) => {
              if (r.id !== rangeId) return r;
              let i0 = r.i0;
              let i1 = r.i1;
              if (edge === "left") {
                i0 = Math.min(idx, i1 - 1);
                i0 = Math.max(0, i0);
              } else {
                i1 = Math.max(idx, i0 + 1);
                i1 = Math.min(n - 1, i1);
              }
              if (i1 <= i0) return r;
              const stats = computeKlineRangeStats(
                candlesRef.current,
                volumesRef.current,
                i0,
                i1,
                intervalRef.current,
              );
              if (!stats) return r;
              return { ...r, i0, i1, stats };
            }),
          );
          setOverlayLayoutTick((t) => t + 1);
        };

        const onUp = () => {
          try {
            captureEl.releasePointerCapture(pid);
          } catch {
            /* */
          }
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          chart.applyOptions({
            handleScroll: {
              mouseWheel: true,
              pressedMouseMove: true,
              horzTouchDrag: true,
              vertTouchDrag: true,
            },
          });
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      },
    [tool],
  );

  const attachPaneSplitterDrag = useCallback(
    (boundary: "01" | "12") => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const chart = chartRef.current;
      if (!chart) return;
      const p = chart.panes();
      if (p.length < 2) return;
      if (boundary === "12" && p.length < 3) return;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const pid = e.pointerId;
      const startY = e.clientY;
      const h0 = p[0]!.getHeight();
      const h1 = p[1]!.getHeight();
      const h2 = p.length >= 3 ? p[2]!.getHeight() : 0;

      const onMove = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        if (boundary === "01") {
          let n0 = h0 - dy;
          let n1 = h1 + dy;
          if (n0 < MIN_PANE_PX) {
            n1 -= MIN_PANE_PX - n0;
            n0 = MIN_PANE_PX;
          }
          if (n1 < MIN_PANE_PX) {
            n0 -= MIN_PANE_PX - n1;
            n1 = MIN_PANE_PX;
          }
          p[0]!.setStretchFactor(n0);
          p[1]!.setStretchFactor(n1);
          if (p.length >= 3) {
            p[2]!.setStretchFactor(h2);
          }
        } else {
          let n1 = h1 - dy;
          let n2 = h2 + dy;
          if (n1 < MIN_PANE_PX) {
            n2 -= MIN_PANE_PX - n1;
            n1 = MIN_PANE_PX;
          }
          if (n2 < MIN_PANE_PX) {
            n1 -= MIN_PANE_PX - n2;
            n2 = MIN_PANE_PX;
          }
          p[0]!.setStretchFactor(h0);
          p[1]!.setStretchFactor(n1);
          p[2]!.setStretchFactor(n2);
        }
        schedulePaneLayoutMetrics();
        // 拖分界后再双 rAF 量一次，与 lightweight-charts pane 布局提交对齐
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            syncPaneLayoutMetrics();
          });
        });
      };

      const onUp = () => {
        try {
          el.releasePointerCapture(pid);
        } catch {
          /* already released */
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        schedulePaneLayoutMetrics();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            syncPaneLayoutMetrics();
          });
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [schedulePaneLayoutMetrics, syncPaneLayoutMetrics],
  );

  const handleRangePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (tool !== "cursor") return;
      if (e.button !== 0) return;
      const chart = chartRef.current;
      const wrap = wrapRef.current;
      if (!chart || !wrap) return;
      const pane0El = chart.panes()[0]?.getHTMLElement();
      if (!pane0El) return;
      const pr = pane0El.getBoundingClientRect();
      if (
        e.clientX < pr.left ||
        e.clientX > pr.right ||
        e.clientY < pr.top ||
        e.clientY > pr.bottom
      ) {
        return;
      }
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < 0 || x > rect.width) return;
      const y = e.clientY - rect.top;
      const p0h = chart.panes()[0]?.getHeight() ?? 0;
      const se = candleRef.current;
      /** 点在已画线附近时不拦截：否则 preventDefault 会阻断图表 click → 无法选中画线 */
      if (
        se &&
        y >= 0 &&
        y <= p0h &&
        x >= 0 &&
        x <= rect.width
      ) {
        const chartW = overlaySizeRef.current.w || rect.width;
        const hit = pickDrawingAt(
          x,
          y,
          drawingsRef.current as DrawingHitTarget[],
          chart,
          se,
          chartW,
          p0h,
        );
        if (hit) return;
      }
      e.preventDefault();
      e.stopPropagation();
      rangeDragRef.current = { start: x, cur: x };
      const draftColor =
        RANGE_PALETTE[rangeEntries.length % RANGE_PALETTE.length];
      setRangeDragPx({ x1: x, x2: x, draftColor });
      chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: false,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
      });
      const rectSnap = rect;
      const onMove = (ev: PointerEvent) => {
        if (!rangeDragRef.current) return;
        const nx = Math.max(
          0,
          Math.min(rectSnap.width, ev.clientX - rectSnap.left),
        );
        rangeDragRef.current.cur = nx;
        const draftColor =
          RANGE_PALETTE[rangeEntries.length % RANGE_PALETTE.length];
        setRangeDragPx({
          x1: rangeDragRef.current.start,
          x2: nx,
          draftColor,
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        const d = rangeDragRef.current;
        rangeDragRef.current = null;
        setRangeDragPx(null);
        chart.applyOptions({
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
        });
        if (!d) return;
        if (Math.abs(d.cur - d.start) < 5) return;
        finalizeRangeSelection(d.start, d.cur);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [tool, finalizeRangeSelection, rangeEntries.length],
  );

  useEffect(() => {
    clearAllRangeStats();
  }, [symbol, source, interval, clearAllRangeStats]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target;
      if (
        el instanceof HTMLElement &&
        el.closest("input, textarea, select, [contenteditable=true]")
      ) {
        return;
      }
      if (ev.key === "Escape") {
        clearAllRangeStats();
        setPlotDraft(null);
        setSelectedDrawingId(null);
        return;
      }
      if (ev.key === "Delete" || ev.key === "Backspace") {
        const sid = selectedDrawingId;
        if (sid) {
          ev.preventDefault();
          setDrawings((prev) => prev.filter((d) => d.id !== sid));
          setSelectedDrawingId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearAllRangeStats, selectedDrawingId]);

  const svgShapes = useMemo(
    () => drawings.filter((d) => d.kind !== "hline" && d.kind !== "trend") as SvgOverlayShape[],
    [drawings],
  );

  const clearUserNativeOnly = useCallback(
    (chart: IChartApi, candle: ISeriesApi<"Candlestick", Time>) => {
      const h = nativeHandlesRef.current;
      h.userPriceLines.forEach((l) => candle.removePriceLine(l));
      h.userTrendLines.forEach((s) => chart.removeSeries(s));
      h.userPriceLines = [];
      h.userTrendLines = [];
    },
    [],
  );

  const applyPersistedNative = useCallback(
    (chart: IChartApi, candle: ISeriesApi<"Candlestick", Time>) => {
      clearUserNativeOnly(chart, candle);
      const h = nativeHandlesRef.current;
      for (const d of drawings) {
        const sel = d.id === selectedDrawingId;
        if (d.kind === "hline") {
          const pl = candle.createPriceLine({
            price: d.price,
            color: sel ? "#fda4af" : "#f472b6",
            lineWidth: sel ? 2 : 1,
            title: "",
          });
          h.userPriceLines.push(pl);
        }
        if (d.kind === "trend") {
          const s = chart.addSeries(
            LineSeries,
            {
              color: sel ? "#fdba74" : "#fb923c",
              lineWidth: sel ? 3 : 2,
              priceLineVisible: false,
              lastValueVisible: false,
            },
            0,
          );
          const tLo = Math.min(d.t1, d.t2) as UTCTimestamp;
          const tHi = Math.max(d.t1, d.t2) as UTCTimestamp;
          const pLo = d.t1 === tLo ? d.p1 : d.p2;
          const pHi = d.t1 === tLo ? d.p2 : d.p1;
          s.setData([
            { time: tLo, value: pLo },
            { time: tHi, value: pHi },
          ]);
          h.userTrendLines.push(s);
        }
      }
    },
    [drawings, selectedDrawingId, clearUserNativeOnly],
  );

  useEffect(() => {
    if (loading || !candles.length || !wrapRef.current) return;

    const el = wrapRef.current;
    const box = chartAreaRef.current;
    const cw = Math.max(100, box?.clientWidth ?? el.clientWidth);
    const ch = Math.max(400, box?.clientHeight ?? 520);
    el.replaceChildren();
    const chart = createChart(el, {
      layout: {
        background: { color: "#131722" },
        textColor: "#d1d4dc",
        /** 隐藏主图左下角 TradingView / lightweight-charts 圆形徽标（许可证允许在页面其它位置保留归属说明） */
        attributionLogo: false,
        /**
         * 关闭库内置窗格分隔条拖动。否则副图1/2 之间会出现第二条「灰线」，
         * 拖的是库的 stretch，不会走我们的同步逻辑，副图2 指标条会错位；
         * 高度调节仅保留：主↔副图1 青边条、副图2 顶栏琥珀条。
         */
        panes: {
          enableResize: false,
          separatorColor: "#2b2f3a",
          separatorHoverColor: "rgba(71, 80, 101, 0.25)",
        },
      },
      grid: {
        vertLines: { color: "#2b2f3a" },
        horzLines: { color: "#2b2f3a" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#485065" },
      timeScale: {
        borderColor: "#485065",
        timeVisible: interval !== "1d" && interval !== "1w",
        secondsVisible: false,
      },
      width: cw,
      height: ch,
    });

    chartRef.current = chart;
    setChartApi(chart);
    const nSub =
      (subPane1.visible ? 1 : 0) + (subPane2.visible ? 1 : 0);
    for (let i = 0; i < nSub; i++) {
      chart.addPane();
    }
    if (nSub === 0) {
      chart.panes()[0]?.setStretchFactor(100);
    } else if (nSub === 1) {
      chart.panes()[0]?.setStretchFactor(72);
      chart.panes()[1]?.setStretchFactor(28);
    } else {
      chart.panes()[0]?.setStretchFactor(55);
      chart.panes()[1]?.setStretchFactor(18);
      chart.panes()[2]?.setStretchFactor(27);
    }

    const candle = chart.addSeries(
      CandlestickSeries,
      {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      },
      0,
    );
    candle.setData(candles);
    candleRef.current = candle;

    if (mainOverlay === "boll" && candles.length >= 20) {
      const { mid, upper, lower } = bollinger(candles);
      const h = nativeHandlesRef.current;
      const midS = chart.addSeries(
        LineSeries,
        { color: "#a78bfa", lineWidth: 1, priceLineVisible: false },
        0,
      );
      const upS = chart.addSeries(
        LineSeries,
        { color: "#818cf8", lineWidth: 1, priceLineVisible: false },
        0,
      );
      const loS = chart.addSeries(
        LineSeries,
        { color: "#818cf8", lineWidth: 1, priceLineVisible: false },
        0,
      );
      midS.setData(mid);
      upS.setData(upper);
      loS.setData(lower);
      h.overlayLines.push(midS, upS, loS);
    }

    if (mainOverlay === "ma" && candles.length >= 5) {
      const h = nativeHandlesRef.current;
      const maSpec = [
        { period: 5, color: "#fbbf24" },
        { period: 10, color: "#38bdf8" },
        { period: 20, color: "#c084fc" },
      ] as const;
      for (const { period, color } of maSpec) {
        if (candles.length < period) continue;
        const data = sma(candles, period);
        if (!data.length) continue;
        const s = chart.addSeries(
          LineSeries,
          {
            color,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          0,
        );
        s.setData(data);
        h.overlayLines.push(s);
      }
    }

    let subPaneIdx = 1;
    if (subPane1.visible) {
      appendSubPaneSeries(
        chart,
        candles,
        volumes,
        subPaneIdx,
        subPane1.content,
        "a",
      );
      subPaneIdx++;
    }
    if (subPane2.visible) {
      appendSubPaneSeries(
        chart,
        candles,
        volumes,
        subPaneIdx,
        subPane2.content,
        "b",
      );
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      const area = chartAreaRef.current;
      const cr = chartRef.current;
      if (!area || !cr) return;
      const w = area.clientWidth;
      const h = Math.max(400, area.clientHeight);
      cr.resize(w, h);
      setOverlaySize({ w, h });
      schedulePaneLayoutMetrics();
    });
    ro.observe(box ?? el);

    const paneResizeRo = new ResizeObserver(() => {
      schedulePaneLayoutMetrics();
    });
    for (const pane of chart.panes()) {
      const hel = pane.getHTMLElement();
      if (hel) paneResizeRo.observe(hel);
    }

    setOverlaySize({ w: cw, h: ch });
    schedulePaneLayoutMetrics();

    const clickHandler: Parameters<IChartApi["subscribeClick"]>[0] = (param) => {
      const tcur = toolRef.current;
      if ((param.paneIndex ?? 0) !== 0) return;
      if (!param.point) return;
      const p0h = chart.panes()[0]?.getHeight() ?? 0;
      if (param.point.y < 0 || param.point.y > p0h) return;
      const se = candleRef.current;
      if (!se) return;

      if (tcur === "cursor") {
        const w = overlaySizeRef.current.w;
        const hit = pickDrawingAt(
          param.point.x,
          param.point.y,
          drawingsRef.current as DrawingHitTarget[],
          chart,
          se,
          w,
          p0h,
        );
        setSelectedDrawingId(hit);
        return;
      }

      if (param.time === undefined) return;
      const price = se.coordinateToPrice(param.point.y);
      if (price === null) return;
      const tm = param.time as UTCTimestamp;
      setSelectedDrawingId(null);

      if (tcur === "hline") {
        const id = crypto.randomUUID();
        setDrawings((prev) => [...prev, { id, kind: "hline", price }]);
        return;
      }

      if (tcur === "trend") {
        setPlotDraft((prev) => {
          if (!prev || prev.tool !== "trend") {
            return {
              tool: "trend",
              placed: [{ t: tm, p: price }],
              hover: null,
            };
          }
          const p0 = prev.placed[0]!;
          const id = crypto.randomUUID();
          setDrawings((prevD) => [
            ...prevD,
            {
              id,
              kind: "trend",
              t1: p0.t as number,
              p1: p0.p,
              t2: tm as number,
              p2: price,
            },
          ]);
          return null;
        });
        return;
      }

      if (tcur === "vline") {
        const id = crypto.randomUUID();
        setDrawings((prev) => [
          ...prev,
          { id, kind: "vline", t: tm, color: "#22d3ee" },
        ]);
        return;
      }

      if (tcur === "rect") {
        setPlotDraft((prev) => {
          if (!prev || prev.tool !== "rect") {
            return {
              tool: "rect",
              placed: [{ t: tm, p: price }],
              hover: null,
            };
          }
          const p0 = prev.placed[0]!;
          const id = crypto.randomUUID();
          setDrawings((prevD) => [
            ...prevD,
            {
              id,
              kind: "rect",
              t1: p0.t as UTCTimestamp,
              p1: p0.p,
              t2: tm,
              p2: price,
              color: "rgba(168,85,247,0.9)",
            },
          ]);
          return null;
        });
        return;
      }

      if (tcur === "fib") {
        setPlotDraft((prev) => {
          if (!prev || prev.tool !== "fib") {
            return {
              tool: "fib",
              placed: [{ t: tm, p: price }],
              hover: null,
            };
          }
          const p0 = prev.placed[0]!;
          const id = crypto.randomUUID();
          setDrawings((prevD) => [
            ...prevD,
            {
              id,
              kind: "fib",
              t1: p0.t as UTCTimestamp,
              p1: p0.p,
              t2: tm,
              p2: price,
              color: "#f97316",
            },
          ]);
          return null;
        });
        return;
      }

      if (tcur === "channel") {
        setPlotDraft((prev) => {
          if (!prev || prev.tool !== "channel") {
            return {
              tool: "channel",
              placed: [{ t: tm, p: price }],
              hover: null,
            };
          }
          if (prev.placed.length === 1) {
            return {
              ...prev,
              placed: [...prev.placed, { t: tm, p: price }],
              hover: null,
            };
          }
          if (prev.placed.length === 2) {
            const p0 = prev.placed[0]!;
            const p1 = prev.placed[1]!;
            const id = crypto.randomUUID();
            setDrawings((prevD) => [
              ...prevD,
              {
                id,
                kind: "channel",
                t1: p0.t as UTCTimestamp,
                p1: p0.p,
                t2: p1.t as UTCTimestamp,
                p2: p1.p,
                t3: tm as UTCTimestamp,
                p3: price,
                color: "#eab308",
              },
            ]);
            return null;
          }
          return prev;
        });
        return;
      }

      if (tcur === "text") {
        const label = window.prompt("标注文字", "备注");
        if (!label?.trim()) return;
        const id = crypto.randomUUID();
        setDrawings((prev) => [
          ...prev,
          {
            id,
            kind: "text",
            t: tm,
            p: price,
            text: label.trim(),
            color: "#e2e8f0",
          },
        ]);
      }
    };

    chart.subscribeClick(clickHandler);

    const crosshairHandler: Parameters<
      IChartApi["subscribeCrosshairMove"]
    >[0] = (param) => {
      const se = candleRef.current;
      if (!se || param.point === undefined) {
        setCrosshairOhlcv(null);
        setPlotDraft((p) => (p ? { ...p, hover: null } : p));
        if (
          pageSyncEnabledRef.current &&
          !suppressCrosshairBroadcastRef.current
        ) {
          onLocalCrosshairTimeRef.current?.(null);
        }
        return;
      }
      const t = param.time;
      if (t === undefined) {
        setCrosshairOhlcv(null);
        setPlotDraft((p) => (p ? { ...p, hover: null } : p));
        if (
          pageSyncEnabledRef.current &&
          !suppressCrosshairBroadcastRef.current
        ) {
          onLocalCrosshairTimeRef.current?.(null);
        }
        return;
      }
      const fromMap = param.seriesData.get(se) as CandlestickData | undefined;
      const cList = candlesRef.current;
      let bar: CandlestickData | undefined = fromMap;
      if (!bar || typeof bar.open !== "number") {
        bar = cList.find((c) => c.time === t);
      }
      if (!bar || typeof bar.open !== "number") {
        setCrosshairOhlcv(null);
        setPlotDraft((p) => (p ? { ...p, hover: null } : p));
        if (
          pageSyncEnabledRef.current &&
          !suppressCrosshairBroadcastRef.current
        ) {
          onLocalCrosshairTimeRef.current?.(null);
        }
        return;
      }
      const idx = cList.findIndex((c) => c.time === t);
      const vol =
        idx >= 0 ? (volumesRef.current[idx] ?? 0) : 0;
      setCrosshairOhlcv({
        timeLabel: formatBarTimeLabel(t, intervalRef.current),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: vol,
        cursorX: param.point.x,
      });
      setPlotDraft((prev) => {
        if (
          !prev ||
          (prev.tool !== "trend" &&
            prev.tool !== "rect" &&
            prev.tool !== "fib" &&
            prev.tool !== "channel")
        ) {
          return prev;
        }
        if ((param.paneIndex ?? 0) !== 0) {
          return { ...prev, hover: null };
        }
        const ph =
          chartRef.current?.panes()[0]?.getHeight() ?? null;
        if (
          ph !== null &&
          (param.point.y < 0 || param.point.y > ph)
        ) {
          return { ...prev, hover: null };
        }
        const hp = se.coordinateToPrice(param.point.y);
        if (hp === null || param.time === undefined) {
          return { ...prev, hover: null };
        }
        return {
          ...prev,
          hover: { t: param.time as UTCTimestamp, p: hp },
        };
      });
      if (
        pageSyncEnabledRef.current &&
        !suppressCrosshairBroadcastRef.current &&
        typeof t === "number"
      ) {
        onLocalCrosshairTimeRef.current?.(t as UTCTimestamp);
      }
    };
    chart.subscribeCrosshairMove(crosshairHandler);

    const visibleTimeRangeHandler = (
      tr: { from: Time; to: Time } | null,
    ) => {
      setOverlaySize((s) => ({ ...s }));
      setOverlayLayoutTick((t) => t + 1);
      if (
        !pageSyncEnabledRef.current ||
        suppressVisibleRangeBroadcastRef.current
      ) {
        return;
      }
      if (!tr || typeof tr.from !== "number" || typeof tr.to !== "number") {
        return;
      }
      onLocalVisibleTimeRangeRef.current?.(
        tr.from as number,
        tr.to as number,
      );
    };
    const logicalRangeHandler = () => {
      setOverlayLayoutTick((t) => t + 1);
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(visibleTimeRangeHandler);
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    return () => {
      layoutMetricsGenRef.current += 1;
      setCrosshairOhlcv(null);
      setChartApi(null);
      chart.unsubscribeClick(clickHandler);
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(
        visibleTimeRangeHandler,
      );
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      paneResizeRo.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      nativeHandlesRef.current = {
        userPriceLines: [],
        userTrendLines: [],
        overlayLines: [],
      };
    };
  }, [
    loading,
    candles,
    volumes,
    mainOverlay,
    subPane1.visible,
    subPane1.content,
    subPane2.visible,
    subPane2.content,
    interval,
    schedulePaneLayoutMetrics,
  ]);

  useEffect(() => {
    if (loading) return;
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return;
    applyPersistedNative(chart, candle);
  }, [drawings, loading, applyPersistedNative]);

  /**
   * 勾选「页面同步」时广播一次 leader（nonce / 加载完成时）。
   * 勿依赖 rangeEntries/candles：否则会与对端 leader → 应用区间 → 再广播 形成死循环。
   * 后续区间/可见区间由 range-stats、visible-range 消息同步。
   */
  useEffect(() => {
    if (!pageSyncLeadNonce || !pageSyncEnabled) return;
    if (loading || !candlesRef.current.length) return;
    const chart = chartRef.current;
    if (!chart) return;
    const vr = chart.timeScale().getVisibleRange();
    if (!vr || typeof vr.from !== "number" || typeof vr.to !== "number") {
      return;
    }
    const wire = serializeRangeEntriesToWire(
      rangeEntriesRef.current,
      candlesRef.current,
    );
    onPageSyncLeaderSnapshot?.({
      interval: intervalRef.current,
      visible: { from: vr.from as number, to: vr.to as number },
      rangeStats: wire,
    });
  }, [
    pageSyncLeadNonce,
    pageSyncEnabled,
    loading,
    onPageSyncLeaderSnapshot,
  ]);

  /** 区间统计变化 → 跨标签广播（防抖，避免拖边时刷屏） */
  useEffect(() => {
    if (!pageSyncEnabled) return;
    if (!onRangeSpecsBroadcastRef.current) return;
    if (suppressRangeSpecsBroadcastRef.current) return;
    if (!candlesRef.current.length) return;
    if (rangeBroadcastTimerRef.current !== null) {
      clearTimeout(rangeBroadcastTimerRef.current);
    }
    rangeBroadcastTimerRef.current = setTimeout(() => {
      rangeBroadcastTimerRef.current = null;
      if (!pageSyncEnabledRef.current) return;
      if (suppressRangeSpecsBroadcastRef.current) return;
      const c = candlesRef.current;
      if (!c.length) return;
      const wire = serializeRangeEntriesToWire(rangeEntriesRef.current, c);
      onRangeSpecsBroadcastRef.current?.(wire);
    }, 120);
    return () => {
      if (rangeBroadcastTimerRef.current !== null) {
        clearTimeout(rangeBroadcastTimerRef.current);
        rangeBroadcastTimerRef.current = null;
      }
    };
  }, [rangeEntries, pageSyncEnabled]);

  /** 应用其它标签页传来的可见时间区间 */
  useEffect(() => {
    if (!pageSyncEnabled) return;
    if (!remoteVisibleTimeRangeVersion) return;
    if (!remoteVisibleTimeRange) return;
    const chart = chartRef.current;
    if (!chart || loading) return;
    suppressVisibleRangeBroadcastRef.current = true;
    try {
      chart.timeScale().setVisibleRange({
        from: remoteVisibleTimeRange.from as Time,
        to: remoteVisibleTimeRange.to as Time,
      });
    } catch {
      /* 库会按已有数据钳制 */
    }
    requestAnimationFrame(() => {
      suppressVisibleRangeBroadcastRef.current = false;
    });
  }, [
    remoteVisibleTimeRange,
    remoteVisibleTimeRangeVersion,
    loading,
    symbol,
    pageSyncEnabled,
  ]);

  /** 应用其它标签页传来的十字线时间（OHLC 框共用现有 Crosshair 逻辑） */
  useEffect(() => {
    if (!pageSyncEnabled) return;
    if (!remoteCrosshairVersion) return;
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle || loading) return;
    suppressCrosshairBroadcastRef.current = true;
    try {
      if (remoteCrosshairTime == null) {
        chart.clearCrosshairPosition();
        setCrosshairOhlcv(null);
      } else {
        const cList = candlesRef.current;
        let bar = cList.find((c) => c.time === remoteCrosshairTime);
        if (!bar && cList.length > 0) {
          let best = cList[0]!;
          let bestDt = Math.abs(
            (best.time as number) - remoteCrosshairTime,
          );
          for (let i = 1; i < cList.length; i++) {
            const bi = cList[i]!;
            const d = Math.abs((bi.time as number) - remoteCrosshairTime);
            if (d < bestDt) {
              best = bi;
              bestDt = d;
            }
          }
          bar = best;
        }
        if (bar && typeof bar.open === "number") {
          chart.setCrosshairPosition(bar.close, bar.time as Time, candle);
          const t = bar.time;
          const idx = cList.findIndex((c) => c.time === t);
          const vol = idx >= 0 ? (volumesRef.current[idx] ?? 0) : 0;
          const cx =
            chart.timeScale().timeToCoordinate(bar.time as Time) ?? 80;
          setCrosshairOhlcv({
            timeLabel: formatBarTimeLabel(t, intervalRef.current),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: vol,
            cursorX: cx,
          });
        } else {
          chart.clearCrosshairPosition();
          setCrosshairOhlcv(null);
        }
      }
    } finally {
      requestAnimationFrame(() => {
        suppressCrosshairBroadcastRef.current = false;
      });
    }
  }, [
    remoteCrosshairTime,
    remoteCrosshairVersion,
    loading,
    candles,
    symbol,
    pageSyncEnabled,
  ]);

  /** 应用其它标签页传来的区间统计（按柱时间映射到本地下标） */
  useEffect(() => {
    if (!pageSyncEnabled) return;
    if (!remoteRangeSpecsVersion) return;
    const c = candlesRef.current;
    const v = volumesRef.current;
    if (!c.length || loading) return;
    suppressRangeSpecsBroadcastRef.current = true;
    const specs = remoteRangeSpecs ?? [];
    setRangeEntries(
      wireSpecsToRangeEntries(specs, c, v, intervalRef.current),
    );
    window.setTimeout(() => {
      suppressRangeSpecsBroadcastRef.current = false;
    }, 320);
  }, [
    remoteRangeSpecs,
    remoteRangeSpecsVersion,
    loading,
    symbol,
    interval,
    pageSyncEnabled,
  ]);

  const handleClearDrawings = () => {
    setPlotDraft(null);
    setSelectedDrawingId(null);
    setDrawings([]);
  };

  const tools: { id: DrawingTool; label: string }[] = [
    { id: "cursor", label: "十字" },
    { id: "trend", label: "趋势" },
    { id: "hline", label: "水平" },
    { id: "vline", label: "垂直" },
    { id: "rect", label: "矩形" },
    { id: "fib", label: "斐波" },
    { id: "channel", label: "平行通道" },
    { id: "text", label: "文本" },
  ];

  const subModeTabs: { id: SubPaneContent; label: string }[] = [
    { id: "volume", label: "成交量" },
    { id: "kdj", label: "KDJ" },
    { id: "macd", label: "MACD" },
    { id: "rsi", label: "RSI" },
  ];

  if (!symbol.trim()) {
    return (
      <div
        className={
          fillHeight
            ? "flex min-h-[50dvh] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#2b2f3a] bg-[#131722]/80 px-6 text-center"
            : "flex h-[560px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#2b2f3a] bg-[#131722]/80 px-6 text-center"
        }
      >
        <p className="text-sm text-slate-400">尚未选择标的</p>
        <p className="max-w-md text-xs leading-relaxed text-slate-600">
          在上方输入框输入代码或公司名称，从联想列表中选择；也可输入完整代码后按 Enter 加载 K 线。
        </p>
      </div>
    );
  }

  if (klineError) {
    return (
      <div
        className={
          fillHeight
            ? "flex min-h-[50dvh] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-rose-900/50 bg-[#131722] px-6 py-8 text-center"
            : "flex h-[560px] flex-col items-center justify-center gap-3 rounded-lg border border-rose-900/50 bg-[#131722] px-6 py-8 text-center"
        }
      >
        <p className="text-sm font-medium text-rose-200">行情接口失败</p>
        <p className="max-w-lg whitespace-pre-wrap font-mono text-xs leading-relaxed text-rose-100/90">
          {klineError}
        </p>
        <p className="max-w-lg text-left text-[11px] leading-relaxed text-slate-500">
          K 线默认使用 Massive（需在服务端配置{" "}
          <code className="rounded bg-slate-800 px-1 text-slate-300">
            MASSIVE_API_KEY
          </code>
          ）。若仍失败，请核对密钥与网络；旧版 Yahoo 接口不稳定，不建议依赖。
        </p>
      </div>
    );
  }

  if (loading || !payload) {
    return (
      <div
        className={
          fillHeight
            ? "flex min-h-[50dvh] flex-1 items-center justify-center text-sm text-slate-500"
            : "flex h-[560px] items-center justify-center text-sm text-slate-500"
        }
      >
        正在加载行情…
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-[#2b2f3a] bg-[#131722] ${fillHeight ? "h-full min-h-0 flex-1" : ""}`}
    >
      <div className="flex w-full flex-wrap items-center gap-2 border-b border-[#2b2f3a] px-2 py-1.5">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="shrink-0 text-slate-500">主图叠加</span>
          <select
            value={mainOverlay}
            onChange={(e) =>
              setMainOverlay(e.target.value as MainOverlayKind)
            }
            className="max-w-[11rem] cursor-pointer rounded border border-slate-600 bg-[#1e293b] px-2 py-1 text-[11px] text-slate-200 outline-none hover:border-slate-500 focus:border-emerald-600/70"
            aria-label="主图叠加指标"
          >
            <option value="none">无</option>
            <option value="ma">MA (5 / 10 / 20)</option>
            <option value="boll">BOLL (20, 2)</option>
          </select>
        </label>
        <div ref={drawToolMenuRef} className="relative flex items-center">
          <button
            type="button"
            onClick={() => setDrawToolMenuOpen((o) => !o)}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] ${
              drawToolMenuOpen
                ? "bg-slate-700 text-slate-100"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
            }`}
            aria-expanded={drawToolMenuOpen}
            aria-haspopup="menu"
          >
            <span className="text-slate-500">画图工具</span>
            <span
              className={
                tool === "cursor"
                  ? "text-slate-400"
                  : "font-medium text-emerald-200/95"
              }
            >
              {tools.find((x) => x.id === tool)?.label ?? "十字"}
            </span>
            <span className="text-[10px] text-slate-500" aria-hidden>
              ▾
            </span>
          </button>
          {drawToolMenuOpen ? (
            <div
              role="menu"
              className="absolute left-0 top-[calc(100%+6px)] z-[100] min-w-[11rem] rounded-md border border-[#2b2f3a] bg-[#131722] py-1 shadow-xl"
            >
              {tools.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setTool(x.id);
                    setPlotDraft(null);
                    setSelectedDrawingId(null);
                    setDrawToolMenuOpen(false);
                  }}
                  className={`flex w-full px-3 py-1.5 text-left text-[11px] hover:bg-slate-800 ${
                    tool === x.id
                      ? "bg-emerald-950/55 text-emerald-100"
                      : "text-slate-300"
                  }`}
                >
                  {x.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleClearDrawings}
          className="rounded border border-rose-900/60 px-2 py-1 text-[11px] text-rose-200/90 hover:bg-rose-950/50"
        >
          清除画线
        </button>
        {selectedDrawingId ? (
          <span className="text-[11px] text-slate-500" title="按 Delete 或 Backspace 删除">
            已选中 · Delete 删除
          </span>
        ) : null}
      </div>

      <div
        ref={chartAreaRef}
        onPointerDown={handleRangePointerDown}
        className={
          fillHeight
            ? `relative min-h-0 w-full min-w-0 flex-1 ${tool === "cursor" ? "cursor-crosshair" : ""}`
            : `relative h-[520px] w-full min-w-0 ${tool === "cursor" ? "cursor-crosshair" : ""}`
        }
      >
        <div
          ref={wrapRef}
          className={
            fillHeight
              ? "absolute inset-0 min-h-[400px]"
              : "h-full w-full min-h-[520px]"
          }
        />
        {subPaneToolbarGeom.slot1 ? (
          <div
            className={`pointer-events-auto absolute left-0 right-0 z-[25] flex flex-wrap items-center gap-1 border-b border-[#2b2f3a]/90 bg-[#131722]/95 px-2 backdrop-blur-[2px] ${subPane1.visible ? "" : "opacity-90"}`}
            style={{
              top: "var(--kline-sp1-top, 0px)",
              height: SUB_PANE_TOOLBAR_PX,
            }}
          >
            {subModeTabs.map((x) => (
              <button
                key={`s1-${x.id}`}
                type="button"
                onClick={() => setSubPane1((s) => ({ ...s, content: x.id }))}
                className={`rounded px-2 py-0.5 text-[10px] leading-none ${
                  subPane1.content === x.id
                    ? "bg-indigo-950/90 text-indigo-100"
                    : "bg-slate-800/70 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {x.label}
              </button>
            ))}
            <button
              type="button"
              title={subPane1.visible ? "隐藏此副图" : "显示此副图"}
              onClick={() =>
                setSubPane1((s) => ({ ...s, visible: !s.visible }))
              }
              className={`rounded px-1.5 py-0.5 text-[10px] leading-none ${
                subPane1.visible
                  ? "border border-slate-600 text-slate-400 hover:bg-slate-800"
                  : "bg-emerald-900/50 text-emerald-200 hover:bg-emerald-900/70"
              }`}
            >
              {subPane1.visible ? "隐藏" : "显示"}
            </button>
          </div>
        ) : null}
        {subPaneToolbarGeom.slot2 ? (
          <div
            className={`pointer-events-auto absolute left-0 right-0 z-[26] flex flex-col overflow-hidden border-b border-[#2b2f3a]/90 bg-[#131722]/95 backdrop-blur-[2px] ${subPane2.visible ? "" : "opacity-90"}`}
            style={{
              top: "var(--kline-sp2-top, 0px)",
              height: SUB_PANE_TOOLBAR_PX,
            }}
          >
            {splitterY?.sep12 != null ? (
              <div
                role="separator"
                aria-orientation="horizontal"
                title="上下拖动：调节副图1与副图2高度（仅顶部窄条）"
                className="relative z-[30] shrink-0 cursor-ns-resize touch-none border-b border-amber-500/45 bg-gradient-to-b from-amber-500/20 to-transparent hover:from-amber-500/35"
                style={{ height: 7 }}
                onPointerDown={attachPaneSplitterDrag("12")}
              />
            ) : null}
            <div className="flex min-h-0 flex-1 flex-wrap items-center gap-1 px-2 py-px">
              {subModeTabs.map((x) => (
                <button
                  key={`s2-${x.id}`}
                  type="button"
                  onClick={() => setSubPane2((s) => ({ ...s, content: x.id }))}
                  className={`rounded px-2 py-0.5 text-[10px] leading-none ${
                    subPane2.content === x.id
                      ? "bg-indigo-950/90 text-indigo-100"
                      : "bg-slate-800/70 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {x.label}
                </button>
              ))}
              <button
                type="button"
                title={subPane2.visible ? "隐藏此副图" : "显示此副图"}
                onClick={() =>
                  setSubPane2((s) => ({ ...s, visible: !s.visible }))
                }
                className={`rounded px-1.5 py-0.5 text-[10px] leading-none ${
                  subPane2.visible
                    ? "border border-slate-600 text-slate-400 hover:bg-slate-800"
                    : "bg-emerald-900/50 text-emerald-200 hover:bg-emerald-900/70"
                }`}
              >
                {subPane2.visible ? "隐藏" : "显示"}
              </button>
            </div>
          </div>
        ) : null}
        <div
          className="pointer-events-none absolute left-0 right-0 z-10 overflow-hidden"
          style={{
            top: mainPaneClip?.top ?? 0,
            height: mainPaneClip?.height ?? "100%",
          }}
        >
          <ChartDrawingOverlay
            chart={chartRef.current}
            candleSeries={candleRef.current}
            shapes={svgShapes}
            width={overlaySize.w}
            height={Math.max(
              1,
              mainPaneClip?.height ?? overlaySize.h,
            )}
            draftPreview={plotDraft}
            selectedShapeId={selectedDrawingId}
          />
        </div>
        {crosshairOhlcv && overlaySize.w > 0 ? (
          <div
            className={`pointer-events-none absolute top-2 z-[20] w-[min(92vw,220px)] rounded border border-slate-500/80 bg-black/80 px-2.5 py-2 text-[11px] leading-snug shadow-lg backdrop-blur-sm ${
              crosshairOhlcv.cursorX < overlaySize.w / 2
                ? "right-2"
                : "left-2"
            }`}
          >
            <div className="mb-1.5 border-b border-slate-600/50 pb-1 text-center text-slate-100">
              {crosshairOhlcv.timeLabel}
            </div>
            {(() => {
              const ch = crosshairOhlcv;
              const delta = ch.close - ch.open;
              const pct =
                ch.open !== 0 ? (delta / ch.open) * 100 : 0;
              const upA = delta >= 0;
              const dCls = upA ? "text-rose-400" : "text-emerald-400";
              return (
                <div className="grid grid-cols-[2.5rem_1fr] gap-x-2 gap-y-0.5 text-slate-200">
                  <span className="text-slate-500">开盘</span>
                  <span className="text-right font-mono text-slate-100">
                    {fmtPriceCompact(ch.open)}
                  </span>
                  <span className="text-slate-500">最高</span>
                  <span className="text-right font-mono text-rose-300">
                    {fmtPriceCompact(ch.high)}
                  </span>
                  <span className="text-slate-500">最低</span>
                  <span className="text-right font-mono text-emerald-300">
                    {fmtPriceCompact(ch.low)}
                  </span>
                  <span className="text-slate-500">收盘</span>
                  <span className={`text-right font-mono ${dCls}`}>
                    {fmtPriceCompact(ch.close)}
                  </span>
                  <span className="text-slate-500">涨跌额</span>
                  <span className={`text-right font-mono ${dCls}`}>
                    {ch.open !== 0
                      ? `${delta >= 0 ? "+" : ""}${fmtPriceCompact(delta)}`
                      : "—"}
                  </span>
                  <span className="text-slate-500">涨跌幅</span>
                  <span className={`text-right font-mono ${dCls}`}>
                    {ch.open !== 0
                      ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`
                      : "—"}
                  </span>
                  <span className="text-slate-500">成交量</span>
                  <span className="text-right font-mono text-amber-200/95">
                    {fmtVolumeZh(ch.volume)}
                  </span>
                </div>
              );
            })()}
          </div>
        ) : null}
        {tool === "cursor" && rangeEntries.length > 0
          ? rangeEntries.map((r, idx) => {
              void overlayLayoutTick;
              const chart = chartRef.current;
              if (!chart) return null;
              const px = computeRangeOverlayPx(chart, candles, r.i0, r.i1);
              if (!px) return null;
              return (
                <div
                  key={r.id}
                  className="pointer-events-none absolute left-0 right-0 z-[12]"
                  style={{
                    top: mainPaneClip?.top ?? 0,
                    height: mainPaneClip?.height ?? "100%",
                  }}
                >
                  <div
                    className="absolute top-0 bottom-0"
                    style={{
                      left: px.left,
                      width: px.width,
                      backgroundColor: `${r.color}28`,
                      borderLeft: `2px solid ${r.color}`,
                      borderRight: `2px solid ${r.color}`,
                    }}
                  />
                  <div
                    role="slider"
                    aria-label={`区间${idx + 1}起点`}
                    title="拖动调整区间起点"
                    className="pointer-events-auto absolute top-0 bottom-0 z-[19] w-2.5 -translate-x-1/2 cursor-ew-resize touch-none hover:bg-white/10"
                    style={{ left: px.left }}
                    onPointerDown={attachRangeEdgeDrag(r.id, "left")}
                  />
                  <div
                    role="slider"
                    aria-label={`区间${idx + 1}终点`}
                    title="拖动调整区间终点"
                    className="pointer-events-auto absolute top-0 bottom-0 z-[19] w-2.5 -translate-x-1/2 cursor-ew-resize touch-none hover:bg-white/10"
                    style={{ left: px.left + px.width }}
                    onPointerDown={attachRangeEdgeDrag(r.id, "right")}
                  />
                </div>
              );
            })
          : null}
        {tool === "cursor" && rangeDragPx ? (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[12]"
            style={{
              top: mainPaneClip?.top ?? 0,
              height: mainPaneClip?.height ?? "100%",
            }}
          >
            <div
              className="absolute top-0 bottom-0"
              style={{
                left: Math.min(rangeDragPx.x1, rangeDragPx.x2),
                width: Math.abs(rangeDragPx.x2 - rangeDragPx.x1),
                backgroundColor: `${rangeDragPx.draftColor}28`,
                borderLeft: `2px solid ${rangeDragPx.draftColor}`,
                borderRight: `2px solid ${rangeDragPx.draftColor}`,
              }}
            />
          </div>
        ) : null}
        {splitterY ? (
          <div
            role="separator"
            aria-orientation="horizontal"
            title="上下拖动：调节主图与副图1高度（靠左青边）"
            className="pointer-events-auto absolute left-0 right-0 z-[18] h-3 -translate-y-1/2 cursor-ns-resize touch-none border-l-4 border-emerald-500/55 hover:bg-slate-500/30"
            style={{ top: splitterY.sep01 }}
            onPointerDown={attachPaneSplitterDrag("01")}
          />
        ) : null}
      </div>

      {rangeEntries.map((r, idx) => (
        <KlineRangeStatsPanel
          key={r.id}
          stats={r.stats}
          title={rangePanelTitle(idx)}
          accentColor={r.color}
          stackOffsetPx={idx * 28}
          onClose={() => removeRangeEntry(r.id)}
        />
      ))}

      <ChartTimeRangeBrush chart={chartApi} candles={candles} />
    </div>
  );
}
