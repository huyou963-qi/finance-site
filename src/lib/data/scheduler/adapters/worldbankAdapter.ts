import type { FetchIncrementalResult, ObservationPoint } from "../types";

export function worldBankApiCountry(countryCode: string): string | null {
  // The UI's short country list is not the list of countries supported by WDI.
  return countryCode === "EA" ? "EMU" : countryCode === "EU" ? "EUU" : /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
}

function parseWorldBankSeriesKey(sourceSeriesKey: string): {
  countryCode: string;
  indicatorId: string;
} | null {
  const i = sourceSeriesKey.indexOf(":");
  if (i <= 0) return null;
  const countryCode = sourceSeriesKey.slice(0, i).trim().toUpperCase();
  const indicatorId = sourceSeriesKey.slice(i + 1).trim();
  if (!/^[A-Z]{2}$/.test(countryCode) || !indicatorId) return null;
  return { countryCode, indicatorId };
}

function yearFromIso(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

export async function fetchWorldBankIncremental(
  sourceSeriesKey: string,
  observationStart: string,
  options?: { annualObservationDate?: "year_start" | "year_end"; historyStartYear?: number },
): Promise<FetchIncrementalResult> {
  const parsed = parseWorldBankSeriesKey(sourceSeriesKey);
  if (!parsed) {
    throw new Error(`World Bank sourceSeriesKey 格式应为 CC:INDICATOR，收到 ${sourceSeriesKey}`);
  }

  const { countryCode, indicatorId } = parsed;
  // Catalogue regional aliases are not World Bank API country codes.
  const iso3 = worldBankApiCountry(countryCode);
  if (!iso3) {
    throw new Error(`World Bank 不支持国家代码 ${countryCode}`);
  }

  const startYear = Math.max(
    options?.historyStartYear ?? 1990,
    yearFromIso(observationStart),
  );
  const endYear = new Date().getUTCFullYear() + 1;
  const url =
    `https://api.worldbank.org/v2/country/${iso3}/indicator/${encodeURIComponent(indicatorId)}` +
    `?format=json&date=${startYear}:${endYear}&per_page=1000`;

  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`World Bank HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json: unknown = await res.json();
  if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
    throw new Error(`World Bank: unexpected response (${indicatorId})`);
  }

  const rows = json[1] as {
    country?: { id?: string };
    countryiso3code?: string;
    date?: string;
    value?: number | null;
  }[];

  const points: ObservationPoint[] = [];
  let skippedInvalid = 0;

  for (const row of rows) {
    if ((iso3.length === 3 ? row.countryiso3code !== iso3 : row.country?.id !== iso3) || !row.date) continue;
    const v =
      row.value === null || row.value === undefined || Number.isNaN(Number(row.value))
        ? NaN
        : Number(row.value);
    if (!Number.isFinite(v)) {
      skippedInvalid += 1;
      continue;
    }
    const y = Number(row.date);
    if (!Number.isFinite(y)) {
      skippedInvalid += 1;
      continue;
    }
    points.push({
      obsDate:
        options?.annualObservationDate === "year_end"
          ? new Date(Date.UTC(y, 11, 31))
          : new Date(Date.UTC(y, 0, 1)),
      value: v,
    });
  }

  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());

  const sourceLatestObsDate =
    points.length > 0 ? points[points.length - 1]!.obsDate : null;

  return { points, sourceLatestObsDate, skippedInvalid };
}
