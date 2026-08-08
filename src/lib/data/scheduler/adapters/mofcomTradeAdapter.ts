import type { FetchIncrementalResult } from "../types";
import { fetchMofcomTradeHistory } from "../mofcomTrade/client";

/** Normal worker calls only the latest official release; seed/sync performs the historical scan. */
export async function fetchMofcomTradeIncremental(_metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const history = await fetchMofcomTradeHistory();
  const series = history.get(code);
  if (!series) throw new Error(`商务部货物贸易接口本期未返回 ${code}`);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const points = series.points.filter((point) => point.obsDate >= start);
  return { points, sourceLatestObsDate: series.points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
