import type { CandlestickData } from "lightweight-charts";
import {
  detectSplitLikeActions,
  postSplitCap,
  type SplitLikeAction,
} from "@/lib/data/klineSplitDetect";

/**
 * IB CP `source=Trades` 返回的历史 OHLC 已按拆股向前调整（见 IB 文档），
 * 数月 K 线会在 ~50 而非除权前名义价 ~200。
 * 不复权展示：将拆股日前「拆后刻度」还原为名义价；除权日及之后保持 API 原价。
 */

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

/** 除权日混柱：把仍留在拆前刻度的 O/H/L 压到与收盘一致的拆后名义价 */
function fixIbkrExDateMixedBar(
  cndl: CandlestickData,
  anchor: number,
  ratio: number,
): CandlestickData {
  const cap = postSplitCap(anchor, ratio);
  const inv = 1 / ratio;
  const down = (v: number): number => {
    if (!Number.isFinite(v)) return v;
    return v > cap ? v * inv : v;
  };

  let open = down(cndl.open);
  let high = down(cndl.high);
  const low = cndl.low;
  const close = cndl.close;

  high = Math.max(high, open, close);
  const lowOut = Math.min(low, open, close);

  return { time: cndl.time, open, high, low: lowOut, close };
}

function nominalMultipliers(
  candles: CandlestickData[],
  actions: SplitLikeAction[],
): number[] {
  const n = candles.length;
  const mult = Array<number>(n).fill(1);
  for (const { barIndex: i, ratio } of actions) {
    if (i < 1 || ratio < 1.35 || !Number.isFinite(ratio)) continue;
    const anchor = candles[i - 1]!.close;
    const cap = postSplitCap(anchor, ratio);
    for (let j = 0; j < i; j++) {
      if (candles[j]!.close < cap) {
        mult[j]! *= ratio;
      }
    }
  }
  return mult;
}

export function applyIbkrTradesNominalUnadjusted(
  candles: CandlestickData[],
  actions?: SplitLikeAction[],
): CandlestickData[] {
  if (candles.length === 0) return [];
  const acts = actions ?? detectSplitLikeActions(candles);
  if (!acts.length) return candles.map((c) => ({ ...c }));

  const mult = nominalMultipliers(candles, acts);
  let out = scaleOhlc(candles, mult);

  for (const { barIndex: i, ratio } of acts) {
    if (i < 1 || i >= out.length) continue;
    const anchor = candles[i - 1]!.close;
    if (!Number.isFinite(anchor) || anchor <= 0) continue;
    out[i] = fixIbkrExDateMixedBar(candles[i]!, anchor, ratio);
  }

  return out;
}
