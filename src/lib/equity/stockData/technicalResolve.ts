/**
 * 「股票数据」技术指标：对截止日可见的收盘序列现场计算（不入库）。
 * 算法与 src/lib/chart/technicalIndicators.ts 一致（SMA / Wilder RSI / MACD），
 * 这里只取截止日那一点的值，避免引入 lightweight-charts 类型。
 */

const finite = (v: number) => (Number.isFinite(v) ? v : null);

function smaAt(closes: readonly number[], period: number): number | null {
  if (closes.length < period) return null;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) sum += closes[i]!;
  return sum / period;
}

function emaSeries(values: readonly number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    out.push(i === 0 ? values[0]! : values[i]! * k + out[i - 1]! * (1 - k));
  }
  return out;
}

/** Wilder RSI，返回序列末端值 */
function rsiAt(closes: readonly number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    if (ch >= 0) avgGain += ch;
    else avgLoss -= ch;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type TechnicalPoint = {
  sma20: number | null;
  sma60: number | null;
  smaBias20: number | null;
  rsi14: number | null;
  macdDif: number | null;
  macdDea: number | null;
  macdHist: number | null;
};

/** 截止日（含）之前的收盘序列 → 技术指标一点 */
export function computeTechnicalPoint(closes: readonly number[]): TechnicalPoint {
  const sma20 = smaAt(closes, 20);
  const sma60 = smaAt(closes, 60);
  const last = closes.length ? closes[closes.length - 1]! : null;
  const smaBias20 =
    last != null && sma20 != null && sma20 !== 0 ? last / sma20 - 1 : null;
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const difArr = closes.map((_, i) => ema12[i]! - ema26[i]!);
  const deaArr = emaSeries(difArr, 9);
  const i = closes.length - 1;
  return {
    sma20: finite(sma20 ?? NaN),
    sma60: finite(sma60 ?? NaN),
    smaBias20: finite(smaBias20 ?? NaN),
    rsi14: finite(rsiAt(closes) ?? NaN),
    macdDif: i >= 0 ? finite(difArr[i]!) : null,
    macdDea: i >= 0 ? finite(deaArr[i]!) : null,
    macdHist: i >= 0 ? finite(difArr[i]! - deaArr[i]!) : null,
  };
}

/** 技术指标回看交易日：MACD/RSI/SMA60 需要约 60+，再留余量 */
export const TECHNICAL_LOOKBACK_DAYS = 120;
