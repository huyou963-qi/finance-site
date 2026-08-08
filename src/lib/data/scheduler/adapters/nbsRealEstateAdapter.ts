import type { FetchIncrementalResult } from "../types";
import { fetchNbsRealEstateHistory } from "../nbsRealEstate/client";

/** Latest archive pages are enough for the normal monthly worker; the seed/sync command performs the full backfill. */
export async function fetchNbsRealEstateIncremental(_metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const history = await fetchNbsRealEstateHistory();
  const series = history.get(code);
  if (!series) throw new Error(`国家统计局房地产月报：本期未找到指标 ${code}`);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const points = series.points.filter((point) => point.obsDate >= start);
  return { points, sourceLatestObsDate: series.points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
