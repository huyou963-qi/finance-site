"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  HistogramSeries,
  isBusinessDay,
  LineSeries,
  type CandlestickData,
  type LineData,
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
  computeVisibleRangeExtrema,
  type KlineRangeStatsResult,
} from "@/lib/chart/klineRangeStats";
import {
  pickDrawingAt,
  type DrawingHitTarget,
} from "@/lib/chart/drawingHitTest";
import {
  klineDebugLog,
  logCandleSeriesReport,
} from "@/lib/data/klineDebug";
import { mergeKlinePayload } from "@/lib/data/klineMerge";
import type { KlinePayload } from "@/lib/data/types";
import {
  bollinger,
  kdj,
  macd,
  rsi,
  sma,
} from "@/lib/chart/technicalIndicators";
import {
  DEFAULT_INDICATOR_SETTINGS,
  loadIndicatorSettings,
  MA_COLORS,
  parseMaPeriodsInput,
  sanitizeIndicatorSettings,
  saveIndicatorSettings,
  type IndicatorSettings,
} from "@/lib/chart/indicatorSettings";
import {
  peLineFromQuarterlyPe,
  ttmPeLineFromCandles,
  type QuarterlyPePoint,
  type TtmEpsPoint,
} from "@/lib/data/ttmPeSeries";
import {
  ChartDrawingOverlay,
  type DrawingDraftPreview,
  type SvgOverlayShape,
  type VisibleExtremaOverlay,
} from "@/components/chart/ChartDrawingOverlay";
import type { RangeStatWireSegment } from "@/lib/klinePageSyncChannel";
import { floorBarIndexForTime } from "@/lib/pageSyncChannel";
import type { PriceAdjustmentMode } from "@/lib/equity/priceAdjustment";
import {
  barMsForInterval,
  isKlineInterval,
  KLINE_PAGE_SIZE,
  klineExclusiveCutBeforeOldest,
  type KlineInterval,
} from "@/lib/data/klineShared";
import { randomUUID } from "@/lib/randomId";
import { KLINE, SITE } from "@/lib/siteTheme";

/** 首屏与每次向左追加的条数（与 /api/data/klines?limit= 一致） */
const KLINE_INITIAL_LIMIT = KLINE_PAGE_SIZE;

/**
 * 将 lightweight-charts 横轴 `Time`（UTCTimestamp / BusinessDay / ISO 串）统一为 Unix 秒。
 * 日/周 K 的 `getVisibleRange().from` 常为 BusinessDay，若用 `typeof === "number"` 判断会永远为 false，导致向左预取历史从不触发。
 */
function horzTimeToUnixSec(t: Time): number | null {
  if (typeof t === "number" && Number.isFinite(t)) return t;
  if (typeof t === "string") {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  if (isBusinessDay(t)) {
    return Math.floor(Date.UTC(t.year, t.month - 1, t.day) / 1000);
  }
  return null;
}

/** 可见逻辑索引左缘小于等于该值时尝试加载更早 K 线（与柱数无关，略放大以减少漏触发） */
const LOGICAL_PREFETCH_EDGE = 240;

export type StockChartWorkspaceProps = {
  symbol: string;
  interval: string;
  /** 数据源固定 Yahoo（保留字段以兼容调用方；仅作 localStorage key 前缀） */
  source?: string;
  /** K 线价格复权（默认前复权；见 GET /api/data/klines?adjust=） */
  priceAdjustment?: PriceAdjustmentMode;
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
  /** 本图可见区间变化（用户缩放/平移；页面同步开启时广播） */
  onLocalVisibleTimeRange?: (from: number, to: number) => void;
  /** 本图可见区间变化（始终回调，供事件列表等） */
  onVisibleTimeRangeChange?: (from: number, to: number) => void;
  /** 本图十字锚定的柱时间 */
  onLocalCrosshairTime?: (time: UTCTimestamp | null) => void;
  /** 若设置则将「主图叠加 / 区间统计 / 画图工具 / 清除画线」挂载到该 DOM 节点（如行情页顶栏） */
  toolbarPortalEl?: HTMLElement | null;
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
type SubPaneContent = "volume" | "kdj" | "macd" | "rsi" | "ttmpe";

/** 副图指标参数（KDJ / MACD / RSI 由用户设置面板调节） */
type SubPaneIndicatorParams = Pick<IndicatorSettings, "kdj" | "macd" | "rsi">;

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

function storageKey(
  source: string,
  symbol: string,
  interval: string,
  adjustment: PriceAdjustmentMode,
) {
  return `kline-drawings-v1:${source}:${symbol}:${interval}:${adjustment}`;
}

function syntheticVolumes(candles: CandlestickData[]): number[] {
  return candles.map(
    (c) => Math.abs(c.close - c.open) * 1_000_000 + Math.random() * 1e3,
  );
}

type SubPaneScaleKey = "a" | "b";

/** 副图顶栏高度（px）；scaleMargins 同步预留，避免压在成交量柱/指标线上 */
const SUB_PANE_TOOLBAR_PX = 26;

/** 主图底时间轴高度预留（副轴全隐藏时指标条下移，避免挡住年份刻度） */
const KLINE_TIME_SCALE_RESERVE_PX = 30;

const KLINE_CHART_TEXT_COLOR = KLINE.text;

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
          scaleMargins: { top: tf, bottom: 0 },
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
          scaleMargins: { top: tf, bottom: 0 },
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
        scaleMargins: { top: tf, bottom: 0 },
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
        scaleMargins: { top: tf, bottom: 0 },
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

type SubPaneSeriesApi = ISeriesApi<"Line" | "Histogram", Time>;

function subPaneSeriesCount(content: SubPaneContent): number {
  if (content === "kdj" || content === "macd") return 3;
  return 1;
}

function appendSubPaneSeries(
  chart: IChartApi,
  candles: CandlestickData[],
  volumes: number[],
  paneIndex: number,
  content: SubPaneContent,
  scaleKey: SubPaneScaleKey,
  ttmPeLine: LineData[],
  params: SubPaneIndicatorParams,
): SubPaneSeriesApi[] {
  if (!candles.length) return [];
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
      scaleMargins: { top: 0.14, bottom: 0 },
    });
    vol.setData(histData);
    return [vol];
  }
  if (content === "kdj") {
    const { k, d, j } = kdj(candles, params.kdj.n, params.kdj.m1, params.kdj.m2);
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
    return [ks, ds, js];
  }
  if (content === "macd") {
    const { dif, dea, hist } = macd(
      candles,
      params.macd.fast,
      params.macd.slow,
      params.macd.signal,
    );
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
    return [difs, deas, hi];
  }
  if (content === "rsi") {
    const r = rsi(candles, params.rsi.period);
    const rs = chart.addSeries(
      LineSeries,
      { color: "#a78bfa", lineWidth: 1 },
      paneIndex,
    );
    rs.setData(r);
    return [rs];
  }
  if (content === "ttmpe") {
    const rs = chart.addSeries(
      LineSeries,
      {
        color: "#22d3ee",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
      },
      paneIndex,
    );
    if (ttmPeLine.length) rs.setData(ttmPeLine);
    return [rs];
  }
  return [];
}

