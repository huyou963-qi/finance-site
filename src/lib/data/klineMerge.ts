import type { CandlestickData } from "lightweight-charts";
import { analyzeMergeBoundary } from "@/lib/data/klineDebug";
import { KLINE_PAGE_SIZE } from "./klineShared";
import type { KlinePayload } from "./types";

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
  const overlapPrefer: MergeOverlapPrefer = "newer";
  const olderCandles = olderChunk.candles;

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
