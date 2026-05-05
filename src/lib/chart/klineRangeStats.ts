import type { CandlestickData, IChartApi } from "lightweight-charts";

export type KlineRangeStatsResult = {
  startLabel: string;
  endLabel: string;
  count: number;
  maxHigh: number;
  minLow: number;
  firstOpen: number;
  lastClose: number;
  /** (lastClose - firstOpen) / firstOpen * 100 */
  changePct: number;
  /** (maxHigh - minLow) / minLow * 100 */
  amplitudePct: number;
  upBars: number;
  downBars: number;
  flatBars: number;
  totalVolume: number;
};

function formatStatTime(t: CandlestickData["time"], intervalRaw: string): string {
  const tt = t;
  if (typeof tt !== "number") return String(tt);
  const d = new Date(tt * 1000);
  if (intervalRaw === "15m" || intervalRaw === "1h" || intervalRaw === "4h") {
    return d.toLocaleString("zh-CN", { hour12: false });
  }
  return d.toLocaleDateString("zh-CN");
}

/**
 * 统计闭区间 [i0, i1] 内 K 线（含端点）。
 */
/** 用于主图上的半透明选区（坐标相对 chart 容器左缘，与 timeToCoordinate 一致） */
export function computeRangeOverlayPx(
  chart: IChartApi,
  candles: CandlestickData[],
  i0: number,
  i1: number,
): { left: number; width: number } | null {
  if (!candles.length || i0 < 0 || i1 < 0 || i0 > i1 || i1 >= candles.length) {
    return null;
  }
  const t0 = candles[i0].time;
  const t1 = candles[i1].time;
  const x0 = chart.timeScale().timeToCoordinate(t0);
  const x1 = chart.timeScale().timeToCoordinate(t1);
  if (x0 === null || x1 === null) return null;
  let half = 6;
  if (i0 + 1 < candles.length) {
    const xn = chart.timeScale().timeToCoordinate(candles[i0 + 1].time);
    if (xn !== null) half = Math.abs(xn - x0) / 2;
  }
  const left = Math.min(x0, x1) - half;
  const right = Math.max(x0, x1) + half;
  return { left, width: Math.max(4, right - left) };
}

export function computeKlineRangeStats(
  candles: CandlestickData[],
  volumes: number[],
  i0: number,
  i1: number,
  interval: string,
): KlineRangeStatsResult | null {
  const n = candles.length;
  if (!n || i0 < 0 || i1 < 0 || i0 > i1 || i1 >= n) return null;
  const slice = candles.slice(i0, i1 + 1);
  const volSlice =
    volumes.length === candles.length
      ? volumes.slice(i0, i1 + 1)
      : [];

  let maxHigh = -Infinity;
  let minLow = Infinity;
  let upBars = 0;
  let downBars = 0;
  let flatBars = 0;
  let totalVolume = 0;

  for (let k = 0; k < slice.length; k++) {
    const c = slice[k];
    maxHigh = Math.max(maxHigh, c.high);
    minLow = Math.min(minLow, c.low);
    if (c.close > c.open) upBars++;
    else if (c.close < c.open) downBars++;
    else flatBars++;
    totalVolume += volSlice[k] ?? 0;
  }

  const firstOpen = slice[0].open;
  const lastClose = slice[slice.length - 1].close;
  const changePct =
    firstOpen !== 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;
  const amplitudePct =
    minLow !== 0 ? ((maxHigh - minLow) / minLow) * 100 : 0;

  return {
    startLabel: formatStatTime(slice[0].time, interval),
    endLabel: formatStatTime(slice[slice.length - 1].time, interval),
    count: slice.length,
    maxHigh,
    minLow,
    firstOpen,
    lastClose,
    changePct,
    amplitudePct,
    upBars,
    downBars,
    flatBars,
    totalVolume,
  };
}
