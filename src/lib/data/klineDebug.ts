import type { CandlestickData } from "lightweight-charts";
import { barMsForInterval, isKlineInterval, type KlineInterval } from "@/lib/data/klineShared";
import type { KlinePayload } from "@/lib/data/types";

/**
 * K 线调查日志（控制台过滤 `[KLINE-DEBUG]`）。
 *
 * 开启方式（任一即可）：
 * - `npm run dev`（NODE_ENV=development）
 * - 服务端 `.env.local`：`KLINE_DEBUG=1`
 * - 浏览器控制台：`localStorage.setItem('KLINE_DEBUG','1')` 后刷新
 *
 * 调查「显示不对」时建议顺序：
 * 1. `initial_load` / `api.response`：首屏条数、时间范围、最大 close 跳变%、无效 OHLC
 * 2. `prefetch.eval` + `loadMore.fetch`：是否触发、before 是否等于当前最早柱
 * 3. `ibkr.cpResolveTrsrvFutures` / `cpFetchHistory` / `cpResolveContract`：在 **Next 终端**；失败时 API 502 带 `klineDebugTrace` → 浏览器 `client.initial_load.server_trace`
 * 4. `merge.boundary`：拼接缝 gap（交易日间隔）、重叠去重、是否 no_growth
 * 5. `chart.setData`：写入图表前全序列摘要（左拖后重点看 largestCloseJump）
 * 6. `client.adjustment` / `adjustment.passthrough`：复权对比；不复权仅 passthrough，无拆股检测
 *
 * 若 `largestCloseJumpPct` 很大且发生在多年间隔 → 多为未复权拆股（非 merge bug）。
 */
