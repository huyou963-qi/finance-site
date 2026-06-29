import type { FetchIncrementalResult, ObservationPoint } from "../types";
import { fetchCftcDisaggregatedRows, latestReportDate } from "../cftcCot/client";
import { extractMmSeries } from "../cftcCot/match";
import { readCotMeta } from "../cotSeedCatalog";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function filterFromStart(points: ObservationPoint[], observationStart: string): ObservationPoint[] {
  const start = new Date(`${observationStart.slice(0, 10)}T00:00:00.000Z`);
  return points.filter((p) => p.obsDate >= start);
}

/** 首次回填向前多取 60 周，供一年极值与趋势图 */
function effectiveSince(observationStart: string, isColdStart: boolean): string {
  const start = new Date(`${observationStart.slice(0, 10)}T00:00:00.000Z`);
  if (!isColdStart) return isoDate(start);
  const floor = new Date(start);
  floor.setUTCDate(floor.getUTCDate() - 7 * 60);
  return isoDate(floor);
}

export async function fetchCftcCotIncremental(
  metadata: unknown,
  observationStart: string,
): Promise<FetchIncrementalResult> {
  const cot = readCotMeta(metadata);
  if (!cot) {
    throw new Error("仪器 metadata.cot 未配置");
  }

  const coldStart = observationStart <= "1970-01-02";
  const since = effectiveSince(observationStart, coldStart);
  const rows = await fetchCftcDisaggregatedRows(since);
  const series = extractMmSeries(rows, cot.match);

  const points: ObservationPoint[] = series.map((row) => ({
    obsDate: row.obsDate,
    value: cot.metric === "long" ? row.long : row.short,
  }));

  const filtered = filterFromStart(points, observationStart);
  const sourceLatest = latestReportDate(rows);

  return {
    points: filtered,
    sourceLatestObsDate: sourceLatest,
    skippedInvalid: series.length - points.length,
  };
}
