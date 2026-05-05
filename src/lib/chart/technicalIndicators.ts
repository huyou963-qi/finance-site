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

/** 常见 KDJ(9,3,3)：RSV + 平滑 K、D；J = 3K - 2D */
export function kdj(
  candles: CandlestickData[],
  n = 9,
): { k: LineData[]; d: LineData[]; j: LineData[] } {
  const kOut: LineData[] = [];
  const dOut: LineData[] = [];
  const jOut: LineData[] = [];
  let kPrev = 50;
  let dPrev = 50;

  for (let i = 0; i < candles.length; i++) {
    const from = Math.max(0, i - n + 1);
    const window = candles.slice(from, i + 1);
    const high9 = Math.max(...window.map((c) => c.high));
    const low9 = Math.min(...window.map((c) => c.low));
    const c = candles[i].close;
    const denom = high9 - low9;
    const rsv = denom === 0 ? 50 : ((c - low9) / denom) * 100;
    const k = (2 / 3) * kPrev + (1 / 3) * rsv;
    const d = (2 / 3) * dPrev + (1 / 3) * k;
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

/** MACD：DIF/DEA 线 + 柱（histogram） */
export function macd(
  candles: CandlestickData[],
): {
  dif: LineData[];
  dea: LineData[];
  hist: { time: UTCTimestamp; value: number; color?: string }[];
} {
  const closes = candles.map((c) => c.close);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const difArr: number[] = closes.map((_, i) => ema12[i] - ema26[i]);
  const deaArr = ema(difArr, 9);
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
