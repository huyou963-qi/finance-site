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
import type { KlinePayload } from "@/lib/data/types";
import {
  bollinger,
  kdj,
  macd,
  rsi,
} from "@/lib/chart/technicalIndicators";
import {
  ChartDrawingOverlay,
  type SvgOverlayShape,
} from "@/components/chart/ChartDrawingOverlay";
import type { RangeStatWireSegment } from "@/lib/klinePageSyncChannel";

export type StockChartWorkspaceProps = {
  symbol: string;
  interval: string;
  source: "binance" | "yahoo" | "massive";
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
  | "text";

/** 单个副图：成交量或振荡指标之一 */
type SubPaneContent = "volume" | "kdj" | "macd" | "rsi";

type PersistedDrawing =
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
    bollLines: ISeriesApi<"Line", Time>[];
  }>({ userPriceLines: [], userTrendLines: [], bollLines: [] });

  const [payload, setPayload] = useState<KlinePayload | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [klineError, setKlineError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState<DrawingTool>("cursor");
  const toolRef = useRef<DrawingTool>("cursor");
  const [showBoll, setShowBoll] = useState(true);
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
  const [overlaySize, setOverlaySize] = useState({ w: 0, h: 0 });
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
  const rangeDragRef = useRef<{ start: number; cur: number } | null>(null);
  const trendDraftRef = useRef<{ t: Time; p: number } | null>(null);
  const rectDraftRef = useRef<{ t: Time; p: number } | null>(null);
  const fibDraftRef = useRef<{ t: Time; p: number } | null>(null);

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
      return;
    }
    const key = storageKey(source, symbol, interval);
    setDrawings(parsePersisted(typeof window !== "undefined" ? localStorage.getItem(key) : null));
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
    if (panes.length === 1) {
      setSplitterY(null);
      return;
    }
    if (panes.length === 2) {
      setSplitterY({ sep01: r0.bottom - ar.top });
      return;
    }
    const p1el = panes[1]?.getHTMLElement();
    if (!p1el) return;
    const r1 = p1el.getBoundingClientRect();
    setSplitterY({
      sep01: r0.bottom - ar.top,
      sep12: r1.bottom - ar.top,
    });
  }, []);

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
        syncPaneLayoutMetrics();
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
        syncPaneLayoutMetrics();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [syncPaneLayoutMetrics],
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
      if (ev.key === "Escape") clearAllRangeStats();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearAllRangeStats]);

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
        if (d.kind === "hline") {
          const pl = candle.createPriceLine({
            price: d.price,
            color: "#f472b6",
            lineWidth: 1,
            title: "",
          });
          h.userPriceLines.push(pl);
        }
        if (d.kind === "trend") {
          const s = chart.addSeries(
            LineSeries,
            {
              color: "#fb923c",
              lineWidth: 2,
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
    [drawings, clearUserNativeOnly],
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

    if (showBoll && candles.length >= 20) {
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
      h.bollLines.push(midS, upS, loS);
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
      requestAnimationFrame(() => {
        syncPaneLayoutMetrics();
      });
    });
    ro.observe(box ?? el);
    setOverlaySize({ w: cw, h: ch });
    requestAnimationFrame(() => {
      syncPaneLayoutMetrics();
    });

    const clickHandler: Parameters<IChartApi["subscribeClick"]>[0] = (param) => {
      const tcur = toolRef.current;
      if (tcur === "cursor" || (param.paneIndex ?? 0) !== 0) return;
      if (!param.point || param.time === undefined) return;
      const se = candleRef.current;
      if (!se) return;
      const price = se.coordinateToPrice(param.point.y);
      if (price === null) return;
      const tm = param.time as UTCTimestamp;

      if (tcur === "hline") {
        const id = crypto.randomUUID();
        setDrawings((prev) => [...prev, { id, kind: "hline", price }]);
        return;
      }

      if (tcur === "trend") {
        const prev = trendDraftRef.current;
        if (!prev) {
          trendDraftRef.current = { t: tm, p: price };
          return;
        }
        const id = crypto.randomUUID();
        setDrawings((prevD) => [
          ...prevD,
          {
            id,
            kind: "trend",
            t1: prev.t as number,
            p1: prev.p,
            t2: tm as number,
            p2: price,
          },
        ]);
        trendDraftRef.current = null;
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
        const prev = rectDraftRef.current;
        if (!prev) {
          rectDraftRef.current = { t: tm, p: price };
          return;
        }
        const id = crypto.randomUUID();
        setDrawings((prevD) => [
          ...prevD,
          {
            id,
            kind: "rect",
            t1: prev.t as UTCTimestamp,
            p1: prev.p,
            t2: tm,
            p2: price,
            color: "rgba(168,85,247,0.9)",
          },
        ]);
        rectDraftRef.current = null;
        return;
      }

      if (tcur === "fib") {
        const prev = fibDraftRef.current;
        if (!prev) {
          fibDraftRef.current = { t: tm, p: price };
          return;
        }
        const id = crypto.randomUUID();
        setDrawings((prevD) => [
          ...prevD,
          {
            id,
            kind: "fib",
            t1: prev.t as UTCTimestamp,
            p1: prev.p,
            t2: tm,
            p2: price,
            color: "#f97316",
          },
        ]);
        fibDraftRef.current = null;
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
      setCrosshairOhlcv(null);
      setChartApi(null);
      chart.unsubscribeClick(clickHandler);
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(
        visibleTimeRangeHandler,
      );
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      nativeHandlesRef.current = {
        userPriceLines: [],
        userTrendLines: [],
        bollLines: [],
      };
    };
  }, [
    loading,
    candles,
    volumes,
    showBoll,
    subPane1.visible,
    subPane1.content,
    subPane2.visible,
    subPane2.content,
    interval,
    syncPaneLayoutMetrics,
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
    trendDraftRef.current = null;
    rectDraftRef.current = null;
    fibDraftRef.current = null;
    setDrawings([]);
  };

  const tools: { id: DrawingTool; label: string }[] = [
    { id: "cursor", label: "十字" },
    { id: "trend", label: "趋势" },
    { id: "hline", label: "水平" },
    { id: "vline", label: "垂直" },
    { id: "rect", label: "矩形" },
    { id: "fib", label: "斐波" },
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
      className={`overflow-hidden rounded-lg border border-[#2b2f3a] bg-[#131722] ${fillHeight ? "flex h-full min-h-0 flex-1 flex-col" : ""}`}
    >
      <div className="flex w-full flex-wrap items-center justify-end gap-1 border-b border-[#2b2f3a] px-2 py-1.5">
        <span className="mr-1 text-[11px] text-slate-500">画线</span>
        {tools.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => {
              setTool(x.id);
              trendDraftRef.current = null;
              rectDraftRef.current = null;
              fibDraftRef.current = null;
            }}
            className={`rounded px-2 py-1 text-[11px] ${
              tool === x.id
                ? "bg-emerald-900/80 text-emerald-100"
                : "bg-slate-800/80 text-slate-400 hover:bg-slate-700"
            }`}
          >
            {x.label}
          </button>
        ))}
        <button
          type="button"
          onClick={handleClearDrawings}
          className="rounded border border-rose-900/60 px-2 py-1 text-[11px] text-rose-200/90 hover:bg-rose-950/50"
        >
          清除画线
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
          <input
            type="checkbox"
            checked={showBoll}
            onChange={(e) => setShowBoll(e.target.checked)}
            className="rounded border-slate-600"
          />
          BOLL(20,2)
        </label>
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
        <div className="pointer-events-none absolute inset-0 z-10">
          <ChartDrawingOverlay
            chart={chartRef.current}
            candleSeries={candleRef.current}
            shapes={svgShapes}
            width={overlaySize.w}
            height={overlaySize.h}
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
        {splitterY && (subPane1.visible || subPane2.visible) ? (
          <>
            {/* 第一个副图窗格上方的指标切换（仅 sub1 / 或仅 sub2 时也在此边界） */}
            <div
              className="pointer-events-auto absolute left-0 right-0 z-[17] flex flex-wrap items-center gap-1 border-b border-[#2b2f3a]/90 bg-[#131722]/95 px-1.5 shadow-sm backdrop-blur-[1px]"
              style={{
                top: Math.max(0, splitterY.sep01 - 22),
                height: 22,
              }}
            >
              {subPane1.visible ? (
                <>
                  {subModeTabs.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() =>
                        setSubPane1((s) => ({ ...s, content: x.id }))
                      }
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
                    title="隐藏此副图"
                    onClick={() =>
                      setSubPane1((s) => ({ ...s, visible: false }))
                    }
                    className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] leading-none text-slate-400 hover:bg-slate-800"
                  >
                    隐藏
                  </button>
                </>
              ) : (
                <>
                  {subModeTabs.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() =>
                        setSubPane2((s) => ({ ...s, content: x.id }))
                      }
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
                    title="隐藏此副图"
                    onClick={() =>
                      setSubPane2((s) => ({ ...s, visible: false }))
                    }
                    className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] leading-none text-slate-400 hover:bg-slate-800"
                  >
                    隐藏
                  </button>
                </>
              )}
            </div>
            {splitterY.sep12 != null &&
            subPane1.visible &&
            subPane2.visible ? (
              <div
                className="pointer-events-auto absolute left-0 right-0 z-[17] flex flex-wrap items-center gap-1 border-b border-[#2b2f3a]/90 bg-[#131722]/95 px-1.5 shadow-sm backdrop-blur-[1px]"
                style={{
                  top: Math.max(0, splitterY.sep12 - 22),
                  height: 22,
                }}
              >
                {subModeTabs.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() =>
                      setSubPane2((s) => ({ ...s, content: x.id }))
                    }
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
                  title="隐藏此副图"
                  onClick={() =>
                    setSubPane2((s) => ({ ...s, visible: false }))
                  }
                  className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] leading-none text-slate-400 hover:bg-slate-800"
                >
                  隐藏
                </button>
              </div>
            ) : null}
          </>
        ) : null}
        {splitterY ? (
          <>
            <div
              role="separator"
              aria-orientation="horizontal"
              title="上下拖动：调节主图与下一窗格高度"
              className="pointer-events-auto absolute left-0 right-0 z-[18] h-3 -translate-y-1/2 cursor-ns-resize touch-none hover:bg-slate-500/30"
              style={{ top: splitterY.sep01 }}
              onPointerDown={attachPaneSplitterDrag("01")}
            />
            {splitterY.sep12 != null ? (
              <div
                role="separator"
                aria-orientation="horizontal"
                title="上下拖动：调节两副图区域高度"
                className="pointer-events-auto absolute left-0 right-0 z-[18] h-3 -translate-y-1/2 cursor-ns-resize touch-none hover:bg-slate-500/30"
                style={{ top: splitterY.sep12 }}
                onPointerDown={attachPaneSplitterDrag("12")}
              />
            ) : null}
          </>
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

      {!subPane1.visible || !subPane2.visible ? (
        <div className="flex flex-wrap items-center justify-end gap-1 border-t border-[#2b2f3a] px-2 py-1">
          {!subPane1.visible ? (
            <button
              type="button"
              onClick={() =>
                setSubPane1((s) => ({ ...s, visible: true }))
              }
              className="rounded bg-emerald-900/40 px-2 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-900/60"
            >
              显示上方副图
            </button>
          ) : null}
          {!subPane2.visible ? (
            <button
              type="button"
              onClick={() =>
                setSubPane2((s) => ({ ...s, visible: true }))
              }
              className="rounded bg-emerald-900/40 px-2 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-900/60"
            >
              显示下方副图
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
