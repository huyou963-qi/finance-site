import {
  CFTC_COT_API_BASE,
  CFTC_DISAGG_COMBINED_CURRENT_URL,
  type CftcCotRow,
} from "./types";
import { inflateRawSync } from "node:zlib";

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

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse CFTC's official current-year Disaggregated Combined text format.
 * Column positions follow the published COT explanatory notes: market name,
 * report date, open interest, then Producer, Swap and Managed Money positions.
 */
export function parseCftcDisaggregatedCombinedText(text: string): CftcCotRow[] {
  const rows: CftcCotRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = splitCsvLine(line);
    if (fields.length < 15) continue;
    const market = fields[0]?.trim() ?? "";
    const reportDate = parseReportDate(fields[2]);
    if (!market || !reportDate) continue;
    const commodity = market.split(/\s+-\s+/, 1)[0]?.trim() ?? market;
    rows.push({
      reportDate,
      reportDateIso: reportDate.toISOString().slice(0, 10),
      commodity,
      market,
      openInterest: num(fields[7]),
      mmLong: num(fields[13]),
      mmShort: num(fields[14]),
    });
  }
  return rows;
}

async function fetchCurrentCombinedText(): Promise<CftcCotRow[]> {
  const res = await fetch(CFTC_DISAGG_COMBINED_CURRENT_URL, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    throw new Error(`CFTC current combined HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  return parseCftcDisaggregatedCombinedText(await res.text());
}

export function extractFirstZipText(zip: Uint8Array): string {
  const buffer = Buffer.from(zip);
  const centralSignature = 0x02014b50;
  let centralOffset = -1;
  for (let i = buffer.length - 46; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === centralSignature) {
      centralOffset = i;
      break;
    }
  }
  if (centralOffset < 0) throw new Error("CFTC ZIP central directory not found");

  const method = buffer.readUInt16LE(centralOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralOffset + 20);
  const localOffset = buffer.readUInt32LE(centralOffset + 42);
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error("CFTC ZIP local header not found");
  }
  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
  const uncompressed =
    method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
  if (!uncompressed) throw new Error(`CFTC ZIP compression method unsupported: ${method}`);
  return Buffer.from(uncompressed).toString("utf8");
}

function archiveUrls(sinceIso: string): string[] {
  const sinceYear = Number(sinceIso.slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  const firstAnnualYear = Math.max(2017, sinceYear);
  const urls: string[] = [];
  if (sinceYear <= 2016) {
    urls.push(
      "https://www.cftc.gov/files/dea/history/com_disagg_txt_hist_2006_2016.zip",
    );
  }
  for (let year = firstAnnualYear; year <= currentYear; year++) {
    urls.push(`https://www.cftc.gov/files/dea/history/com_disagg_txt_${year}.zip`);
  }
  return urls;
}

async function fetchCombinedArchives(sinceIso: string): Promise<CftcCotRow[]> {
  const rows: CftcCotRow[] = [];
  for (const url of archiveUrls(sinceIso)) {
    const res = await fetch(url, {
      headers: { Accept: "application/zip" },
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      throw new Error(`CFTC combined archive HTTP ${res.status}: ${url}`);
    }
    rows.push(
      ...parseCftcDisaggregatedCombinedText(
        extractFirstZipText(new Uint8Array(await res.arrayBuffer())),
      ),
    );
  }
  return rows.filter((row) => row.reportDateIso >= sinceIso);
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
  let rows: CftcCotRow[];
  if (res.ok) {
    const raw = (await res.json()) as Record<string, unknown>[];
    rows = [];
    for (const item of raw) {
      const row = normalizeRow(item);
      if (row) rows.push(row);
    }
  } else {
    // Socrata occasionally rejects otherwise valid server-side requests with
    // 403. The CFTC-published current combined file is the same report and
    // keeps scheduled incremental updates working without changing the series.
    try {
      rows = await fetchCombinedArchives(since);
    } catch {
      rows = await fetchCurrentCombinedText();
    }
  }

  cache = { sinceIso: since, rows, fetchedAt: now };
  return rows.filter((r) => r.reportDateIso >= since);
}

export function latestReportDate(rows: CftcCotRow[]): Date | null {
  if (!rows.length) return null;
  return rows.reduce((best, r) => (r.reportDate > best ? r.reportDate : best), rows[0]!.reportDate);
}
