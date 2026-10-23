import type { FetchIncrementalResult, ObservationPoint } from "../types";
import { fetchCftcDisaggregatedRows } from "../cftcCot/client";
import { extractMmSeries } from "../cftcCot/match";
import { CFTC_COT_HISTORY_START } from "../cftcCot/types";
import { readCotMeta } from "../cotSeedCatalog";

export async function fetchCftcCotIncremental(
  metadata: unknown,
  observationStart: string,
): Promise<FetchIncrementalResult> {
  const cot = readCotMeta(metadata);
  if (!cot) {
    throw new Error("仪器 metadata.cot 未配置");
  }

  const since = observationStart < CFTC_COT_HISTORY_START ? CFTC_COT_HISTORY_START : observationStart;
  const rows = await fetchCftcDisaggregatedRows(since, {
    requireCompleteHistory: observationStart < CFTC_COT_HISTORY_START,
  });
  const series = extractMmSeries(rows, cot.match);

  const points: ObservationPoint[] = series.map((row) => ({
    obsDate: row.obsDate,
    value:
      cot.metric === "long"
        ? row.long
        : cot.metric === "short"
          ? row.short
          : row.long - row.short,
  }));

  if (!points.length) throw new Error(`CFTC COT 无匹配数据: ${cot.productSlug}`);
  const filtered = points.filter((p) => p.obsDate.toISOString().slice(0, 10) >= observationStart);
  const sourceLatest = points[points.length - 1]!.obsDate;

  return {
    points: filtered,
    sourceLatestObsDate: sourceLatest,
    skippedInvalid: series.length - points.length,
  };
}
