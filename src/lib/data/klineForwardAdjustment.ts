import type { CandlestickData } from "lightweight-charts";
import {
  detectSplitLikeActions,
  postSplitCap,
  type SplitLikeAction,
} from "@/lib/data/klineSplitDetect";

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

/**
 * 前复权：仅把除权日之前的「拆前刻度」柱压到与除权后一致的尺度；
 * 除权日前已是拆后价（如 IB 6/16≈52）的柱不再除 ratio，避免压成 ~13 并在 6/18 拉出竖跳。
 */
function forwardMultipliers(
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
    const scale = 1 / ratio;
    for (let j = 0; j < barIndex; j++) {
      if (candles[j]!.close > cap) {
        mult[j]! *= scale;
      }
    }
  }
  return mult;
}

function normalizeForwardExDateBar(
  cndl: CandlestickData,
  prevClose: number,
  ratio: number,
): CandlestickData {
  const inv = 1 / ratio;
  const { close } = cndl;
  if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(prevClose) || prevClose <= 0) {
    return { ...cndl };
  }

  const postRef = close;
  const preSplitFloor = prevClose * 0.88;

  const fixLeg = (v: number): number => {
    if (!Number.isFinite(v)) return v;
    if (v > postRef * 1.28 && v > preSplitFloor) return v * inv;
    return v;
  };

  let open = fixLeg(cndl.open);
  let high = fixLeg(cndl.high);
  let low = fixLeg(cndl.low);

  high = Math.max(high, open, close);
  low = Math.min(low, open, close);

  return { time: cndl.time, open, high, low, close };
}

function applyForwardExDateBarFixes(
  candles: CandlestickData[],
  actions: SplitLikeAction[],
): CandlestickData[] {
  if (!actions.length) return candles;
  const out = candles.map((c) => ({ ...c }));
  for (const { barIndex, ratio } of actions) {
    if (barIndex < 1 || barIndex >= out.length) continue;
    const prevClose = out[barIndex - 1]!.close;
    out[barIndex] = normalizeForwardExDateBar(
      out[barIndex]!,
      prevClose,
      ratio,
    );
  }
  return out;
}

/** 前复权（独立实现，不共享后复权/不复权逻辑） */
export function applyForwardAdjustment(
  candles: CandlestickData[],
  actions?: SplitLikeAction[],
): CandlestickData[] {
  if (candles.length === 0) return [];
  const acts = actions ?? detectSplitLikeActions(candles);
  if (!acts.length) return candles.map((c) => ({ ...c }));

  const mult = forwardMultipliers(candles, acts);
  let out = scaleOhlc(candles, mult);
  out = applyForwardExDateBarFixes(out, acts);
  return out;
}
