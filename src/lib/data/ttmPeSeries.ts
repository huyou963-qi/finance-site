import type { CandlestickData, LineData, UTCTimestamp } from "lightweight-charts";

export type QuarterlyEpsRow = {
  /** 报告期截止日 YYYY-MM-DD */
  date: string;
  eps: number;
};

export type TtmEpsPoint = {
  date: string;
  ttmEps: number;
};

/** FMP ratios 季度 PE（已是市盈率，无需再用收盘价除 EPS） */
export type QuarterlyPePoint = {
  date: string;
  pe: number;
};

/** 按报告期升序，每点取含当期在内连续四季度 EPS 之和 */
export function buildTtmEpsTimeline(rows: QuarterlyEpsRow[]): TtmEpsPoint[] {
  const asc = [...rows]
    .filter((r) => r.date && Number.isFinite(r.eps) && r.eps !== 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const out: TtmEpsPoint[] = [];
  for (let i = 3; i < asc.length; i++) {
    let sum = 0;
    for (let j = i - 3; j <= i; j++) sum += asc[j]!.eps;
    if (sum > 0) out.push({ date: asc[i]!.date, ttmEps: sum });
  }
  return out;
}

function candleDateStr(time: CandlestickData["time"]): string | null {
  const sec =
    typeof time === "number"
      ? time
      : typeof time === "string"
        ? Math.floor(Date.parse(time) / 1000)
        : null;
  if (sec == null || !Number.isFinite(sec)) return null;
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * TTM PE = 收盘价 / 滚动四季度 EPS；财报按截止日向前填充至下一报告前。
 */
export function ttmPeLineFromCandles(
  candles: CandlestickData[],
  ttmTimeline: TtmEpsPoint[],
): LineData[] {
  if (!candles.length || !ttmTimeline.length) return [];
  const sorted = [...ttmTimeline].sort((a, b) => a.date.localeCompare(b.date));
  let ti = 0;
  let lastTtm = sorted[0]!.ttmEps;
  const out: LineData[] = [];

  for (const c of candles) {
    const ds = candleDateStr(c.time);
    if (!ds) continue;
    while (ti + 1 < sorted.length && sorted[ti + 1]!.date <= ds) {
      ti++;
      lastTtm = sorted[ti]!.ttmEps;
    }
    if (sorted[0]!.date > ds) continue;
    const close = c.close;
    if (!Number.isFinite(close) || close <= 0 || lastTtm <= 0) continue;
    const pe = close / lastTtm;
    if (!Number.isFinite(pe) || pe <= 0 || pe > 1e6) continue;
    out.push({ time: c.time as UTCTimestamp, value: pe });
  }
  return out;
}

/** 按报告期向前填充季度 PE 至每根 K 线 */
export function peLineFromQuarterlyPe(
  candles: CandlestickData[],
  peTimeline: QuarterlyPePoint[],
): LineData[] {
  if (!candles.length || !peTimeline.length) return [];
  const sorted = [...peTimeline].sort((a, b) => a.date.localeCompare(b.date));
  let ti = 0;
  let lastPe = sorted[0]!.pe;
  const out: LineData[] = [];

  for (const c of candles) {
    const ds = candleDateStr(c.time);
    if (!ds) continue;
    while (ti + 1 < sorted.length && sorted[ti + 1]!.date <= ds) {
      ti++;
      lastPe = sorted[ti]!.pe;
    }
    if (sorted[0]!.date > ds) continue;
    if (!Number.isFinite(lastPe) || lastPe <= 0 || lastPe > 1e6) continue;
    out.push({ time: c.time as UTCTimestamp, value: lastPe });
  }
  return out;
}
