import type { FetchIncrementalResult } from "../types";
import { fetchMofcomTradeHistory, usesGaccTotalAmounts, type MofcomTradeSeries } from "../mofcomTrade/client";

export function mofcomRevisionPoints(series: MofcomTradeSeries, obsStart: string) {
  const latest = series.points.at(-1)?.obsDate;
  const start = /^total\|[^|]+\|(?:amount|cumulative_amount)$/.test(series.key) && latest
    ? new Date(Date.UTC(latest.getUTCFullYear() - 1, 0, 1))
    : new Date(`${obsStart}T00:00:00.000Z`);
  return series.points.filter(point => point.obsDate >= start);
}
/** One current release file includes bounded current/previous-year total revisions. */
export async function fetchMofcomTradeIncremental(_metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  // A primary totals outage must not break unrelated country/method/growth members.
  const history = await fetchMofcomTradeHistory({ includePrimaryTotals: usesGaccTotalAmounts(code) });
  const series = history.get(code);
  if (!series) throw new Error(`商务部货物贸易接口本期未返回 ${code}`);
  const points = mofcomRevisionPoints(series, obsStart);
  return { points, sourceLatestObsDate: series.points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
