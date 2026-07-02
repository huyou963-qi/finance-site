import type { DataGranularity } from "@prisma/client";
import type { FetchIncrementalResult, ObservationPoint } from "../types";
import { getFredRateLimiter, type FredRateLimiter } from "../fredRateLimiter";

function parseFredDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function fetchFredIncremental(
  seriesId: string,
  apiKey: string,
  observationStart: string,
  rateLimiter?: FredRateLimiter,
): Promise<FetchIncrementalResult> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json` +
    `&observation_start=${encodeURIComponent(observationStart)}`;

  const limiter = rateLimiter ?? getFredRateLimiter();
  const res = await limiter.fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FRED HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: unknown = await res.json();
  const observations = (json as { observations?: { date: string; value: string }[] })
    ?.observations;

  if (!Array.isArray(observations)) {
    throw new Error(`FRED: missing observations (${seriesId})`);
  }

  const points: ObservationPoint[] = [];
  let skippedInvalid = 0;
  let sourceLatest: Date | null = null;

  for (const o of observations) {
    const v = parseFloat(o.value);
    if (!Number.isFinite(v) || o.value === ".") {
      skippedInvalid += 1;
      continue;
    }
    const obsDate = parseFredDate(o.date);
    points.push({ obsDate, value: v });
    if (!sourceLatest || obsDate > sourceLatest) sourceLatest = obsDate;
  }

  return { points, sourceLatestObsDate: sourceLatest, skippedInvalid };
}

export function granularityFromFredFrequency(
  freq: string | undefined,
): DataGranularity {
  const f = (freq ?? "").toLowerCase();
  if (f.includes("daily")) return "DAILY";
  if (f.includes("weekly")) return "WEEKLY";
  if (f.includes("monthly")) return "MONTHLY";
  if (f.includes("quarter")) return "QUARTERLY";
  if (f.includes("annual") || f.includes("year")) return "ANNUAL";
  return "IRREGULAR";
}
