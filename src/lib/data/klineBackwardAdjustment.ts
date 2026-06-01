import type { CandlestickData } from "lightweight-charts";
import {
  detectSplitLikeActions,
  postSplitCap,
  type SplitLikeAction,
} from "@/lib/data/klineSplitDetect";
import { cumulativeUsSplitFactor } from "@/lib/data/klineUsSplitCalendar";

function scaleOhlc(
  candles: CandlestickData[],
  mult: number[],
): CandlestickData[] {
  return candles.map((cndl, i) => {
    const m = mult[i] ?? 1;
    if (!Number.isFinite(m) || m === 1) return { ...cndl };
    return {
      time: cndl.time,
      open: cndl.open * m,
      high: cndl.high * m,
      low: cndl.low * m,
      close: cndl.close * m,
    };
  });
}

function backwardMultipliers(
  candles: CandlestickData[],
  actions: SplitLikeAction[],
): number[] {
  const n = candles.length;
  const mult = Array<number>(n).fill(1);
  for (const { barIndex, ratio } of actions) {
    if (ratio < 1.35 || !Number.isFinite(ratio)) continue;
    const anchor =
      barIndex >= 1 ? candles[barIndex - 1]!.close : candles[barIndex]!.close;
    const cap = postSplitCap(anchor, ratio);

    // 后复权：除权日及之后全部 ×ratio（含最新柱，目标价≈现价×累积拆股比）
    for (let j = barIndex; j < n; j++) {
      mult[j]! *= ratio;
    }
    for (let j = 0; j < barIndex; j++) {
      if (candles[j]!.close < cap) {
        mult[j]! *= ratio;
      }
    }
  }
  return mult;
}

function barNeedsBackwardTransitionFix(
  cndl: CandlestickData,
  anchor: number,
  ratio: number,
): boolean {
  const cap = postSplitCap(anchor, ratio);
  const legs = [cndl.open, cndl.high, cndl.low, cndl.close];
  const finite = legs.filter((v) => Number.isFinite(v) && v > 0);
  if (finite.length < 2) return false;
  const hi = Math.max(...finite);
  const lo = Math.min(...finite);
  const hasPost = finite.some((v) => v < cap);
  const hasPre = finite.some((v) => v > anchor * 0.82);
  if (!hasPost) return false;
  if (hasPre && hi / lo > 1.22) return true;
  return hasPost && lo < cap && hi > anchor * 0.9;
}

function normalizeBackwardTransitionBar(
  cndl: CandlestickData,
  anchor: number,
  ratio: number,
): CandlestickData {
  if (!Number.isFinite(anchor) || anchor <= 0 || ratio <= 0) return { ...cndl };

  const cap = postSplitCap(anchor, ratio);
  const scaleUp = (v: number): number => {
    if (!Number.isFinite(v) || v <= 0) return v;
    return v < cap ? v * ratio : v;
  };

  let open = scaleUp(cndl.open);
  let high = scaleUp(cndl.high);
  let low = scaleUp(cndl.low);
  let close = scaleUp(cndl.close);

  const hi = Math.max(open, high, low, close);
  const lo = Math.min(open, high, low, close);
  const span = hi / Math.max(lo, 1e-9);
  const rawLegs = [cndl.open, cndl.high, cndl.low, cndl.close];
  const mixedPrePost =
    rawLegs.some((v) => Number.isFinite(v) && v < cap) &&
    rawLegs.some((v) => Number.isFinite(v) && v > anchor * 0.82);

  if (mixedPrePost && span > 1.08) {
    close = scaleUp(cndl.close);
    if (close < anchor * 0.8) close = anchor;
    open = cndl.open >= cap ? cndl.open : scaleUp(cndl.open);
    if (open < anchor * 0.88 || open > anchor * 1.035) open = anchor;
    high = Math.min(Math.max(open, close, anchor * 1.003), anchor * 1.02);
    low = Math.max(Math.min(open, close, anchor * 0.997), anchor * 0.98);
  } else if (lo < anchor * 0.84 && hi > anchor * 0.92 && span > 1.12) {
    close = scaleUp(cndl.close);
    open = scaleUp(cndl.open);
    if (open < anchor * 0.84) open = close;
    if (open > anchor * 1.04) open = anchor;
    high = Math.max(open, close, anchor * 1.008);
    low = Math.min(open, close, anchor * 0.992);
  } else {
    high = Math.max(open, high, low, close);
    low = Math.min(open, high, low, close);
  }

  return { time: cndl.time, open, high, low, close };
}

function applyBackwardSplitZoneFixes(
  original: CandlestickData[],
  out: CandlestickData[],
  actions: SplitLikeAction[],
): CandlestickData[] {
  for (const { barIndex: i, ratio } of actions) {
    if (i < 1 || i >= out.length) continue;
    const anchor = original[i - 1]!.close;
    if (!Number.isFinite(anchor) || anchor <= 0) continue;

    const indices = new Set<number>();
    if (i - 1 >= 0) indices.add(i - 1);
    indices.add(i);
    for (let j = i + 1; j < out.length; j++) indices.add(j);

    for (const j of indices) {
      const raw = original[j]!;
      const cur = out[j]!;
      const probe = j <= i ? raw : cur;
      if (!barNeedsBackwardTransitionFix(probe, anchor, ratio)) continue;
      out[j] = normalizeBackwardTransitionBar(
        j <= i ? raw : cur,
        anchor,
        ratio,
      );
    }
  }
  return out;
}

export type BackwardAdjustmentOpts = {
  symbol?: string;
  /**
   * IB Trades 历史已为前复权（最新≈现价）。后复权应对整段 OHLC × 上市至今累积拆股因子；
   * 仅靠 K 线跳变无法识别前复权序列中的拆股点（TWS/CP 均如此）。
   */
  ibkrForwardAdjusted?: boolean;
};

/** 后复权（独立实现，不共享前复权/不复权逻辑） */
export function applyBackwardAdjustment(
  candles: CandlestickData[],
  actions?: SplitLikeAction[],
  opts?: BackwardAdjustmentOpts,
): CandlestickData[] {
  if (candles.length === 0) return [];

  if (opts?.ibkrForwardAdjusted && opts.symbol) {
    const K = cumulativeUsSplitFactor(opts.symbol);
    if (K != null && K > 1) {
      return scaleOhlc(
        candles,
        candles.map(() => K),
      );
    }
  }

  const acts = actions ?? detectSplitLikeActions(candles);
  if (!acts.length) return candles.map((c) => ({ ...c }));

  const mult = backwardMultipliers(candles, acts);
  let out = scaleOhlc(candles, mult);
  out = applyBackwardSplitZoneFixes(candles, out, acts);
  return out;
}
