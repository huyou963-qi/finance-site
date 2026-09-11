import type { FetchIncrementalResult } from "../types";
import type { BojSeries } from "./catalog";

export function parseBojResponse(input: unknown, row: BojSeries): FetchIncrementalResult {
  const body = input as { STATUS?: number; MESSAGE?: string; NEXTPOSITION?: unknown; RESULTSET?: Array<{ SERIES_CODE: string; FREQUENCY: string; UNIT: string; VALUES: { SURVEY_DATES: unknown[]; VALUES: unknown[] } }> };
  if (body?.STATUS !== 200 || !Array.isArray(body.RESULTSET)) throw new Error(`BOJ response: ${body?.MESSAGE ?? "invalid schema"}`);
  // One series is far below the 60,000 point limit. Fail closed if this changes.
  if (body.NEXTPOSITION != null && body.NEXTPOSITION !== "") throw new Error("BOJ response truncated: unexpected NEXTPOSITION");
  const series = body.RESULTSET.filter((s) => s.SERIES_CODE === row.seriesCode);
  if (series.length !== 1) throw new Error(`BOJ missing/duplicate series ${row.seriesCode}`);
  const s = series[0];
  if (s.FREQUENCY !== row.frequency || s.UNIT !== row.sourceUnit) throw new Error(`BOJ metadata changed: ${row.seriesCode}`);
  if (!Array.isArray(s.VALUES?.SURVEY_DATES) || !Array.isArray(s.VALUES?.VALUES) || s.VALUES.SURVEY_DATES.length !== s.VALUES.VALUES.length) throw new Error("BOJ date/value array mismatch");
  const points: FetchIncrementalResult["points"] = [];
  const seen = new Set<string>();
  let skippedInvalid = 0;
  s.VALUES.SURVEY_DATES.forEach((rawDate, i) => {
    const date = String(rawDate);
    const period = Number(date.slice(4));
    if (!/^\d{6}$/.test(date) || Number(date.slice(0, 4)) < 1850 || period < 1 || period > (row.frequency === "QUARTERLY" ? 4 : 12)) throw new Error(`BOJ invalid period ${date}`);
    if (seen.has(date)) throw new Error(`BOJ duplicate period ${date}`);
    seen.add(date);
    const raw = s.VALUES.VALUES[i];
    if (raw === null) { skippedInvalid++; return; }
    if (typeof raw !== "number" || !Number.isFinite(raw)) throw new Error(`BOJ invalid value ${date}`);
    const month = row.frequency === "QUARTERLY" ? (period - 1) * 3 + 1 : period;
    const obsDate = new Date(`${date.slice(0, 4)}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`);
    if (obsDate.getTime() > Date.now()) throw new Error(`BOJ future period ${date}`);
    points.push({ obsDate, value: raw });
  });
  points.sort((a,b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (!points.length) throw new Error(`BOJ empty series ${row.seriesCode}`);
  return { points, skippedInvalid, sourceLatestObsDate: points.at(-1)!.obsDate };
}
