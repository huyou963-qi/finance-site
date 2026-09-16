import type { FetchIncrementalResult } from "../types";
import {
  fetchNbsRealEstateHistory,
  type NbsRealEstateHistory,
  type NbsRealEstateSeries,
} from "../nbsRealEstate/client";

function canonicalSeriesKey(value: string): string {
  // NBS occasionally inserts a visual space into a city name in archived HTML
  // (for example, "唐 山").  Subscription codes must remain stable, so match
  // the source's semantic key rather than generating a new code for the
  // typographic variant.
  return value.replace(/\s+/g, "");
}

export function resolveNbsRealEstateSeries(
  history: NbsRealEstateHistory,
  code: string,
  metadata: unknown,
): NbsRealEstateSeries | undefined {
  const direct = history.get(code);
  if (direct) return direct;
  const scrape = metadata && typeof metadata === "object"
    ? (metadata as { scrape?: unknown }).scrape
    : undefined;
  const key = scrape && typeof scrape === "object"
    ? (scrape as { key?: unknown }).key
    : undefined;
  if (typeof key !== "string") return undefined;
  const canonical = canonicalSeriesKey(key);
  return [...history.values()].find((series) => canonicalSeriesKey(series.key) === canonical);
}

/** Latest archive pages are enough for the normal monthly worker; the seed/sync command performs the full backfill. */
export async function fetchNbsRealEstateIncremental(metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const history = await fetchNbsRealEstateHistory();
  const series = resolveNbsRealEstateSeries(history, code, metadata);
  if (!series) throw new Error(`国家统计局房地产月报：本期未找到指标 ${code}`);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const points = series.points.filter((point) => point.obsDate >= start);
  return { points, sourceLatestObsDate: series.points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