function updateSubPaneSeriesData(
  apis: SubPaneSeriesApi[],
  content: SubPaneContent,
  candles: CandlestickData[],
  volumes: number[],
  ttmPeLine: LineData[],
  params: SubPaneIndicatorParams,
): void {
  if (!apis.length || !candles.length) return;
  if (content === "volume" && apis[0]) {
    const histData = candles.map((c, i) => ({
      time: c.time,
      value: volumes[i] ?? 0,
      color:
        c.close >= c.open ? "rgba(38,166,154,0.65)" : "rgba(239,83,80,0.65)",
    }));
    apis[0].setData(histData);
    return;
  }
  if (content === "kdj" && apis.length >= 3) {
    const { k, d, j } = kdj(candles, params.kdj.n, params.kdj.m1, params.kdj.m2);
    apis[0]!.setData(k);
    apis[1]!.setData(d);
    apis[2]!.setData(j);
    return;
  }
  if (content === "macd" && apis.length >= 3) {
    const { dif, dea, hist } = macd(
      candles,
      params.macd.fast,
      params.macd.slow,
      params.macd.signal,
    );
    apis[0]!.setData(dif);
    apis[1]!.setData(dea);
    apis[2]!.setData(hist);
    return;
  }
  if (content === "rsi" && apis[0]) {
    apis[0].setData(rsi(candles, params.rsi.period));
    return;
  }
  if (content === "ttmpe" && apis[0]) {
    apis[0].setData(ttmPeLine);
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

/** 十字光标 / 时间轴统一日期：YYYY/MM/DD（UTC 日历日） */
function formatYyyyMmDdUtc(sec: number): string {
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function formatBarTimeLabel(t: Time, intervalRaw: string): string {
  const sec = horzTimeToUnixSec(t);
  if (sec == null) return String(t);
  const iv = intervalRaw;
  if (iv === "15m" || iv === "1h" || iv === "4h") {
    const d = new Date(sec * 1000);
    const h = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    return `${formatYyyyMmDdUtc(sec)} ${h}:${mi}`;
  }
  return formatYyyyMmDdUtc(sec);
}

function chartTimeFormatter(t: Time): string {
  const sec = horzTimeToUnixSec(t);
  if (sec == null) return "";
  return formatYyyyMmDdUtc(sec);
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
      id: randomUUID(),
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

/** 指标设置弹层内的紧凑数字输入 */
function IndicatorNumField({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-fs-muted">
      <span className="shrink-0">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onCommit(n);
        }}
        className="w-14 rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-fs-text outline-none focus:border-fs-accent/70"
      />
    </label>
  );
}

export function StockChartWorkspace({
  symbol,
  interval,
  source = "yahoo",
  priceAdjustment = "forward",
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
  onVisibleTimeRangeChange,
  onLocalCrosshairTime,
  toolbarPortalEl = null,
}: StockChartWorkspaceProps) {
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const nativeHandlesRef = useRef<{
    userPriceLines: IPriceLine[];
    userTrendLines: ISeriesApi<"Line", Time>[];
    /** 主图叠加均线句柄（图表重建时清空）；BOLL 与 MA 可同时存在，分别持有以便增量刷新 */
    overlayLines: {
      boll: ISeriesApi<"Line", Time>[];
      ma: ISeriesApi<"Line", Time>[];
    };
    /** 副图序列（appendSubPaneSeries 顺序），用于追加历史后刷新指标 */
    subPaneSeries: SubPaneSeriesApi[];
  }>({
    userPriceLines: [],
    userTrendLines: [],
    overlayLines: { boll: [], ma: [] },
    subPaneSeries: [],
  });

  const [payload, setPayload] = useState<KlinePayload | null>(null);
  const payloadRef = useRef<KlinePayload | null>(null);
  payloadRef.current = payload;
  const historyExhaustedRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const [hint, setHint] = useState<string | null>(null);
  const [klineError, setKlineError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState<DrawingTool>("cursor");
  const toolRef = useRef<DrawingTool>("cursor");
  /**
   * 技术指标参数（用户级偏好，跨标的共享）。首屏用默认值以保证 SSR/CSR 一致，
   * 挂载后从 localStorage 覆盖。maOn / bollOn 可同时开启。
   */
  const [indicators, setIndicators] = useState<IndicatorSettings>(
    DEFAULT_INDICATOR_SETTINGS,
  );
  useEffect(() => {
    setIndicators(loadIndicatorSettings());
  }, []);
  useEffect(() => {
    saveIndicatorSettings(indicators);
  }, [indicators]);
  const indicatorsRef = useRef(indicators);
  indicatorsRef.current = indicators;
  /** 主图叠加结构性签名：开关 + MA 周期列表变化需重建图（增删序列条数） */
  const overlayStructKey = `${indicators.maOn ? indicators.maPeriods.join("-") : ""}|${
    indicators.bollOn ? "b" : ""
  }`;
  const subParams = useMemo<SubPaneIndicatorParams>(
    () => ({
      kdj: indicators.kdj,
      macd: indicators.macd,
      rsi: indicators.rsi,
    }),
    [indicators.kdj, indicators.macd, indicators.rsi],
  );
  /** 主图叠加设置弹层开关 */
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false);
  const overlayMenuRef = useRef<HTMLDivElement>(null);
  /** MA 周期用文本框自由编辑，失焦/回车时提交（parseMaPeriodsInput 规范化） */
  const [maPeriodsInput, setMaPeriodsInput] = useState(
    indicators.maPeriods.join(", "),
  );
  useEffect(() => {
    setMaPeriodsInput(indicators.maPeriods.join(", "));
  }, [indicators.maPeriods]);

  /** 局部修改指标设置：合并后统一 sanitize，保证周期/乘数取值合法 */
  const patchIndicators = useCallback(
    (patch: Partial<IndicatorSettings>) => {
      setIndicators((s) => sanitizeIndicatorSettings({ ...s, ...patch }));
    },
    [],
  );
  const commitMaPeriods = useCallback(() => {
    setIndicators((s) => ({
      ...s,
      maPeriods: parseMaPeriodsInput(maPeriodsInput),
    }));
  }, [maPeriodsInput]);
  /** 两个副图可独立选成交量/指标、可单独关闭 */
  const [subPane1, setSubPane1] = useState<{
    visible: boolean;
    content: SubPaneContent;
  }>({ visible: true, content: "volume" });
  const [subPane2, setSubPane2] = useState<{
    visible: boolean;
    content: SubPaneContent;
  }>({ visible: true, content: "kdj" });
  const [ttmEpsTimeline, setTtmEpsTimeline] = useState<TtmEpsPoint[]>([]);
  const [quarterlyPe, setQuarterlyPe] = useState<QuarterlyPePoint[]>([]);
  const [ttmPeError, setTtmPeError] = useState<string | null>(null);
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
  /** 关闭时不响应拖拽划定区间，并隐藏区间叠层与统计面板（数据保留，再次开启可恢复） */
  const [rangeStatsEnabled, setRangeStatsEnabled] = useState(true);
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
  const onVisibleTimeRangeChangeRef = useRef(onVisibleTimeRangeChange);
  const onLocalCrosshairTimeRef = useRef(onLocalCrosshairTime);
  onRangeSpecsBroadcastRef.current = onRangeSpecsBroadcast;
  onLocalVisibleTimeRangeRef.current = onLocalVisibleTimeRange;
  onVisibleTimeRangeChangeRef.current = onVisibleTimeRangeChange;
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
    if (!overlayMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (overlayMenuRef.current?.contains(e.target as Node)) return;
      setOverlayMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [overlayMenuOpen]);

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
      historyExhaustedRef.current = true;
      return;
    }
    historyExhaustedRef.current = false;
    setLoading(true);
    setPayload(null);
    setHint(null);
    setKlineError(null);
    const qs = new URLSearchParams({
      source,
      symbol,
      interval,
      limit: String(KLINE_INITIAL_LIMIT),
      adjust: priceAdjustment,
    });
    fetch(`/api/data/klines?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as {
            error?: string;
            klineDebugTrace?: Array<{
              scope: string;
              phase: string;
              payload: Record<string, unknown>;
              at: string;
            }>;
          };
          if (j.klineDebugTrace?.length) {
            klineDebugLog("client", "initial_load.server_trace", {
              symbol,
              source,
              trace: j.klineDebugTrace,
            });
          }
          throw new Error(j.error ?? `${r.status}`);
        }
        return r.json() as Promise<KlinePayload>;
      })
      .then((p) => {
        if (cancelled) return;
        setPayload(p);
        setHint(p.attribution ?? null);
        setKlineError(null);
        /**
         * 首屏柱数 < limit 时常仍有更早历史（仅窗口内凑不满一页）；勿仅因 hasMoreOlder:false 锁死。
         */
        if (p.candles.length === 0) {
          historyExhaustedRef.current = true;
        } else if (p.candles.length < KLINE_INITIAL_LIMIT) {
          historyExhaustedRef.current = false;
        } else if (p.hasMoreOlder === false) {
          historyExhaustedRef.current = true;
        } else {
          historyExhaustedRef.current = false;
        }
        logCandleSeriesReport("client", "initial_load", p.candles, interval, {
          symbol,
          source,
          adjust: priceAdjustment,
          payloadSource: p.source,
          hasMoreOlder: p.hasMoreOlder,
          historyExhausted: historyExhaustedRef.current,
        });
        onKlineLoadSuccessRef.current?.();
      })
      .catch((e) => {
        if (cancelled) return;
        klineDebugLog("client", "initial_load.error", {
          symbol,
          source,
          interval,
          message: e instanceof Error ? e.message : String(e),
        });
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
  }, [symbol, interval, source, priceAdjustment]);

  useEffect(() => {
    if (!symbol.trim()) {
      setDrawings([]);
      setSelectedDrawingId(null);
      return;
    }
    const key = storageKey(source, symbol, interval, priceAdjustment);
    setDrawings(parsePersisted(typeof window !== "undefined" ? localStorage.getItem(key) : null));
    setSelectedDrawingId(null);
  }, [source, symbol, interval, priceAdjustment]);

  useEffect(() => {
    if (!symbol.trim()) return;
    const key = storageKey(source, symbol, interval, priceAdjustment);
    try {
      localStorage.setItem(key, JSON.stringify(drawings));
    } catch {
      /* ignore */
    }
  }, [drawings, source, symbol, interval, priceAdjustment]);

  // 服务端已按 adjust= 精确复权（拆股事件 + 分红因子），客户端直接使用
  const candles = useMemo(() => payload?.candles ?? [], [payload?.candles]);

  const needsTtmPe =
    subPane1.content === "ttmpe" || subPane2.content === "ttmpe";

  useEffect(() => {
    if (!symbol.trim() || !needsTtmPe) {
      setTtmEpsTimeline([]);
      setQuarterlyPe([]);
      setTtmPeError(null);
      return;
    }
    let cancelled = false;
    setTtmPeError(null);
    fetch(`/api/data/ttm-pe?symbol=${encodeURIComponent(symbol.trim())}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          error?: string;
          ttmTimeline?: TtmEpsPoint[];
          quarterlyPe?: QuarterlyPePoint[];
        };
        if (!r.ok) throw new Error(j.error ?? `${r.status}`);
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        setTtmEpsTimeline(j.ttmTimeline ?? []);
        setQuarterlyPe(j.quarterlyPe ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setTtmEpsTimeline([]);
        setQuarterlyPe([]);
        setTtmPeError(
          e instanceof Error ? e.message : "TTM PE 数据加载失败",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, needsTtmPe]);

  const ttmPeLine = useMemo(() => {
    if (quarterlyPe.length) {
      return peLineFromQuarterlyPe(candles, quarterlyPe);
    }
    return ttmPeLineFromCandles(candles, ttmEpsTimeline);
  }, [candles, ttmEpsTimeline, quarterlyPe]);

  const volumes = useMemo(() => {
    const c = payload?.candles ?? [];
    if (payload?.volumes && payload.volumes.length === c.length) {
      return payload.volumes;
    }
    return c.length ? syntheticVolumes(c) : [];
  }, [payload?.candles, payload?.volumes]);

  /** 当前屏幕可见 K 线区间内的最高/最低（随缩放平移更新） */
  const visibleExtremaOverlay = useMemo((): VisibleExtremaOverlay | null => {
    void overlayLayoutTick;
    const chart = chartRef.current;
    if (loading || !chart || candles.length === 0) return null;
    const ext = computeVisibleRangeExtrema(candles, chart);
    if (!ext) return null;
    return {
      high: {
        t: ext.high.time as UTCTimestamp,
        price: ext.high.price,
        text: `高 ${fmtPriceCompact(ext.high.price)}`,
      },
      low: {
        t: ext.low.time as UTCTimestamp,
        price: ext.low.price,
        text: `低 ${fmtPriceCompact(ext.low.price)}`,
      },
    };
  }, [candles, loading, overlayLayoutTick]);

  const loadMoreHistory = useCallback(async () => {
    if (loading || loadingOlderRef.current) {
      klineDebugLog("client",  "loadMore.skip", {
        reason: loading ? "main_loading" : "older_in_flight",
        loading,
        loadingOlder: loadingOlderRef.current,
      });
      return;
    }
    if (historyExhaustedRef.current) {
      klineDebugLog("client",  "loadMore.skip", { reason: "history_exhausted" });
      return;
    }
    const p = payloadRef.current;
    if (!p?.candles.length) {
      klineDebugLog("client",  "loadMore.skip", { reason: "no_payload_candles" });
      return;
    }
    if (p.hasMoreOlder === false) {
      historyExhaustedRef.current = true;
      klineDebugLog("client",  "loadMore.skip", {
        reason: "payload_hasMoreOlder_false",
        hasMoreOlder: p.hasMoreOlder,
      });
      return;
    }
    if (
      p.hasMoreOlder === undefined &&
      p.candles.length < KLINE_INITIAL_LIMIT
    ) {
      historyExhaustedRef.current = true;
      klineDebugLog("client",  "loadMore.skip", {
        reason: "short_first_page_undefined_older",
        n: p.candles.length,
        KLINE_INITIAL_LIMIT,
      });
      return;
    }
    /** 最早柱时间；日线 before 用「该 UTC 日次日 0 点」作 cut，避免漏掉楔内下一交易日 */
    const oldestBarSec = p.candles[0]!.time as number;
    const beforeCut = klineExclusiveCutBeforeOldest(oldestBarSec, interval);
    loadingOlderRef.current = true;
    const qs = new URLSearchParams({
      source,
      symbol,
      interval,
      limit: String(KLINE_PAGE_SIZE),
      before: String(beforeCut),
      adjust: priceAdjustment,
    });
    const url = `/api/data/klines?${qs.toString()}`;
    klineDebugLog("client", "loadMore.fetch", {
      url,
      oldestBarSec,
      oldestBarIso: new Date(oldestBarSec * 1000).toISOString(),
      beforeCutSec: beforeCut,
      beforeCutIso: new Date(beforeCut * 1000).toISOString(),
      source,
      symbol,
      interval,
      hasMoreOlder: p.hasMoreOlder,
      loadedBars: p.candles.length,
    });
    try {
      const r = await fetch(url);
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        klineDebugLog("client", "loadMore.response_error", {
          status: r.status,
          bodySlice: errText.slice(0, 300),
        });
        return;
      }
      const chunk = (await r.json()) as KlinePayload;
      logCandleSeriesReport("client", "loadMore.chunk", chunk.candles, interval, {
        chunkSource: chunk.source,
        chunkHasMoreOlder: chunk.hasMoreOlder,
        beforeCutSec: beforeCut,
      });
      if (!chunk.candles?.length) {
        historyExhaustedRef.current = true;
        klineDebugLog("client", "loadMore.empty_chunk", {
          chunkHasMoreOlder: chunk.hasMoreOlder,
          beforeCutSec: beforeCut,
        });
        return;
      }
      setPayload((prev) => {
        if (!prev) return chunk;
        const beforeLen = prev.candles.length;
        const merged = mergeKlinePayload(prev, chunk, {
          interval,
          beforeSec: beforeCut,
        });
        /** 向左追加未增加任何柱（时间全部重叠）时视为已无更早数据，防止 IB 等源误判导致死循环 */
        if (merged.candles.length === beforeLen) {
          historyExhaustedRef.current = true;
          klineDebugLog("client", "loadMore.merge_no_growth", {
            beforeLen,
            chunkBars: chunk.candles.length,
            beforeCutSec: beforeCut,
          });
        } else {
          logCandleSeriesReport("client", "loadMore.merged", merged.candles, interval, {
            beforeLen,
            afterLen: merged.candles.length,
            chunkBars: chunk.candles.length,
            chunkHasMoreOlder: chunk.hasMoreOlder,
            mergedHasMoreOlder: merged.hasMoreOlder,
          });
          klineDebugLog("client", "loadMore.merge_ok", {
            beforeLen,
            afterLen: merged.candles.length,
            chunkBars: chunk.candles.length,
          });
        }
        return merged;
      });
      if (chunk.hasMoreOlder === false) historyExhaustedRef.current = true;
    } catch (e) {
      klineDebugLog("client", "loadMore.fetch_throw", {
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      loadingOlderRef.current = false;
    }
  }, [loading, source, symbol, interval, priceAdjustment]);

  const loadMoreHistoryRef = useRef<() => void>(() => {});
  loadMoreHistoryRef.current = () => {
    void loadMoreHistory();
  };

  const candlesRef = useRef(candles);
  const volumesRef = useRef(volumes);
  const intervalRef = useRef(interval);
  const symbolRefForLog = useRef(symbol);
  const sourceRefForLog = useRef(source);
  const rangeEntriesRef = useRef(rangeEntries);
  candlesRef.current = candles;
  volumesRef.current = volumes;
  intervalRef.current = interval;
  symbolRefForLog.current = symbol;
  sourceRefForLog.current = source;
  rangeEntriesRef.current = rangeEntries;

  /** 追加历史后刷新序列数据，避免整图重建导致可见区间丢失 */
  useEffect(() => {
    if (loading) return;
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle || candles.length === 0) return;

    const vr = chart.timeScale().getVisibleRange();
    const lr = chart.timeScale().getVisibleLogicalRange();

    logCandleSeriesReport("client", "chart.setData", candles, interval, {
      symbol: symbolRefForLog.current,
      source: sourceRefForLog.current,
      visibleFromSec:
        vr != null ? horzTimeToUnixSec(vr.from as Time) : null,
      visibleToSec:
        vr != null ? horzTimeToUnixSec(vr.to as Time) : null,
      logicalFrom: lr?.from,
      logicalTo: lr?.to,
    });

    candle.setData(candles);

    const h = nativeHandlesRef.current;
    const ind = indicatorsRef.current;
    if (
      ind.bollOn &&
      candles.length >= ind.boll.period &&
      h.overlayLines.boll.length >= 3
    ) {
      const { mid, upper, lower } = bollinger(
        candles,
        ind.boll.period,
        ind.boll.mult,
      );
      h.overlayLines.boll[0]!.setData(mid);
      h.overlayLines.boll[1]!.setData(upper);
      h.overlayLines.boll[2]!.setData(lower);
    }
    if (ind.maOn) {
      ind.maPeriods.forEach((period, i) => {
        if (candles.length < period) return;
        const data = sma(candles, period);
        if (!data.length) return;
        h.overlayLines.ma[i]?.setData(data);
      });
    }

    const subs = h.subPaneSeries;
    let idx = 0;
    if (subPane1.visible) {
      const n = subPaneSeriesCount(subPane1.content);
      updateSubPaneSeriesData(
        subs.slice(idx, idx + n),
        subPane1.content,
        candles,
        volumes,
        ttmPeLine,
        subParams,
      );
      idx += n;
    }
    if (subPane2.visible) {
      const n = subPaneSeriesCount(subPane2.content);
      updateSubPaneSeriesData(
        subs.slice(idx, idx + n),
        subPane2.content,
        candles,
        volumes,
        ttmPeLine,
        subParams,
      );
    }

    if (vr) {
      chart.timeScale().setVisibleRange({
        from: vr.from,
        to: vr.to,
      });
    }
  }, [
    candles,
    volumes,
    loading,
    interval,
    indicators.bollOn,
    indicators.boll.period,
    indicators.boll.mult,
    indicators.maOn,
    overlayStructKey,
    subParams,
    subPane1.visible,
    subPane1.content,
    subPane2.visible,
    subPane2.content,
    ttmPeLine,
  ]);

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

    /** 双副图均隐藏：指标条放在时间轴下方，避免半透明顶栏压住年份刻度 */
    if (panes.length === 1) {
      const belowMain = r0.bottom - ar.top;
      const toolTop = belowMain + KLINE_TIME_SCALE_RESERVE_PX;
      slot1Geom = {
        top: toolTop,
        height: SUB_PANE_TOOLBAR_PX,
      };
      slot2Geom = {
        top: toolTop + SUB_PANE_TOOLBAR_PX,
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
          id: randomUUID(),
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
        if (!rangeStatsEnabled) return;
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
    [tool, rangeStatsEnabled],
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
          let n0 = h0 + dy;
          let n1 = h1 - dy;
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
          let n1 = h1 + dy;
          let n2 = h2 - dy;
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
      if (!rangeStatsEnabled) return;
      if (tool !== "cursor") return;
      if (e.button !== 0) return;
      /**
       * 不按 Shift：左键拖拽交给图表库平移时间轴（向左可看更早 K 线并触发追加历史）。
       * 按住 Shift 再拖：划定区间统计（避免 intercept preventDefault 导致无法按住拖拽平移）。
       */
      if (!e.shiftKey) return;
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
    [tool, finalizeRangeSelection, rangeEntries.length, rangeStatsEnabled],
  );

  useEffect(() => {
    if (rangeStatsEnabled) return;
    setRangeDragPx(null);
    rangeDragRef.current = null;
  }, [rangeStatsEnabled]);

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
    if (loading || !candlesRef.current.length || !wrapRef.current) return;

    const el = wrapRef.current;
    const box = chartAreaRef.current;
    const cw = Math.max(100, box?.clientWidth ?? el.clientWidth);
    const ch = Math.max(400, box?.clientHeight ?? 520);
    el.replaceChildren();
    const chart = createChart(el, {
      layout: {
        background: { color: KLINE.background },
        textColor: KLINE_CHART_TEXT_COLOR,
        /** 隐藏主图左下角 TradingView / lightweight-charts 圆形徽标（许可证允许在页面其它位置保留归属说明） */
        attributionLogo: false,
        /**
         * 关闭库内置窗格分隔条拖动。否则副图1/2 之间会出现第二条「灰线」，
         * 拖的是库的 stretch，不会走我们的同步逻辑，副图2 指标条会错位；
         * 高度调节仅保留：主↔副图1 青边条、副图2 顶栏琥珀条。
         */
        panes: {
          enableResize: false,
          separatorColor: KLINE.border,
          separatorHoverColor: "rgba(107, 107, 107, 0.25)",
        },
      },
      grid: {
        vertLines: { color: KLINE.grid },
        horzLines: { color: KLINE.grid },
      },
      localization: {
        locale: "zh-CN",
        dateFormat: "yyyy/MM/dd",
        timeFormatter: chartTimeFormatter,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          labelVisible: true,
          labelBackgroundColor: SITE.elevated,
          color: SITE.muted,
        },
        horzLine: {
          labelBackgroundColor: SITE.elevated,
          color: SITE.muted,
        },
      },
      rightPriceScale: {
        borderColor: KLINE.border,
        textColor: KLINE_CHART_TEXT_COLOR,
      },
      timeScale: {
        borderColor: "#485065",
        timeVisible: interval !== "1d" && interval !== "1w",
        secondsVisible: false,
        /**
         * 勿设 fixLeftEdge：在「整段数据一屏能放下」时库会收紧 min/maxRightOffset，
         * 水平拖动区间变为 0，表现为完全无法左右平移。
         * 左侧空白靠接近最早柱时 loadMoreHistory（before=最早柱 unix 秒）补历史。
         */
      },
      width: cw,
      height: ch,
    });
    chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    chartRef.current = chart;
    setChartApi(chart);
    const initialCandles = candlesRef.current;
    const initialVolumes = volumesRef.current;
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
        upColor: KLINE.up,
        downColor: KLINE.down,
        borderVisible: false,
        wickUpColor: KLINE.up,
        wickDownColor: KLINE.down,
      },
      0,
    );
    candle.setData(initialCandles);
    candleRef.current = candle;

    nativeHandlesRef.current.overlayLines = { boll: [], ma: [] };
    nativeHandlesRef.current.subPaneSeries = [];

    const ind = indicatorsRef.current;

    if (ind.bollOn && initialCandles.length >= ind.boll.period) {
      const { mid, upper, lower } = bollinger(
        initialCandles,
        ind.boll.period,
        ind.boll.mult,
      );
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
      h.overlayLines.boll.push(midS, upS, loS);
    }

    if (ind.maOn) {
      const h = nativeHandlesRef.current;
      ind.maPeriods.forEach((period, i) => {
        const s = chart.addSeries(
          LineSeries,
          {
            color: MA_COLORS[i % MA_COLORS.length],
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          0,
        );
        // 数据不足时先建空序列占位，保持句柄下标与 maPeriods 对齐，追加历史后再填充
        s.setData(initialCandles.length >= period ? sma(initialCandles, period) : []);
        h.overlayLines.ma.push(s);
      });
    }

    const subPaneApis: SubPaneSeriesApi[] = [];
    let subPaneIdx = 1;
    if (subPane1.visible) {
      subPaneApis.push(
        ...appendSubPaneSeries(
          chart,
          initialCandles,
          initialVolumes,
          subPaneIdx,
          subPane1.content,
          "a",
          ttmPeLine,
          subParams,
        ),
      );
      subPaneIdx++;
    }
    if (subPane2.visible) {
      subPaneApis.push(
        ...appendSubPaneSeries(
          chart,
          initialCandles,
          initialVolumes,
          subPaneIdx,
          subPane2.content,
          "b",
          ttmPeLine,
          subParams,
        ),
      );
    }
    nativeHandlesRef.current.subPaneSeries = subPaneApis;

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
        const id = randomUUID();
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
          const id = randomUUID();
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
        const id = randomUUID();
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
          const id = randomUUID();
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
          const id = randomUUID();
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
            const id = randomUUID();
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
        const id = randomUUID();
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
        const pt = param.point;
        if (!pt) {
          return prev;
        }
        if ((param.paneIndex ?? 0) !== 0) {
          return { ...prev, hover: null };
        }
        const ph =
          chartRef.current?.panes()[0]?.getHeight() ?? null;
        if (ph !== null && (pt.y < 0 || pt.y > ph)) {
          return { ...prev, hover: null };
        }
        const hp = se.coordinateToPrice(pt.y);
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

    /**
     * 向左预取必须在 chart 创建 **同一 effect** 内注册：否则单独 effect 若在 createChart 之前执行，
     * chartRef 尚为 null 会整段跳过，且可能不再重跑，导致拖动画布从不发 klines 请求。
     */
    let prefetchOlderTimer: number | null = null;
    const schedulePrefetchOlderBars = () => {
      if (prefetchOlderTimer != null) window.clearTimeout(prefetchOlderTimer);
      prefetchOlderTimer = window.setTimeout(() => {
        prefetchOlderTimer = null;
        if (historyExhaustedRef.current) {
          klineDebugLog("client", "prefetch.skip", { reason: "history_exhausted" });
          return;
        }
        const lr = chart.timeScale().getVisibleLogicalRange();
        const tr = chart.timeScale().getVisibleRange();
        const c = candlesRef.current;
        if (!c.length) {
          klineDebugLog("client", "prefetch.skip", { reason: "no_candles_ref" });
          return;
        }
        const oldestSec = c[0]!.time as number;
        const iv: KlineInterval = isKlineInterval(intervalRef.current)
          ? intervalRef.current
          : "1d";
        const barSec = barMsForInterval(iv) / 1000;
        const n = c.length;
        /** 不超过柱数；且与 LOGICAL_PREFETCH_EDGE 取 min，避免 n 较小时阈值大于 n−1 导致「始终满足」狂触发 */
        const threshold = Math.min(
          LOGICAL_PREFETCH_EDGE,
          Math.max(48, Math.floor(n * 0.35)),
        );
        let logicalNeed = Boolean(lr && lr.from <= threshold);
        let timeNeed = false;
        let fromSec: number | null = null;
        if (tr) {
          fromSec = horzTimeToUnixSec(tr.from as Time);
          if (fromSec != null) {
            timeNeed = fromSec <= oldestSec + barSec * 120;
          }
        }
        const need = logicalNeed || timeNeed;
        klineDebugLog("client", "prefetch.eval", {
          symbol: symbolRefForLog.current,
          source: sourceRefForLog.current,
          interval: intervalRef.current,
          n,
          threshold,
          logicalNeed,
          lrFrom: lr?.from,
          lrTo: lr?.to,
          timeNeed,
          visibleFromSec: fromSec,
          visibleFromIso:
            fromSec != null
              ? new Date(fromSec * 1000).toISOString()
              : null,
          oldestSec,
          oldestIso: new Date(oldestSec * 1000).toISOString(),
          timeBandSec: barSec * 120,
          need,
        });
        if (!need) return;
        klineDebugLog("client", "prefetch.fire_loadMore", {});
        loadMoreHistoryRef.current();
      }, 150);
    };

    const visibleTimeRangeHandler = (
      tr: { from: Time; to: Time } | null,
    ) => {
      schedulePrefetchOlderBars();
      setOverlaySize((s) => ({ ...s }));
      setOverlayLayoutTick((t) => t + 1);
      if (!tr) return;
      const fromSec = horzTimeToUnixSec(tr.from);
      const toSec = horzTimeToUnixSec(tr.to);
      if (fromSec == null || toSec == null) return;
      onVisibleTimeRangeChangeRef.current?.(fromSec, toSec);
      if (
        !pageSyncEnabledRef.current ||
        suppressVisibleRangeBroadcastRef.current
      ) {
        return;
      }
      onLocalVisibleTimeRangeRef.current?.(fromSec, toSec);
    };
    const logicalRangeHandler = () => {
      schedulePrefetchOlderBars();
      setOverlayLayoutTick((t) => t + 1);
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(visibleTimeRangeHandler);
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);
    queueMicrotask(() => schedulePrefetchOlderBars());

    return () => {
      if (prefetchOlderTimer != null) window.clearTimeout(prefetchOlderTimer);
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
        overlayLines: { boll: [], ma: [] },
        subPaneSeries: [],
      };
    };
  }, [
    loading,
    symbol,
    source,
    overlayStructKey,
    subParams,
    subPane1.visible,
    subPane1.content,
    subPane2.visible,
    subPane2.content,
    interval,
    schedulePaneLayoutMetrics,
    ttmPeLine,
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
    if (!vr) return;
    const vf = horzTimeToUnixSec(vr.from);
    const vt = horzTimeToUnixSec(vr.to);
    if (vf == null || vt == null) return;
    const wire = rangeStatsEnabled
      ? serializeRangeEntriesToWire(
          rangeEntriesRef.current,
          candlesRef.current,
        )
      : [];
    onPageSyncLeaderSnapshot?.({
      interval: intervalRef.current,
      visible: { from: vf, to: vt },
      rangeStats: wire,
    });
  }, [
    pageSyncLeadNonce,
    pageSyncEnabled,
    loading,
    onPageSyncLeaderSnapshot,
    rangeStatsEnabled,
  ]);

  /** 区间统计变化 → 跨标签广播（防抖，避免拖边时刷屏） */
  useEffect(() => {
    if (!pageSyncEnabled) return;
    if (!onRangeSpecsBroadcastRef.current) return;
    if (!rangeStatsEnabled) {
      if (rangeBroadcastTimerRef.current !== null) {
        clearTimeout(rangeBroadcastTimerRef.current);
        rangeBroadcastTimerRef.current = null;
      }
      onRangeSpecsBroadcastRef.current([]);
      return;
    }
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
  }, [rangeEntries, pageSyncEnabled, rangeStatsEnabled]);

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
          // 跨频率对齐：取「起始时间 ≤ 目标」的最后一根（即目标所在周期的起点柱，
          // 日频 3-18 → 周频对应周一、月频对应当月首柱）；若目标早于全部柱则退化到第一根。
          const idx = floorBarIndexForTime(
            cList.map((c) => c.time as number),
            remoteCrosshairTime,
          );
          bar = cList[idx] ?? cList[0]!;
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
    if (!rangeStatsEnabled) return;
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
    rangeStatsEnabled,
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
    { id: "ttmpe", label: "TTM PE" },
  ];

  if (!symbol.trim()) {
    return (
      <div
        className={
          fillHeight
            ? "flex min-h-[50dvh] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-fs-border bg-fs-elevated px-6 text-center"
            : "flex h-[560px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-fs-border bg-fs-elevated px-6 text-center"
        }
      >
        <p className="text-sm text-fs-muted">尚未选择标的</p>
        <p className="max-w-md text-xs leading-relaxed text-fs-secondary">
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
            ? "flex min-h-[50dvh] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-rose-900/50 bg-fs-bg px-6 py-8 text-center"
            : "flex h-[560px] flex-col items-center justify-center gap-3 rounded-lg border border-rose-900/50 bg-fs-bg px-6 py-8 text-center"
        }
      >
        <p className="text-sm font-medium text-rose-200">行情接口失败</p>
        <p className="max-w-lg whitespace-pre-wrap font-mono text-xs leading-relaxed text-rose-100/90">
          {klineError}
        </p>
        <p className="max-w-lg text-left text-[11px] leading-relaxed text-fs-muted">
          行情来自 Yahoo Finance（美股，免密钥）；日/周线由服务端按拆股事件与现金分红精确复权，可能因代码无效或网络波动失败。
        </p>
      </div>
    );
  }

  if (loading || !payload) {
    return (
      <div
        className={
          fillHeight
            ? "flex min-h-[50dvh] flex-1 items-center justify-center text-sm text-fs-muted"
            : "flex h-[560px] items-center justify-center text-sm text-fs-muted"
        }
      >
        正在加载行情…
      </div>
    );
  }

  const overlaySummary = [
    indicators.maOn ? `MA(${indicators.maPeriods.join("/")})` : null,
    indicators.bollOn
      ? `BOLL(${indicators.boll.period},${indicators.boll.mult})`
      : null,
  ].filter(Boolean);

  const chartToolbar = (
    <>
      <div ref={overlayMenuRef} className="relative flex items-center">
        <button
          type="button"
          onClick={() => setOverlayMenuOpen((o) => !o)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] ${
            overlayMenuOpen
              ? "bg-fs-border text-fs-text"
              : "bg-fs-elevated text-fs-secondary hover:bg-fs-border"
          }`}
          aria-expanded={overlayMenuOpen}
          aria-haspopup="menu"
          title="设置主图叠加（MA / BOLL 可同时显示）与各指标参数"
        >
          <span className="text-fs-muted">指标</span>
          <span
            className={
              overlaySummary.length
                ? "font-medium text-fs-accent-text/95"
                : "text-fs-muted"
            }
          >
            {overlaySummary.length ? overlaySummary.join(" · ") : "无叠加"}
          </span>
          <span className="text-[10px] text-fs-muted" aria-hidden>
            ▾
          </span>
        </button>
        {overlayMenuOpen ? (
          <div
            role="menu"
            className="absolute left-0 top-[calc(100%+6px)] z-[100] w-[19rem] rounded-md border border-fs-border bg-fs-bg p-3 shadow-xl"
          >
            <div className="mb-1 text-[11px] font-medium text-fs-secondary">
              主图叠加（可同时显示）
            </div>
            <label className="flex items-center gap-2 py-1 text-[11px] text-fs-text">
              <input
                type="checkbox"
                checked={indicators.maOn}
                onChange={(e) => patchIndicators({ maOn: e.target.checked })}
              />
              <span className="w-9 shrink-0">MA</span>
              <input
                type="text"
                value={maPeriodsInput}
                onChange={(e) => setMaPeriodsInput(e.target.value)}
                onBlur={commitMaPeriods}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitMaPeriods();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="5, 10, 20"
                title="均线周期，逗号分隔（最多 6 条）"
                className="flex-1 rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-fs-text outline-none focus:border-fs-accent/70"
              />
            </label>
            <div className="flex items-center gap-2 py-1 text-[11px] text-fs-text">
              <input
                type="checkbox"
                checked={indicators.bollOn}
                onChange={(e) => patchIndicators({ bollOn: e.target.checked })}
              />
              <span className="w-9 shrink-0">BOLL</span>
              <IndicatorNumField
                label="周期"
                value={indicators.boll.period}
                min={2}
                max={250}
                onCommit={(n) =>
                  patchIndicators({
                    boll: { ...indicators.boll, period: n },
                  })
                }
              />
              <IndicatorNumField
                label="倍数"
                value={indicators.boll.mult}
                min={0.1}
                max={10}
                step={0.1}
                onCommit={(n) =>
                  patchIndicators({ boll: { ...indicators.boll, mult: n } })
                }
              />
            </div>

            <div className="mb-1 mt-2 border-t border-fs-border pt-2 text-[11px] font-medium text-fs-secondary">
              副图参数
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
              <span className="w-9 shrink-0 text-[11px] text-fs-text">KDJ</span>
              <IndicatorNumField
                label="N"
                value={indicators.kdj.n}
                min={1}
                max={250}
                onCommit={(n) =>
                  patchIndicators({ kdj: { ...indicators.kdj, n } })
                }
              />
              <IndicatorNumField
                label="M1"
                value={indicators.kdj.m1}
                min={1}
                max={50}
                onCommit={(n) =>
                  patchIndicators({ kdj: { ...indicators.kdj, m1: n } })
                }
              />
              <IndicatorNumField
                label="M2"
                value={indicators.kdj.m2}
                min={1}
                max={50}
                onCommit={(n) =>
                  patchIndicators({ kdj: { ...indicators.kdj, m2: n } })
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
              <span className="w-9 shrink-0 text-[11px] text-fs-text">MACD</span>
              <IndicatorNumField
                label="快"
                value={indicators.macd.fast}
                min={1}
                max={200}
                onCommit={(n) =>
                  patchIndicators({ macd: { ...indicators.macd, fast: n } })
                }
              />
              <IndicatorNumField
                label="慢"
                value={indicators.macd.slow}
                min={2}
                max={400}
                onCommit={(n) =>
                  patchIndicators({ macd: { ...indicators.macd, slow: n } })
                }
              />
              <IndicatorNumField
                label="信号"
                value={indicators.macd.signal}
                min={1}
                max={100}
                onCommit={(n) =>
                  patchIndicators({
                    macd: { ...indicators.macd, signal: n },
                  })
                }
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
              <span className="w-9 shrink-0 text-[11px] text-fs-text">RSI</span>
              <IndicatorNumField
                label="周期"
                value={indicators.rsi.period}
                min={2}
                max={250}
                onCommit={(n) => patchIndicators({ rsi: { period: n } })}
              />
            </div>

            <div className="mt-2 flex justify-end border-t border-fs-border pt-2">
              <button
                type="button"
                onClick={() =>
                  setIndicators({ ...DEFAULT_INDICATOR_SETTINGS })
                }
                className="rounded px-2 py-0.5 text-[11px] text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
              >
                恢复默认
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setRangeStatsEnabled((v) => !v)}
        aria-pressed={rangeStatsEnabled}
        title={
          rangeStatsEnabled
            ? "关闭区间统计并隐藏面板。开启时：不按 Shift 左键拖拽可左右平移查看更早 K 线；按住 Shift 在主图拖拽划定区间"
            : "开启后在十字模式下：不按 Shift 左键拖拽平移；按住 Shift 拖拽划定区间统计"
        }
        className={`rounded px-2 py-1 text-[11px] transition-colors ${
          rangeStatsEnabled
            ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30 hover:bg-fs-accent-soft"
            : "bg-fs-elevated text-fs-muted hover:bg-fs-border hover:text-fs-text"
        }`}
      >
        区间统计
      </button>
      <div ref={drawToolMenuRef} className="relative flex items-center">
        <button
          type="button"
          onClick={() => setDrawToolMenuOpen((o) => !o)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] ${
            drawToolMenuOpen
              ? "bg-fs-border text-fs-text"
              : "bg-fs-elevated text-fs-secondary hover:bg-fs-border"
          }`}
          aria-expanded={drawToolMenuOpen}
          aria-haspopup="menu"
        >
          <span className="text-fs-muted">画图工具</span>
          <span
            className={
              tool === "cursor"
                ? "text-fs-muted"
                : "font-medium text-fs-accent-text/95"
            }
          >
            {tools.find((x) => x.id === tool)?.label ?? "十字"}
          </span>
          <span className="text-[10px] text-fs-muted" aria-hidden>
            ▾
          </span>
        </button>
        {drawToolMenuOpen ? (
          <div
            role="menu"
            className="absolute left-0 top-[calc(100%+6px)] z-[100] min-w-[11rem] rounded-md border border-fs-border bg-fs-bg py-1 shadow-xl"
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
                className={`flex w-full px-3 py-1.5 text-left text-[11px] hover:bg-fs-elevated ${
                  tool === x.id
                    ? "bg-fs-accent-soft text-fs-accent-text"
                    : "text-fs-secondary"
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
        消除所有画线
      </button>
      {selectedDrawingId ? (
        <span
          className="text-[11px] text-fs-muted"
          title="按 Delete 或 Backspace 删除"
        >
          已选中 · Delete 删除
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-fs-border bg-fs-bg ${fillHeight ? "h-full min-h-0 flex-1" : ""}`}
    >
      {toolbarPortalEl ? (
        createPortal(chartToolbar, toolbarPortalEl)
      ) : (
        <div className="flex w-full flex-wrap items-center gap-2 border-b border-fs-border px-2 py-1.5">
          {chartToolbar}
        </div>
      )}

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
            className={`pointer-events-auto absolute left-0 right-0 z-[25] flex flex-wrap items-center gap-1 border-b border-fs-border bg-white/95 px-2 backdrop-blur-[2px] ${subPane1.visible ? "" : "opacity-90"}`}
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
                    : "bg-fs-elevated text-fs-muted hover:bg-fs-border"
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
                  ? "border border-fs-border text-fs-muted hover:bg-fs-elevated"
                  : "bg-fs-accent-soft text-fs-accent-text hover:bg-fs-accent-soft"
              }`}
            >
              {subPane1.visible ? "隐藏" : "显示"}
            </button>
            {subPane1.content === "ttmpe" && ttmPeError ? (
              <span className="truncate text-[10px] text-amber-300/90" title={ttmPeError}>
                {ttmPeError}
              </span>
            ) : null}
          </div>
        ) : null}
        {subPaneToolbarGeom.slot2 ? (
          <div
            className={`pointer-events-auto absolute left-0 right-0 z-[26] flex flex-col overflow-hidden border-b border-fs-border bg-white/95 backdrop-blur-[2px] ${subPane2.visible ? "" : "opacity-90"}`}
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
                      : "bg-fs-elevated text-fs-muted hover:bg-fs-border"
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
                    ? "border border-fs-border text-fs-muted hover:bg-fs-elevated"
                    : "bg-fs-accent-soft text-fs-accent-text hover:bg-fs-accent-soft"
                }`}
              >
                {subPane2.visible ? "隐藏" : "显示"}
              </button>
              {subPane2.content === "ttmpe" && ttmPeError ? (
                <span
                  className="truncate text-[10px] text-amber-300/90"
                  title={ttmPeError}
                >
                  {ttmPeError}
                </span>
              ) : null}
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
            visibleExtrema={visibleExtremaOverlay}
          />
        </div>
        {crosshairOhlcv && overlaySize.w > 0 ? (
          <div
            className={`pointer-events-none absolute top-2 z-[20] w-[min(92vw,220px)] rounded border border-fs-border bg-white/95 px-2.5 py-2 text-[11px] leading-snug text-fs-text shadow-lg backdrop-blur-sm ${
              crosshairOhlcv.cursorX < overlaySize.w / 2
                ? "right-2"
                : "left-2"
            }`}
          >
            <div className="mb-1.5 border-b border-fs-border pb-1 text-center font-mono text-fs-text">
              {crosshairOhlcv.timeLabel}
            </div>
            {(() => {
              const ch = crosshairOhlcv;
              const delta = ch.close - ch.open;
              const pct =
                ch.open !== 0 ? (delta / ch.open) * 100 : 0;
              const upA = delta >= 0;
              const dCls = upA ? "text-rose-400" : "text-fs-accent-text";
              return (
                <div className="grid grid-cols-[2.5rem_1fr] gap-x-2 gap-y-0.5 text-fs-text">
                  <span className="text-fs-muted">开盘</span>
                  <span className="text-right font-mono text-fs-text">
                    {fmtPriceCompact(ch.open)}
                  </span>
                  <span className="text-fs-muted">最高</span>
                  <span className="text-right font-mono text-rose-300">
                    {fmtPriceCompact(ch.high)}
                  </span>
                  <span className="text-fs-muted">最低</span>
                  <span className="text-right font-mono text-fs-accent-text">
                    {fmtPriceCompact(ch.low)}
                  </span>
                  <span className="text-fs-muted">收盘</span>
                  <span className={`text-right font-mono ${dCls}`}>
                    {fmtPriceCompact(ch.close)}
                  </span>
                  <span className="text-fs-muted">涨跌额</span>
                  <span className={`text-right font-mono ${dCls}`}>
                    {ch.open !== 0
                      ? `${delta >= 0 ? "+" : ""}${fmtPriceCompact(delta)}`
                      : "—"}
                  </span>
                  <span className="text-fs-muted">涨跌幅</span>
                  <span className={`text-right font-mono ${dCls}`}>
                    {ch.open !== 0
                      ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`
                      : "—"}
                  </span>
                  <span className="text-fs-muted">成交量</span>
                  <span className="text-right font-mono text-amber-200/95">
                    {fmtVolumeZh(ch.volume)}
                  </span>
                </div>
              );
            })()}
          </div>
        ) : null}
        {tool === "cursor" &&
        rangeStatsEnabled &&
        rangeEntries.length > 0
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
                    aria-orientation="horizontal"
                    aria-valuemin={0}
                    aria-valuemax={Math.max(0, candles.length - 1)}
                    aria-valuenow={r.i0}
                    title="拖动调整区间起点"
                    className="pointer-events-auto absolute top-0 bottom-0 z-[19] w-2.5 -translate-x-1/2 cursor-ew-resize touch-none hover:bg-white/10"
                    style={{ left: px.left }}
                    onPointerDown={attachRangeEdgeDrag(r.id, "left")}
                  />
                  <div
                    role="slider"
                    aria-label={`区间${idx + 1}终点`}
                    aria-orientation="horizontal"
                    aria-valuemin={0}
                    aria-valuemax={Math.max(0, candles.length - 1)}
                    aria-valuenow={r.i1}
                    title="拖动调整区间终点"
                    className="pointer-events-auto absolute top-0 bottom-0 z-[19] w-2.5 -translate-x-1/2 cursor-ew-resize touch-none hover:bg-white/10"
                    style={{ left: px.left + px.width }}
                    onPointerDown={attachRangeEdgeDrag(r.id, "right")}
                  />
                </div>
              );
            })
          : null}
        {tool === "cursor" && rangeStatsEnabled && rangeDragPx ? (
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
            className="pointer-events-auto absolute left-0 right-0 z-[18] h-3 -translate-y-1/2 cursor-ns-resize touch-none border-l-4 border-fs-accent/55 hover:bg-fs-border/60"
            style={{ top: splitterY.sep01 }}
            onPointerDown={attachPaneSplitterDrag("01")}
          />
        ) : null}
      </div>

      {rangeStatsEnabled
        ? rangeEntries.map((r, idx) => (
            <KlineRangeStatsPanel
              key={r.id}
              stats={r.stats}
              title={rangePanelTitle(idx)}
              accentColor={r.color}
              stackOffsetPx={idx * 28}
              onClose={() => removeRangeEntry(r.id)}
            />
          ))
        : null}

      <ChartTimeRangeBrush chart={chartApi} candles={candles} />
    </div>
  );
}
