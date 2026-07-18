import { parseBisCsvObservations, parseBisSeriesKey } from "./bisCsv";
import { bisFlowVersion } from "../bisProbe";
import type { FetchIncrementalResult, ObservationPoint } from "../types";

const BIS_API_V1 = "https://stats.bis.org/api/v1/data";

function bisPeriodStart(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  if (!Number.isFinite(y)) return "1947-Q1";
  const m = Number(isoDate.slice(5, 7)) || 1;
  const q = Math.floor((m - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

function filterFromStart(points: ObservationPoint[], observationStart: string): ObservationPoint[] {
  const start = new Date(`${observationStart}T00:00:00Z`);
  return points.filter((p) => p.obsDate >= start);
}

export async function fetchBisIncremental(
  sourceSeriesKey: string,
  observationStart: string,
): Promise<FetchIncrementalResult> {
  const parsed = parseBisSeriesKey(sourceSeriesKey);
  if (!parsed) {
    throw new Error(`BIS sourceSeriesKey 格式应为 flowId:Q.CC.X，收到 ${sourceSeriesKey}`);
  }

  const { flowId, seriesKey } = parsed;
  const startPeriod = bisPeriodStart(observationStart);
  const endYear = new Date().getUTCFullYear() + 1;
  const url =
    `${BIS_API_V1}/BIS,${flowId},${bisFlowVersion(flowId)}/${seriesKey}` +
    `?startPeriod=${encodeURIComponent(startPeriod)}&endPeriod=${endYear}-Q4&format=csv`;

  const res = await fetch(url, {
    headers: { Accept: "text/csv, */*" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BIS HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const text = await res.text();
  const all = parseBisCsvObservations(text);
  const points = filterFromStart(all, observationStart);
  let skippedInvalid = all.length - points.length;
  if (all.length === 0) skippedInvalid = 0;

  const sourceLatestObsDate =
    points.length > 0 ? points[points.length - 1]!.obsDate : null;

  return { points, sourceLatestObsDate, skippedInvalid };
}
