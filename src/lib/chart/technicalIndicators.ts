import type { CandlestickData, LineData, UTCTimestamp } from "lightweight-charts";

type TimeT = LineData["time"];

export function bollinger(
  candles: CandlestickData[],
  period = 20,
  mult = 2,
): { mid: LineData[]; upper: LineData[]; lower: LineData[] } {
  const mid: LineData[] = [];
  const upper: LineData[] = [];
  const lower: LineData[] = [];
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue;
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance =
      slice.reduce((a, x) => a + (x - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const t = candles[i].time as TimeT;
    mid.push({ time: t, value: mean });
    upper.push({ time: t, value: mean + mult * sd });
    lower.push({ time: t, value: mean - mult * sd });
  }
  return { mid, upper, lower };
}

/** 简单算术均线（SMA） */
export function sma(
  candles: CandlestickData[],
  period: number,
): LineData[] {
  const out: LineData[] = [];
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue;
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    out.push({ time: candles[i].time as TimeT, value: mean });
  }
  return out;
}

/**
 * KDJ(n, m1, m2)：n 期 RSV，K 用 m1 平滑，D 用 m2 平滑；J = 3K - 2D。
 * 默认 (9,3,3)：K = 2/3·K_prev + 1/3·RSV（即 m1=3），D 同理 m2=3。
 */
export function kdj(
  candles: CandlestickData[],
  n = 9,
  m1 = 3,
  m2 = 3,
): { k: LineData[]; d: LineData[]; j: LineData[] } {
  const kOut: LineData[] = [];
  const dOut: LineData[] = [];
  const jOut: LineData[] = [];
  let kPrev = 50;
  let dPrev = 50;
  const a1 = m1 > 0 ? 1 / m1 : 1 / 3;
  const a2 = m2 > 0 ? 1 / m2 : 1 / 3;

  for (let i = 0; i < candles.length; i++) {
    const from = Math.max(0, i - n + 1);
    const window = candles.slice(from, i + 1);
    const high9 = Math.max(...window.map((c) => c.high));
    const low9 = Math.min(...window.map((c) => c.low));
    const c = candles[i].close;
    const denom = high9 - low9;
    const rsv = denom === 0 ? 50 : ((c - low9) / denom) * 100;
    const k = (1 - a1) * kPrev + a1 * rsv;
    const d = (1 - a2) * dPrev + a2 * k;
    const j = 3 * k - 2 * d;
    const t = candles[i].time as TimeT;
    kOut.push({ time: t, value: k });
    dOut.push({ time: t, value: d });
    jOut.push({ time: t, value: j });
    kPrev = k;
    dPrev = d;
  }
  return { k: kOut, d: dOut, j: jOut };
}

function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out.push(values[0]);
    } else {
      out.push(values[i] * k + out[i - 1] * (1 - k));
    }
  }
  return out;
}

/** MACD(fast, slow, signal)：DIF = EMA_fast - EMA_slow，DEA = EMA_signal(DIF)，柱 = DIF - DEA */
export function macd(
  candles: CandlestickData[],
  fast = 12,
  slow = 26,
  signal = 9,
): {
  dif: LineData[];
  dea: LineData[];
  hist: { time: UTCTimestamp; value: number; color?: string }[];
} {
  const closes = candles.map((c) => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const difArr: number[] = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const deaArr = ema(difArr, signal);
  const dif: LineData[] = [];
  const dea: LineData[] = [];
  const hist: { time: UTCTimestamp; value: number; color?: string }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time as UTCTimestamp;
    const d = difArr[i];
    const e = deaArr[i];
    const h = d - e;
    dif.push({ time: t as TimeT, value: d });
    dea.push({ time: t as TimeT, value: e });
    hist.push({
      time: t,
      value: h,
      color: h >= 0 ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)",
    });
  }
  return { dif, dea, hist };
}

/** RSI（Wilder 平滑，常用 14） */
export function rsi(candles: CandlestickData[], period = 14): LineData[] {
  const out: LineData[] = [];
  if (candles.length < period + 1) return out;
  const closes = candles.map((c) => c.close);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) avgGain += ch;
    else avgLoss -= ch;
  }
  avgGain /= period;
  avgLoss /= period;
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  out.push({
    time: candles[period].time as TimeT,
    value: 100 - 100 / (1 + rs),
  });
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push({
      time: candles[i].time as TimeT,
      value: 100 - 100 / (1 + rs),
    });
  }
  return out;
}
