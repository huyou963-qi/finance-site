import type { FetchIncrementalResult } from "../types";
import { JP_CAO_WATCHERS_PROVIDER, JP_CAO_WATCHERS_SERIES } from "../jpCabinetEconomyWatchers/catalog";
import { fetchJpCaoWatchersWorkbook } from "../jpCabinetEconomyWatchers/client";
import { parseJpCaoWatchersWorkbook } from "../jpCabinetEconomyWatchers/parser";

export async function fetchJpCaoEconomyWatchersIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const md = metadata as { scrape?: { provider?: string; fixturePath?: string } } | null;
  if (md?.scrape?.provider !== JP_CAO_WATCHERS_PROVIDER ||
      !JP_CAO_WATCHERS_SERIES.some((series) => series.instrumentCode === instrumentCode)) {
    throw new Error(`Cabinet Office Economy Watchers invalid routing: ${instrumentCode}`);
  }
  const parsed = parseJpCaoWatchersWorkbook(await fetchJpCaoWatchersWorkbook(md.scrape.fixturePath));
  const points = parsed.series[instrumentCode];
  return { points, sourceLatestObsDate: parsed.sourceLatestObsDate, skippedInvalid: 0 };
}
