import { EUROSTAT_API_BASE, findEuropeCoreSeries } from "../europeCore/catalog";
import type { FetchIncrementalResult, ObservationPoint } from "../types";

type JsonStatDimension = {
  category?: {
    index?: Record<string, number> | string[];
  };
};

type JsonStatResponse = {
  id?: string[];
  size?: number[];
  value?: Array<number | null> | Record<string, number>;
  dimension?: Record<string, JsonStatDimension>;
  error?: { label?: string };
};

function orderedCategoryKeys(dimension: JsonStatDimension | undefined): string[] {
  const index = dimension?.category?.index;
  if (Array.isArray(index)) return index.map(String);
  if (!index || typeof index !== "object") return [];
  return Object.entries(index)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key);
}

export function parseEurostatPeriod(period: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return new Date(`${period}T00:00:00Z`);
  const monthly = period.match(/^(\d{4})-(\d{2})$/);
  if (monthly) return new Date(Date.UTC(Number(monthly[1]), Number(monthly[2]) - 1, 1));
  const quarterly = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarterly) return new Date(Date.UTC(Number(quarterly[1]), (Number(quarterly[2]) - 1) * 3, 1));
  if (/^\d{4}$/.test(period)) return new Date(Date.UTC(Number(period), 0, 1));
  return null;
}

export function parseEurostatJsonStat(payload: JsonStatResponse): FetchIncrementalResult {
  if (payload.error) throw new Error(`Eurostat API: ${payload.error.label ?? "unknown error"}`);
  const ids = payload.id ?? [];
  const sizes = payload.size ?? [];
  const timeIndex = ids.indexOf("time");
  if (timeIndex < 0 || ids.length !== sizes.length) throw new Error("Eurostat JSON-stat 缺少 time 维度");
  const nonTimeCells = sizes.reduce((product, size, index) => index === timeIndex ? product : product * size, 1);
  if (nonTimeCells !== 1) throw new Error(`Eurostat 查询没有唯一定位单序列（非时间单元=${nonTimeCells}）`);
  const periods = orderedCategoryKeys(payload.dimension?.time);
  if (periods.length !== sizes[timeIndex]) throw new Error("Eurostat time 维度长度不一致");
  const rawValue = payload.value ?? [];
  const valueAt = (index: number): unknown =>
    Array.isArray(rawValue) ? rawValue[index] : rawValue[String(index)];
  const points: ObservationPoint[] = [];
  let skippedInvalid = 0;
  for (let index = 0; index < periods.length; index += 1) {
    const raw = valueAt(index);
    if (raw == null) continue;
    const value = Number(raw);
    const obsDate = parseEurostatPeriod(periods[index]!);
    if (!obsDate || !Number.isFinite(value)) {
      skippedInvalid += 1;
      continue;
    }
    points.push({ obsDate, value });
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return { points, sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid };
}

function sincePeriod(fetchStart: string, frequency: string): string {
  const date = new Date(`${fetchStart}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return fetchStart;
  const year = date.getUTCFullYear();
  if (frequency === "Q") return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  if (frequency === "M") return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return fetchStart;
}

export async function fetchEurostatIncremental(
  instrumentCode: string,
  fetchStart: string,
): Promise<FetchIncrementalResult> {
  const series = findEuropeCoreSeries(instrumentCode);
  if (!series || series.provider !== "eurostat" || !series.dataset || !series.filters) {
    throw new Error(`Unknown Eurostat instrument: ${instrumentCode}`);
  }
  const params = new URLSearchParams({ lang: "en", ...series.filters });
  params.set("sinceTimePeriod", sincePeriod(fetchStart, series.filters.freq ?? ""));
  const url = `${EUROSTAT_API_BASE}/${series.dataset}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "finance-site/1.0 Eurostat macro scheduler" },
  });
  if (!response.ok) throw new Error(`Eurostat HTTP ${response.status}: ${url}`);
  return parseEurostatJsonStat((await response.json()) as JsonStatResponse);
}
