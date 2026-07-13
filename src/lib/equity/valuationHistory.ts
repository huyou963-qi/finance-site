/**
 * 估值历史带（PE/PB band）：日线收盘 × 逐季 TTM EPS / BVPS → 历史估值序列与当前分位。
 * 财报可得性按财季末 + 40 天近似（10-Q 法定披露期），避免前视偏差。
 */

export type ValuationHistoryPoint = {
  /** epoch 秒 */
  t: number;
  pe: number | null;
  pb: number | null;
};

export type ValuationHistory = {
  points: ValuationHistoryPoint[];
  peCurrent: number | null;
  /** 当前 PE 在历史序列中的分位 [0,1] */
  pePercentile: number | null;
  peMin: number | null;
  peMax: number | null;
  pbCurrent: number | null;
  pbPercentile: number | null;
};

const REPORT_LAG_DAYS = 40;
const DAY_SEC = 86_400;

type QuarterInput = { fiscalDate: string; epsTtm: number | null; bvps: number | null };
type ClosePoint = { time: number; close: number };

function percentile(values: number[], current: number): number | null {
  if (values.length < 8) return null;
  const below = values.filter((v) => v <= current).length;
  return below / values.length;
}

/**
 * @param closes 日线收盘（升序，time 为 epoch 秒）
 * @param quarters 逐季 TTM EPS / BVPS（升序）
 * @param sampleEvery 采样步长（交易日），默认每 5 个交易日取一点
 */
export function computeValuationHistory(
  closes: ClosePoint[],
  quarters: QuarterInput[],
  sampleEvery = 5,
): ValuationHistory {
  const empty: ValuationHistory = {
    points: [],
    peCurrent: null,
    pePercentile: null,
    peMin: null,
    peMax: null,
    pbCurrent: null,
    pbPercentile: null,
  };
  if (!closes.length || !quarters.length) return empty;

  // 财报可得时间轴（升序）
  const avail = quarters
    .map((q) => ({
      fromSec: Math.floor(Date.parse(`${q.fiscalDate}T00:00:00Z`) / 1000) + REPORT_LAG_DAYS * DAY_SEC,
      epsTtm: q.epsTtm,
      bvps: q.bvps,
    }))
    .sort((a, b) => a.fromSec - b.fromSec);

  const points: ValuationHistoryPoint[] = [];
  let qi = -1;
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i]!;
    while (qi + 1 < avail.length && avail[qi + 1]!.fromSec <= c.time) qi += 1;
    if (qi < 0) continue;
    const isLast = i === closes.length - 1;
    if (i % sampleEvery !== 0 && !isLast) continue;
    const { epsTtm, bvps } = avail[qi]!;
    points.push({
      t: c.time,
      pe: epsTtm != null && epsTtm > 0 ? c.close / epsTtm : null,
      pb: bvps != null && bvps > 0 ? c.close / bvps : null,
    });
  }
  if (!points.length) return empty;

  // 当前值用最新收盘 × 最新已披露财报
  const lastQ = avail[avail.length - 1]!;
  const lastClose = closes[closes.length - 1]!.close;
  const peCurrent = lastQ.epsTtm != null && lastQ.epsTtm > 0 ? lastClose / lastQ.epsTtm : null;
  const pbCurrent = lastQ.bvps != null && lastQ.bvps > 0 ? lastClose / lastQ.bvps : null;

  const peVals = points.map((p) => p.pe).filter((v): v is number => v != null);
  const pbVals = points.map((p) => p.pb).filter((v): v is number => v != null);

  return {
    points,
    peCurrent,
    pePercentile: peCurrent != null ? percentile(peVals, peCurrent) : null,
    peMin: peVals.length ? Math.min(...peVals) : null,
    peMax: peVals.length ? Math.max(...peVals) : null,
    pbCurrent,
    pbPercentile: pbCurrent != null ? percentile(pbVals, pbCurrent) : null,
  };
}
