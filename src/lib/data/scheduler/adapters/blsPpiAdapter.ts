import type { FetchIncrementalResult, ObservationPoint } from "../types";

const BLS_API_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data";
const MAX_YEARS_PER_REQUEST = 10;

type BlsObservation = { year?: string; period?: string; value?: string };
type BlsPayload = {
  status?: string;
  message?: string[];
  Results?: { series?: Array<{ data?: BlsObservation[] }> };
};

type BlsPpiConfig = {
  seriesId: string;
  transform: "yoy_pct";
  historyStart?: string;
};

function endOfMonthUtc(year: number, monthOneBased: number): Date {
  return new Date(Date.UTC(year, monthOneBased, 0));
}

function monthKey(year: number, monthOneBased: number): string {
  return `${year}-${String(monthOneBased).padStart(2, "0")}`;
}

function readConfig(metadata: unknown): BlsPpiConfig {
  if (!metadata || typeof metadata !== "object") throw new Error("BLS PPI 缺少仪器 metadata");
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") throw new Error("BLS PPI 缺少 scrape 配置");
  const row = scrape as Record<string, unknown>;
  if (row.provider !== "bls_ppi" || typeof row.seriesId !== "string") {
    throw new Error("BLS PPI scrape 配置无效");
  }
  if (row.transform !== "yoy_pct") throw new Error("BLS PPI 仅支持 yoy_pct 口径");
  return {
    seriesId: row.seriesId,
    transform: "yoy_pct",
    historyStart: typeof row.historyStart === "string" ? row.historyStart : undefined,
  };
}

/** Exported for fixture tests; invalid/non-monthly observations are discarded. */
export function parseBlsMonthlyIndex(payload: unknown): ObservationPoint[] {
  const data = (payload as BlsPayload)?.Results?.series?.[0]?.data;
  if (!Array.isArray(data)) throw new Error("BLS PPI 返回中没有 series data");

  const byMonth = new Map<string, ObservationPoint>();
  for (const row of data) {
    const year = Number(row.year);
    const period = String(row.period ?? "");
    const month = /^M(\d{2})$/.exec(period)?.[1];
    const value = Number(row.value);
    if (!month || !Number.isFinite(year) || !Number.isFinite(value)) continue;
    const monthNumber = Number(month);
    if (monthNumber < 1 || monthNumber > 12) continue;
    byMonth.set(monthKey(year, monthNumber), {
      obsDate: endOfMonthUtc(year, monthNumber),
      value,
    });
  }
  return [...byMonth.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
}

/** BLS publishes the NSA index; this produces the workbook's 12-month percent change. */
export function calculateBlsPpiYoy(indexPoints: ObservationPoint[]): ObservationPoint[] {
  const byMonth = new Map<string, number>();
  for (const point of indexPoints) {
    byMonth.set(monthKey(point.obsDate.getUTCFullYear(), point.obsDate.getUTCMonth() + 1), point.value);
  }
  const out: ObservationPoint[] = [];
  for (const point of indexPoints) {
    const y = point.obsDate.getUTCFullYear();
    const m = point.obsDate.getUTCMonth() + 1;
    const previous = byMonth.get(monthKey(y - 1, m));
    if (previous == null || previous === 0) continue;
    out.push({ obsDate: point.obsDate, value: ((point.value / previous) - 1) * 100 });
  }
  return out;
}

function yearFromIso(iso: string): number {
  const year = Number(iso.slice(0, 4));
  if (!Number.isInteger(year)) throw new Error(`无效日期：${iso}`);
  return year;
}

async function fetchBlsChunk(seriesId: string, startYear: number, endYear: number): Promise<ObservationPoint[]> {
  const url = `${BLS_API_BASE}/${encodeURIComponent(seriesId)}?startyear=${startYear}&endyear=${endYear}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`BLS PPI HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const payload = (await res.json()) as BlsPayload;
  if (payload.status !== "REQUEST_SUCCEEDED") {
    throw new Error(`BLS PPI API failed: ${(payload.message ?? []).join("; ") || payload.status || "unknown"}`);
  }
  return parseBlsMonthlyIndex(payload);
}

export async function fetchBlsPpiIncremental(
  metadata: unknown,
  observationStart: string,
): Promise<FetchIncrementalResult> {
  const config = readConfig(metadata);
  const persistStart = new Date(`${observationStart.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(persistStart.getTime())) throw new Error(`无效 observationStart：${observationStart}`);

  // The 12-month transformation needs a year of input before the persisted window.
  const inputStart = new Date(persistStart);
  inputStart.setUTCMonth(inputStart.getUTCMonth() - 12);
  const isInitialBootstrap = observationStart === "1950-01-01" && config.historyStart;
  const startYear = isInitialBootstrap
    ? yearFromIso(config.historyStart!) - 1
    : inputStart.getUTCFullYear();
  const endYear = new Date().getUTCFullYear() + 1;
  const indexByMonth = new Map<string, ObservationPoint>();

  for (let from = startYear; from <= endYear; from += MAX_YEARS_PER_REQUEST) {
    const to = Math.min(endYear, from + MAX_YEARS_PER_REQUEST - 1);
    const points = await fetchBlsChunk(config.seriesId, from, to);
    for (const point of points) {
      indexByMonth.set(
        monthKey(point.obsDate.getUTCFullYear(), point.obsDate.getUTCMonth() + 1),
        point,
      );
    }
  }

  const indexPoints = [...indexByMonth.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  const yoy = calculateBlsPpiYoy(indexPoints).filter((point) => point.obsDate >= persistStart);
  return {
    points: yoy,
    sourceLatestObsDate: indexPoints.length ? indexPoints[indexPoints.length - 1]!.obsDate : null,
    skippedInvalid: 0,
  };
}
