import { CFTC_COT_API_BASE, type CftcCotRow } from "./types";

type RowCache = {
  sinceIso: string;
  rows: CftcCotRow[];
  fetchedAt: number;
};

let cache: RowCache | null = null;
const CACHE_TTL_MS = 5 * 60_000;

function parseReportDate(raw: unknown): Date | null {
  const s = String(raw ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(r: Record<string, unknown>): CftcCotRow | null {
  const reportDate =
    parseReportDate(r.report_date_as_yyyy_mm_dd) ?? parseReportDate(r.report_date);
  if (!reportDate) return null;
  return {
    reportDate,
    reportDateIso: reportDate.toISOString().slice(0, 10),
    commodity: String(r.commodity ?? "").trim(),
    market: String(r.market_and_exchange_names ?? "").trim(),
    mmLong: num(r.m_money_positions_long_all),
    mmShort: num(r.m_money_positions_short_all),
    openInterest: num(r.open_interest_all),
  };
}

export function clearCftcCotCache(): void {
  cache = null;
}

export async function fetchCftcDisaggregatedRows(sinceIso: string): Promise<CftcCotRow[]> {
  const since = sinceIso.slice(0, 10);
  const now = Date.now();
  if (cache && cache.sinceIso <= since && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rows.filter((r) => r.reportDateIso >= since);
  }

  const isoFilter = `${since}T00:00:00.000`;
  const url =
    `${CFTC_COT_API_BASE}?` +
    `$where=${encodeURIComponent(`report_date_as_yyyy_mm_dd >= '${isoFilter}'`)}` +
    `&$order=${encodeURIComponent("report_date_as_yyyy_mm_dd ASC")}` +
    `&$limit=50000`;

  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) {
    throw new Error(`CFTC COT HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const raw = (await res.json()) as Record<string, unknown>[];
  const rows: CftcCotRow[] = [];
  for (const item of raw) {
    const row = normalizeRow(item);
    if (row) rows.push(row);
  }

  cache = { sinceIso: since, rows, fetchedAt: now };
  return rows.filter((r) => r.reportDateIso >= since);
}

export function latestReportDate(rows: CftcCotRow[]): Date | null {
  if (!rows.length) return null;
  return rows.reduce((best, r) => (r.reportDate > best ? r.reportDate : best), rows[0]!.reportDate);
}
