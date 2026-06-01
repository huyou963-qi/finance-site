import type { CandlestickData } from "lightweight-charts";
import { isIbkrContinuousFutChartSymbol } from "@/lib/data/ibkrFutSymbol";
import { analyzeMergeBoundary, klineDebugLog } from "@/lib/data/klineDebug";
import { KLINE_PAGE_SIZE } from "./klineShared";
import type { KlinePayload } from "./types";

export { isIbkrContinuousFutChartSymbol };

function scaleCandles(
  candles: CandlestickData[],
  factor: number,
): CandlestickData[] {
  if (!Number.isFinite(factor) || factor === 1) return candles;
  return candles.map((cndl) => ({
    time: cndl.time,
    open: cndl.open * factor,
    high: cndl.high * factor,
    low: cndl.low * factor,
    close: cndl.close * factor,
  }));
}

/**
 * 连续期货向左翻页：older 段为交割月 FUT，newer 段为首屏 CONTFUT，尺度常不一致。
 * 在拼接前将 older 整段按边界收/收盘比例对齐到 newer 首根柱。
 */
export function alignFuturesOlderSegmentAtBoundary(
  older: CandlestickData[],
  newer: CandlestickData[],
  maxRatioDev = 0.03,
): CandlestickData[] {
  if (!older.length || !newer.length) return older;
  const firstNewerT = newer[0]!.time as number;
  let anchorOlder: CandlestickData | null = null;
  for (const c of older) {
    if ((c.time as number) < firstNewerT) anchorOlder = c;
  }
  if (!anchorOlder || anchorOlder.close <= 0) return older;
  const ratio = newer[0]!.close / anchorOlder.close;
  if (!Number.isFinite(ratio) || ratio <= 0) return older;
  if (Math.abs(ratio - 1) <= maxRatioDev) return older;
  return scaleCandles(older, ratio);
}

export type MergeOverlapPrefer = "older" | "newer";

/** 按 bar.time 合并两段 K 线（用于向左追加更早数据），升序、按时间去重 */
export function mergeCandlesOlderFirst(
  older: CandlestickData[],
  newer: CandlestickData[],
  overlapPrefer: MergeOverlapPrefer = "newer",
): CandlestickData[] {
  const byTime = new Map<number, CandlestickData>();
  if (overlapPrefer === "newer") {
    for (const c of older) byTime.set(c.time as number, c);
    for (const c of newer) byTime.set(c.time as number, c);
  } else {
    for (const c of newer) byTime.set(c.time as number, c);
    for (const c of older) byTime.set(c.time as number, c);
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => c);
}

function mergeVolumesForCandles(
  candles: CandlestickData[],
  olderCandles: CandlestickData[],
  olderVolumes: number[],
  newerCandles: CandlestickData[],
  newerVolumes: number[],
  overlapPrefer: MergeOverlapPrefer,
): number[] | undefined {
  if (
    olderVolumes.length !== olderCandles.length ||
    newerVolumes.length !== newerCandles.length
  ) {
    return undefined;
  }
  const vm = new Map<number, number>();
  if (overlapPrefer === "newer") {
    for (let i = 0; i < olderCandles.length; i++) {
      vm.set(olderCandles[i]!.time as number, olderVolumes[i] ?? 0);
    }
    for (let i = 0; i < newerCandles.length; i++) {
      vm.set(newerCandles[i]!.time as number, newerVolumes[i] ?? 0);
    }
  } else {
    for (let i = 0; i < newerCandles.length; i++) {
      vm.set(newerCandles[i]!.time as number, newerVolumes[i] ?? 0);
    }
    for (let i = 0; i < olderCandles.length; i++) {
      vm.set(olderCandles[i]!.time as number, olderVolumes[i] ?? 0);
    }
  }
  return candles.map((c) => vm.get(c.time as number) ?? 0);
}

export function mergeKlinePayload(
  prev: KlinePayload,
  olderChunk: KlinePayload,
  debug?: { interval: string; beforeSec?: number },
): KlinePayload {
  const contFut = isIbkrContinuousFutChartSymbol(prev.symbol);
  const overlapPrefer: MergeOverlapPrefer = contFut ? "older" : "newer";

  let olderCandles = olderChunk.candles;
  if (contFut) {
    olderCandles = alignFuturesOlderSegmentAtBoundary(olderCandles, prev.candles);
    klineDebugLog("merge", "contfut.align", {
      symbol: prev.symbol,
      overlapPrefer,
      olderBars: olderCandles.length,
      newerBars: prev.candles.length,
    });
  }

  const candles = mergeCandlesOlderFirst(
    olderCandles,
    prev.candles,
    overlapPrefer,
  );

  const volumes = mergeVolumesForCandles(
    candles,
    olderCandles,
    olderChunk.volumes ?? [],
    prev.candles,
    prev.volumes ?? [],
    overlapPrefer,
  );

  const hasMoreOlder =
    olderChunk.candles.length === 0
      ? false
      : olderChunk.hasMoreOlder !== undefined
        ? olderChunk.hasMoreOlder
        : olderChunk.candles.length >= KLINE_PAGE_SIZE;

  const merged: KlinePayload = {
    ...prev,
    candles,
    volumes,
    attribution: prev.attribution,
    hasMoreOlder,
  };

  if (debug) {
    analyzeMergeBoundary(prev, olderChunk, merged, debug.interval, debug.beforeSec);
  }

  return merged;
}
