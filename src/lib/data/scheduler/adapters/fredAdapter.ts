import type { DataGranularity } from "@prisma/client";
import type { FetchIncrementalResult, ObservationPoint } from "../types";
import { getFredRateLimiter, type FredRateLimiter } from "../fredRateLimiter";

const FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations";
const FRED_MAX_PAGE_SIZE = 100_000;

type FredRevisionResponse = {
  count?: number;
  observations?: Array<Record<string, string>>;
  error_code?: number;
  error_message?: string;
};

export type FredVintageObservation = {
  obsDate: Date;
  availableAt: Date;
  realtimeStart: Date;
  realtimeEnd: Date | null;
  value: number;
  isInitialRelease: boolean;
};

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
    FRED_OBSERVATIONS_URL +
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

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function availableAtFromCompact(value: string): Date | null {
  if (!/^\d{8}$/.test(value)) return null;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${iso}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function previousDay(value: Date): Date {
  return new Date(value.getTime() - 86_400_000);
}

/**
 * 将 FRED output_type=3 的“新增/修订”宽表展开成 append-only 版本行。
 * 解析和 HTTP 获取都归属 FRED adapter，业务模块不得再次实现 FRED 协议。
 */
export function parseFredRevisionRows(
  seriesId: string,
  rows: readonly Record<string, string>[],
): FredVintageObservation[] {
  const prefix = `${seriesId}_`;
  const byKey = new Map<
    string,
    Omit<FredVintageObservation, "realtimeEnd" | "isInitialRelease">
  >();
  for (const row of rows) {
    const obsDateText = row.date;
    if (!obsDateText || !/^\d{4}-\d{2}-\d{2}$/.test(obsDateText)) continue;
    for (const [key, raw] of Object.entries(row)) {
      if (!key.startsWith(prefix) || raw === "." || raw === "") continue;
      const availableAt = availableAtFromCompact(key.slice(prefix.length));
      const value = Number(raw);
      if (!availableAt || !Number.isFinite(value)) continue;
      const obsDate = dateFromIso(obsDateText);
      byKey.set(`${obsDateText}|${availableAt.toISOString()}`, {
        obsDate,
        availableAt,
        realtimeStart: dateFromIso(availableAt.toISOString().slice(0, 10)),
        value,
      });
    }
  }

  const grouped = new Map<
    string,
    Array<Omit<FredVintageObservation, "realtimeEnd" | "isInitialRelease">>
  >();
  for (const row of byKey.values()) {
    const key = row.obsDate.toISOString().slice(0, 10);
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  const result: FredVintageObservation[] = [];
  for (const versions of grouped.values()) {
    versions.sort((left, right) => left.availableAt.getTime() - right.availableAt.getTime());
    versions.forEach((row, index) => {
      const next = versions[index + 1];
      result.push({
        ...row,
        realtimeEnd: next ? previousDay(next.realtimeStart) : null,
        isInitialRelease: index === 0,
      });
    });
  }
  return result.sort(
    (left, right) =>
      left.availableAt.getTime() - right.availableAt.getTime()
      || left.obsDate.getTime() - right.obsDate.getTime(),
  );
}

export type FetchFredVintagesResult = {
  sourceRows: number;
  vintages: FredVintageObservation[];
};

/**
 * FRED/ALFRED 版本历史的统一获取入口。
 * 与普通增量获取共享全局限速、429 重试和源协议解析。
 */
export async function fetchFredVintages(
  options: {
    apiKey: string;
    seriesId: string;
    realtimeStart: string;
    realtimeEnd: string;
  },
  rateLimiter?: FredRateLimiter,
): Promise<FetchFredVintagesResult> {
  const rows: Record<string, string>[] = [];
  const limiter = rateLimiter ?? getFredRateLimiter();
  let offset = 0;
  let count = Number.POSITIVE_INFINITY;
  while (offset < count) {
    const url = new URL(FRED_OBSERVATIONS_URL);
    url.searchParams.set("series_id", options.seriesId);
    url.searchParams.set("api_key", options.apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("realtime_start", options.realtimeStart);
    url.searchParams.set("realtime_end", options.realtimeEnd);
    url.searchParams.set("output_type", "3");
    url.searchParams.set("limit", String(FRED_MAX_PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await limiter.fetch(url.toString(), {
      headers: { "User-Agent": "finance-site-data-scheduler/1.0" },
      signal: AbortSignal.timeout(120_000),
    });
    const payload = (await response.json()) as FredRevisionResponse;
    if (!response.ok || payload.error_code) {
      throw new Error(
        payload.error_message || `FRED ${options.seriesId} vintage HTTP ${response.status}`,
      );
    }
    const page = payload.observations ?? [];
    rows.push(...page);
    count = payload.count ?? rows.length;
    if (page.length === 0) break;
    offset += page.length;
  }
  return { sourceRows: rows.length, vintages: parseFredRevisionRows(options.seriesId, rows) };
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
