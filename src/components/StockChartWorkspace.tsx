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

export type StockChartWorkspaceProps = {
  symbol: string;
  interval: string;
  source: "binance" | "yahoo" | "massive";
  /** 占满父级剩余高度（行情页全屏用） */
  fillHeight?: boolean;
  /** 数据源说明（如 attribution），供顶栏展示 */
  onAttributionChange?: (text: string | null) => void;
};

type DrawingTool =
  | "cursor"
  | "trend"
  | "hline"
  | "vline"
  | "rect"
  | "fib"
  | "text";

type SubIndicator = "kdj" | "macd" | "rsi";

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

export function StockChartWorkspace({
  symbol,
  interval,
  source,
  fillHeight = false,
  onAttributionChange,
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
  const [subIndicator, setSubIndicator] = useState<SubIndicator>("kdj");
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
  } | null>(null);
  const [rangeIndices, setRangeIndices] = useState<{
    i0: number;
    i1: number;
  } | null>(null);
  const [rangeStats, setRangeStats] = useState<KlineRangeStatsResult | null>(
    null,
  );
  const [rangeOverlayPx, setRangeOverlayPx] = useState<{
    left: number;
    width: number;
  } | null>(null);
  /** 主图 pane 在行情区内的位置，用于区间选区竖向裁剪 + 分隔条定位 */
  const [mainPaneClip, setMainPaneClip] = useState<{
    top: number;
    height: number;
  } | null>(null);
  const [splitterY, setSplitterY] = useState<{
    sep01: number;
    sep12: number;
  } | null>(null);
  const rangeDragRef = useRef<{ start: number; cur: number } | null>(null);
  const trendDraftRef = useRef<{ t: Time; p: number } | null>(null);
  const rectDraftRef = useRef<{ t: Time; p: number } | null>(null);
  const fibDraftRef = useRef<{ t: Time; p: number } | null>(null);

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
  candlesRef.current = candles;
  volumesRef.current = volumes;
  intervalRef.current = interval;

  const syncPaneLayoutMetrics = useCallback(() => {
    const area = chartAreaRef.current;
    const chart = chartRef.current;
    if (!area || !chart) return;
    const panes = chart.panes();
    if (panes.length < 3) return;
    const ar = area.getBoundingClientRect();
    const p0el = panes[0]?.getHTMLElement();
    const p1el = panes[1]?.getHTMLElement();
    if (!p0el || !p1el) return;
    const r0 = p0el.getBoundingClientRect();
    const r1 = p1el.getBoundingClientRect();
    setMainPaneClip({
      top: r0.top - ar.top,
      height: r0.height,
    });
    setSplitterY({
      sep01: r0.bottom - ar.top,
      sep12: r1.bottom - ar.top,
    });
  }, []);

  const clearRangeSelection = useCallback(() => {
    setRangeStats(null);
    setRangeIndices(null);
    setRangeOverlayPx(null);
    setRangeDragPx(null);
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
    setRangeStats(stats);
    setRangeIndices({ i0, i1 });
    const px = computeRangeOverlayPx(chart, c, i0, i1);
    setRangeOverlayPx(px);
  }, []);

  const attachPaneSplitterDrag = useCallback(
    (boundary: "01" | "12") => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const chart = chartRef.current;
      if (!chart) return;
      const p = chart.panes();
      if (p.length < 3) return;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const pid = e.pointerId;
      const startY = e.clientY;
      const i0 = p[0]!.getHeight();
      const i1 = p[1]!.getHeight();
      const i2 = p[2]!.getHeight();

      const onMove = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        if (boundary === "01") {
          let n0 = i0 - dy;
          let n1 = i1 + dy;
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
          p[2]!.setStretchFactor(i2);
        } else {
          let n1 = i1 - dy;
          let n2 = i2 + dy;
          if (n1 < MIN_PANE_PX) {
            n2 -= MIN_PANE_PX - n1;
            n1 = MIN_PANE_PX;
          }
          if (n2 < MIN_PANE_PX) {
            n1 -= MIN_PANE_PX - n2;
            n2 = MIN_PANE_PX;
          }
          p[0]!.setStretchFactor(i0);
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
      setRangeDragPx({ x1: x, x2: x });
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
        setRangeDragPx({
          x1: rangeDragRef.current.start,
          x2: nx,
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
    [tool, finalizeRangeSelection],
  );

  useEffect(() => {
    clearRangeSelection();
  }, [symbol, source, interval, clearRangeSelection]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") clearRangeSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearRangeSelection]);

  useEffect(() => {
    if (!rangeIndices || !chartRef.current) return;
    const chart = chartRef.current;
    const c = candles;
    const sync = () => {
      const px = computeRangeOverlayPx(
        chart,
        c,
        rangeIndices.i0,
        rangeIndices.i1,
      );
      setRangeOverlayPx(px);
    };
    sync();
    chart.timeScale().subscribeVisibleLogicalRangeChange(sync);
    return () =>
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(sync);
  }, [rangeIndices, chartApi, candles]);

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
    chart.addPane();
    chart.addPane();
    chart.panes()[0]?.setStretchFactor(55);
    chart.panes()[1]?.setStretchFactor(18);
    chart.panes()[2]?.setStretchFactor(27);

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

    const histData = candles.map((c, i) => ({
      time: c.time,
      value: volumes[i] ?? 0,
      color:
        c.close >= c.open ? "rgba(38,166,154,0.65)" : "rgba(239,83,80,0.65)",
    }));
    const vol = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      },
      1,
    );
    /** 成交量在 pane 1，必须传 paneIndex，否则会报 incorrect ID */
    chart.priceScale("vol", 1).applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    });
    vol.setData(histData);

    if (subIndicator === "kdj" && candles.length > 0) {
      const { k, d, j } = kdj(candles);
      const ks = chart.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 1 }, 2);
      const ds = chart.addSeries(LineSeries, { color: "#60a5fa", lineWidth: 1 }, 2);
      const js = chart.addSeries(LineSeries, { color: "#f472b6", lineWidth: 1 }, 2);
      ks.setData(k);
      ds.setData(d);
      js.setData(j);
    } else if (subIndicator === "macd" && candles.length > 0) {
      const { dif, dea, hist } = macd(candles);
      const difs = chart.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 1 }, 2);
      const deas = chart.addSeries(LineSeries, { color: "#60a5fa", lineWidth: 1 }, 2);
      const hi = chart.addSeries(HistogramSeries, { priceScaleId: "macd" }, 2);
      chart.priceScale("macd", 2).applyOptions({
        scaleMargins: { top: 0.3, bottom: 0 },
      });
      difs.setData(dif);
      deas.setData(dea);
      hi.setData(hist);
    } else if (subIndicator === "rsi" && candles.length > 0) {
      const r = rsi(candles);
      const rs = chart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 1 }, 2);
      rs.setData(r);
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
        return;
      }
      const t = param.time;
      if (t === undefined) {
        setCrosshairOhlcv(null);
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
    };
    chart.subscribeCrosshairMove(crosshairHandler);

    const rangeHandler = () => {
      setOverlaySize((s) => ({ ...s }));
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(rangeHandler);

    return () => {
      setCrosshairOhlcv(null);
      setChartApi(null);
      chart.unsubscribeClick(clickHandler);
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(rangeHandler);
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
    subIndicator,
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

  const indTabs: { id: SubIndicator; label: string }[] = [
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
        {tool === "cursor" && rangeDragPx ? (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[12]"
            style={{
              top: mainPaneClip?.top ?? 0,
              height: mainPaneClip?.height ?? "100%",
            }}
          >
            <div
              className="absolute top-0 bottom-0 border-x border-amber-500/90 bg-slate-400/25"
              style={{
                left: Math.min(rangeDragPx.x1, rangeDragPx.x2),
                width: Math.abs(rangeDragPx.x2 - rangeDragPx.x1),
              }}
            />
          </div>
        ) : null}
        {tool === "cursor" && !rangeDragPx && rangeOverlayPx ? (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[12]"
            style={{
              top: mainPaneClip?.top ?? 0,
              height: mainPaneClip?.height ?? "100%",
            }}
          >
            <div
              className="absolute top-0 bottom-0 border-x border-amber-500/75 bg-slate-500/18"
              style={{
                left: rangeOverlayPx.left,
                width: rangeOverlayPx.width,
              }}
            />
          </div>
        ) : null}
        {splitterY ? (
          <>
            <div
              role="separator"
              aria-orientation="horizontal"
              title="上下拖动：调节主图与成交量区高度"
              className="pointer-events-auto absolute left-0 right-0 z-[18] h-3 -translate-y-1/2 cursor-ns-resize touch-none hover:bg-slate-500/30"
              style={{ top: splitterY.sep01 }}
              onPointerDown={attachPaneSplitterDrag("01")}
            />
            <div
              role="separator"
              aria-orientation="horizontal"
              title="上下拖动：调节成交量与副图指标区高度"
              className="pointer-events-auto absolute left-0 right-0 z-[18] h-3 -translate-y-1/2 cursor-ns-resize touch-none hover:bg-slate-500/30"
              style={{ top: splitterY.sep12 }}
              onPointerDown={attachPaneSplitterDrag("12")}
            />
          </>
        ) : null}
      </div>

      {rangeStats ? (
        <KlineRangeStatsPanel
          stats={rangeStats}
          onClose={clearRangeSelection}
        />
      ) : null}

      <ChartTimeRangeBrush chart={chartApi} candles={candles} />

      <div className="flex flex-wrap items-center gap-1 border-t border-[#2b2f3a] px-2 py-2">
        <span className="mr-1 text-[11px] text-slate-500">副图</span>
        {indTabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setSubIndicator(x.id)}
            className={`rounded px-2.5 py-1 text-[11px] ${
              subIndicator === x.id
                ? "bg-indigo-950/90 text-indigo-100"
                : "bg-slate-800/60 text-slate-400 hover:bg-slate-700"
            }`}
          >
            VOL + {x.label}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 pl-2 text-[11px] text-slate-400">
          <input
            type="checkbox"
            checked={showBoll}
            onChange={(e) => setShowBoll(e.target.checked)}
            className="rounded border-slate-600"
          />
          BOLL(20,2)
        </label>
      </div>
    </div>
  );
}