export function isKlineDebugEnabled(): boolean {
  if (process.env.KLINE_DEBUG === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window !== "undefined") {
    try {
      if (localStorage.getItem("KLINE_DEBUG") === "1") return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export type KlineDebugEntry = {
  scope: "client" | "api" | "ibkr" | "merge";
  phase: string;
  payload: Record<string, unknown>;
  at: string;
};

const SERVER_DEBUG_MAX = 40;
const serverDebugRing: KlineDebugEntry[] = [];

/** 服务端 IBKR 拉数前清空，便于单次请求关联日志 */
export function clearKlineServerDebugRing(): void {
  if (typeof window !== "undefined") return;
  serverDebugRing.length = 0;
}

export function drainKlineServerDebugRing(): KlineDebugEntry[] {
  return [...serverDebugRing];
}

export function klineDebugLog(
  scope: "client" | "api" | "ibkr" | "merge",
  phase: string,
  payload: Record<string, unknown>,
): void {
  if (!isKlineDebugEnabled()) return;
  const entry: KlineDebugEntry = {
    scope,
    phase,
    payload,
    at: new Date().toISOString(),
  };
  if (typeof window === "undefined") {
    serverDebugRing.push(entry);
    if (serverDebugRing.length > SERVER_DEBUG_MAX) {
      serverDebugRing.splice(0, serverDebugRing.length - SERVER_DEBUG_MAX);
    }
  }
  console.log(`[KLINE-DEBUG] ${scope}.${phase}`, payload);
}

function iso(sec: number): string {
  return new Date(sec * 1000).toISOString();
}

function barStepSec(interval: string): number {
  const iv: KlineInterval = isKlineInterval(interval) ? interval : "1d";
  return barMsForInterval(iv) / 1000;
}

export type CandleSeriesReport = {
  barCount: number;
  firstSec: number | null;
  lastSec: number | null;
  firstIso: string | null;
  lastIso: string | null;
  duplicateTimeCount: number;
  gapCount: number;
  /** 相邻柱 close 相对变化最大幅度（%），用于发现拆股/拼接缝 */
  largestCloseJumpPct: number | null;
  largestJumpAtSec: number | null;
  invalidOhlcCount: number;
  notAscending: boolean;
};

export function summarizeCandleSeries(
  candles: CandlestickData[],
  interval: string,
): CandleSeriesReport {
  const empty: CandleSeriesReport = {
    barCount: 0,
    firstSec: null,
    lastSec: null,
    firstIso: null,
    lastIso: null,
    duplicateTimeCount: 0,
    gapCount: 0,
    largestCloseJumpPct: null,
    largestJumpAtSec: null,
    invalidOhlcCount: 0,
    notAscending: false,
  };
  if (!candles.length) return empty;

  const step = barStepSec(interval);
  const times = candles.map((c) => c.time as number);
  const seen = new Set<number>();
  let duplicateTimeCount = 0;
  for (const t of times) {
    if (seen.has(t)) duplicateTimeCount++;
    else seen.add(t);
  }

  let notAscending = false;
  for (let i = 1; i < times.length; i++) {
    if (times[i]! < times[i - 1]!) notAscending = true;
  }

  let gapCount = 0;
  const gapThreshold = step * 1.55;
  for (let i = 1; i < times.length; i++) {
    const d = times[i]! - times[i - 1]!;
    if (d > gapThreshold) gapCount++;
  }

  let largestCloseJumpPct: number | null = null;
  let largestJumpAtSec: number | null = null;
  let invalidOhlcCount = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const { open, high, low, close } = c;
    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      high < Math.max(open, close) - 1e-9 ||
      low > Math.min(open, close) + 1e-9 ||
      high < low - 1e-9
    ) {
      invalidOhlcCount++;
    }
    if (i > 0) {
      const prevClose = candles[i - 1]!.close;
      if (prevClose > 0 && Number.isFinite(prevClose)) {
        const pct = (Math.abs(close - prevClose) / prevClose) * 100;
        if (largestCloseJumpPct == null || pct > largestCloseJumpPct) {
          largestCloseJumpPct = pct;
          largestJumpAtSec = c.time as number;
        }
      }
    }
  }

  const firstSec = times[0]!;
  const lastSec = times[times.length - 1]!;
  return {
    barCount: candles.length,
    firstSec,
    lastSec,
    firstIso: iso(firstSec),
    lastIso: iso(lastSec),
    duplicateTimeCount,
    gapCount,
    largestCloseJumpPct,
    largestJumpAtSec,
    invalidOhlcCount,
    notAscending,
  };
}

export function logCandleSeriesReport(
  scope: "client" | "api" | "ibkr" | "merge",
  phase: string,
  candles: CandlestickData[],
  interval: string,
  extra?: Record<string, unknown>,
): CandleSeriesReport {
  const report = summarizeCandleSeries(candles, interval);
  const jumpIso =
    report.largestJumpAtSec != null ? iso(report.largestJumpAtSec) : null;
  klineDebugLog(scope, phase, {
    interval,
    ...report,
    largestJumpAtIso: jumpIso,
    ...extra,
  });
  return report;
}

export type MergeBoundaryReport = {
  prevBars: number;
  chunkBars: number;
  mergedBars: number;
  addedBars: number;
  prevOldestSec: number;
  prevOldestIso: string;
  chunkNewestSec: number;
  chunkNewestIso: string;
  chunkOldestSec: number;
  chunkOldestIso: string;
  /** 拼接缝：prev 最早柱 − chunk 最晚柱（秒）；日线理想约 86400 */
  joinGapSec: number | null;
  joinGapInBars: number | null;
  overlapTimes: number;
  chunkTimesNotBeforeCut: number;
  cutSec: number | null;
};

export function analyzeMergeBoundary(
  prev: KlinePayload,
  chunk: KlinePayload,
  merged: KlinePayload,
  interval: string,
  beforeSec?: number,
): MergeBoundaryReport {
  const step = barStepSec(interval);
  const prevOldest = prev.candles[0]!.time as number;
  const chunkNewest =
    chunk.candles.length > 0
      ? (chunk.candles[chunk.candles.length - 1]!.time as number)
      : null;
  const chunkOldest =
    chunk.candles.length > 0 ? (chunk.candles[0]!.time as number) : null;

  let overlapTimes = 0;
  const prevTimes = new Set(prev.candles.map((c) => c.time as number));
  for (const c of chunk.candles) {
    if (prevTimes.has(c.time as number)) overlapTimes++;
  }

  let chunkTimesNotBeforeCut = 0;
  if (beforeSec != null) {
    for (const c of chunk.candles) {
      if ((c.time as number) >= beforeSec) chunkTimesNotBeforeCut++;
    }
  }

  const joinGapSec =
    chunkNewest != null ? prevOldest - chunkNewest : null;
  const joinGapInBars =
    joinGapSec != null && step > 0 ? joinGapSec / step : null;

  const report: MergeBoundaryReport = {
    prevBars: prev.candles.length,
    chunkBars: chunk.candles.length,
    mergedBars: merged.candles.length,
    addedBars: merged.candles.length - prev.candles.length,
    prevOldestSec: prevOldest,
    prevOldestIso: iso(prevOldest),
    chunkNewestSec: chunkNewest ?? 0,
    chunkNewestIso: chunkNewest != null ? iso(chunkNewest) : "—",
    chunkOldestSec: chunkOldest ?? 0,
    chunkOldestIso: chunkOldest != null ? iso(chunkOldest) : "—",
    joinGapSec,
    joinGapInBars,
    overlapTimes,
    chunkTimesNotBeforeCut,
    cutSec: beforeSec ?? null,
  };

  const severeGap = joinGapInBars != null && joinGapInBars > 6;
  klineDebugLog("merge", "boundary", {
    interval,
    ...report,
    cutIso: beforeSec != null ? iso(beforeSec) : null,
    severity: severeGap ? "error" : joinGapInBars != null && joinGapInBars > 3 ? "warn" : "ok",
    hint: severeGap
      ? "拼接缝过大（常见原因：IB 分页 startTime 窗口未贴住 cut，图上会出现竖跳）；请查看 ibkr.cpFetchHistory 的 joinGapToCutBars"
      : joinGapInBars != null && joinGapInBars > 3
        ? "拼接缝略大：检查是否节假日/漏交易日"
        : overlapTimes > 0
          ? "chunk 与 prev 有重叠时间（合并会去重，属预期）"
          : undefined,
  });

  return report;
}

export type AdjustmentBarSnapshot = {
  index: number;
  timeSec: number;
  timeIso: string;
  open: number;
  high: number;
  low: number;
  close: number;
  hiLoRatio: number;
};

export function snapshotAdjustmentBar(
  candles: CandlestickData[],
  index: number,
): AdjustmentBarSnapshot | null {
  const c = candles[index];
  if (!c) return null;
  const t = c.time as number;
  const lo = Math.min(c.open, c.high, c.low, c.close);
  const hi = Math.max(c.open, c.high, c.low, c.close);
  return {
    index,
    timeSec: t,
    timeIso: iso(t),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    hiLoRatio: lo > 0 ? hi / lo : NaN,
  };
}

/** 复权调查：对比除权窗 raw / 复权后 OHLC（控制台过滤 `[KLINE-DEBUG] client.adjustment`） */
export function logPriceAdjustmentReport(args: {
  mode: string;
  symbol?: string;
  interval?: string;
  barCount: number;
  actions: Array<{ barIndex: number; ratio: number; anchorClose?: number }>;
  rawWindow: AdjustmentBarSnapshot[];
  adjWindow: AdjustmentBarSnapshot[];
  backwardFixFlags?: Array<{
    index: number;
    needsTransitionFix: boolean;
    postSplitCap?: number;
  }>;
}): void {
  klineDebugLog("client", "adjustment", {
    hint:
      "后复权尖峰：看 actions.barIndex 是否落在除权日；raw 同柱是否 high≈拆前且 low≈拆后；adj 是否 hiLoRatio>1.1；needsTransitionFix=false 表示未进入过渡柱修复",
    ...args,
  });
}
