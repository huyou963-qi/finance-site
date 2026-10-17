import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { US_TRADE_FILES, usTradePlacement, type UsTradeSeries } from "./catalog";

type Rows = (string | number | null | undefined)[][];
export type UsTradeFetchOptions = { allowLocalSnapshot?: boolean };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const cache = new Map<string, { at: number; promise: Promise<Rows> }>();

async function rowsFromUrl(url: string, allowLocalSnapshot: boolean): Promise<Rows> {
  // Offline seed data must never satisfy a worker's live-source request.
  const cacheKey = `${allowLocalSnapshot ? "offline" : "live"}:${url}`;
  const old = cache.get(cacheKey);
  if (old && Date.now() - old.at < 3_600_000) return old.promise;
  const promise = (async () => {
    let bytes: Buffer;
    try {
      const response = await fetch(url, { headers: { "User-Agent": "finance-site/1.0 (official Census trade data)" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Census trade ${response.status}: ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (!allowLocalSnapshot) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Census live source unavailable; local snapshot fallback disabled: ${url}; ${reason}`, { cause: error });
      }
      const dataDir = process.env.US_TRADE_DATA_DIR?.trim();
      if (!dataDir) throw error;
      const filename = new URL(url).pathname.split("/").at(-1)!;
      if (!Object.values(US_TRADE_FILES).some((sourceUrl) => sourceUrl === url)) throw error;
      try {
        bytes = await readFile(join(dataDir, filename));
      } catch {
        throw new Error(`Census trade source unavailable and local snapshot missing: ${filename}`, { cause: error });
      }
      console.warn(`[us-trade-detail] Census direct fetch unavailable; using local official snapshot ${filename}`);
    }
    const workbook = XLSX.read(bytes, { type: "buffer", sheetRows: url.endsWith("ctyseasonal.xlsx") ? 1000 : url.endsWith("country.xlsx") ? 10_000 : undefined });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!];
    if (!sheet) throw new Error(`Census workbook missing first sheet: ${url}`);
    return XLSX.utils.sheet_to_json<Rows[number]>(sheet, { header: 1, defval: null, blankrows: false });
  })();
  cache.set(cacheKey, { at: Date.now(), promise });
  try { return await promise; } catch (error) { cache.delete(cacheKey); throw error; }
}

export function parseUsTradeEnduse(rows: Rows, side: "exports" | "imports"): UsTradeSeries[] {
  if (rows[0]?.join("|") !== "DATE|ENDUSE|DESCRIPTION|VALUE") throw new Error(`Census ${side} schema changed`);
  const byCode = new Map<string, UsTradeSeries>();
  for (const row of rows.slice(1)) {
    const match = /^([A-Za-z]{3})-(\d{2})$/.exec(String(row[0] ?? ""));
    const month = match ? MONTHS.indexOf(match[1]!) : -1;
    const sourceCode = String(row[1] ?? "").trim();
    const value = Number(row[3]);
    if (month < 0 || !/^(\d{5}|5)$/.test(sourceCode) || !Number.isFinite(value) || value < 0) continue;
    const year = Number(match![2]) >= 90 ? 1900 + Number(match![2]) : 2000 + Number(match![2]);
    const code = `census_us_trade_${side}_enduse_${sourceCode}`;
    let series = byCode.get(code);
    if (!series) {
      const description = String(row[2] ?? "").trim();
      if (!description) continue;
      series = { code, label: `${side === "exports" ? "出口" : "进口"}：${description}`, nameEn: description,
        kind: side, sourceCode, subgroup: usTradePlacement(code)!, seasonalAdjustment: "SA", points: [] };
      byCode.set(code, series);
    }
    // End-use source values are dollars; DB unit is USD million, matching existing FT-900 aggregate series.
    series.points.push({ obsDate: new Date(Date.UTC(year, month, 1)), value: value / 1_000_000 });
  }
  for (const series of byCode.values()) series.points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (byCode.size < 100) throw new Error(`Census ${side} end-use series unexpectedly sparse: ${byCode.size}`);
  return [...byCode.values()];
}

// The monthly country workbooks contain numeric zeros for unpublished months.
// Bound them by the independently dated FT-900 end-use files, NOT by a
// partner's last nonzero trade (a published zero is a legitimate observation).
export function parseUsTradeCountries(rows: Rows, publishedThrough: Date): UsTradeSeries[] {
  assertPublicationBoundary(publishedThrough);
  const header = rows[0]?.map(String) ?? [];
  if (header[0] !== "year" || header[1] !== "cty_code" || header[19] !== "EJAN" || header[35] !== "IJAN") {
    throw new Error("Census country seasonal workbook schema changed");
  }
  const byCode = new Map<string, UsTradeSeries>();
  for (const row of rows.slice(1)) {
    const year = Number(row[0]);
    const sourceCode = String(row[1] ?? "").padStart(4, "0");
    // The workbook also includes regional groups and "all other"; keep actual named partners only.
    if (!Number.isInteger(year) || year < 2009 || !/^\d{4}$/.test(sourceCode) || Number(sourceCode) < 1000) continue;
    const name = String(row[2] ?? "").trim();
    if (!name) continue;
    for (const [side, start] of [["exports", 19], ["imports", 35]] as const) {
      const code = `census_us_trade_${side}_country_${sourceCode}`;
      let series = byCode.get(code);
      if (!series) {
        series = { code, label: `${side === "exports" ? "出口" : "进口"}：${name}`, nameEn: name,
          kind: "countries", sourceCode, subgroup: usTradePlacement(code)!, seasonalAdjustment: "SA", points: [] };
        byCode.set(code, series);
      }
      for (let month = 0; month < 12; month++) {
        if (Date.UTC(year, month, 1) > publishedThrough.getTime()) continue;
        const value = row[start + month];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          // Country workbook values are dollars; leave historical revisions as published.
          // Seasonal adjustment leaves sub-dollar floating tails. Normalize to $0.001
          // so identical workbook rereads do not create false revisions.
          series.points.push({ obsDate: new Date(Date.UTC(year, month, 1)), value: Number((value / 1_000_000).toFixed(9)) });
        }
      }
    }
  }
  for (const series of byCode.values()) series.points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (byCode.size < 30) throw new Error(`Census selected partner series unexpectedly sparse: ${byCode.size}`);
  return [...byCode.values()];
}

// Census country balance c2771.html ends in April 2011. Later workbook zeros
// are not continuing observations for the dissolved Netherlands Antilles.
export const US_TRADE_COUNTRY_END_PERIODS: Readonly<Record<string, string>> = { "2771": "2011-04-01" };

function assertPublicationBoundary(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Census country observations require a confirmed FT-900 publication boundary");
  }
}

export function parseUsTradeCountriesNsa(rows: Rows, publishedThrough: Date): UsTradeSeries[] {
  assertPublicationBoundary(publishedThrough);
  const header = rows[0]?.map(String) ?? [];
  if (header[0] !== "year" || header[1] !== "CTY_CODE" || header[3] !== "IJAN" || header[16] !== "EJAN") {
    throw new Error("Census all-country workbook schema changed");
  }
  const byCode = new Map<string, UsTradeSeries>();
  for (const row of rows.slice(1)) {
    const year = Number(row[0]);
    const sourceCode = String(row[1] ?? "").padStart(4, "0");
    const codeNumber = Number(sourceCode);
    // Exclude world totals, regional groupings and international organizations.
    if (!Number.isInteger(year) || year < 1985 || !/^\d{4}$/.test(sourceCode) || codeNumber < 1000 || codeNumber >= 8000) continue;
    const name = String(row[2] ?? "").trim();
    if (!name) continue;
    for (const [side, start] of [["exports", 16], ["imports", 3]] as const) {
      const code = `census_us_trade_${side}_country_nsa_${sourceCode}`;
      let series = byCode.get(code);
      if (!series) {
        series = { code, label: `${side === "exports" ? "出口" : "进口"}：${name}（未季调）`, nameEn: name,
          kind: "country_nsa", sourceCode, subgroup: usTradePlacement(code)!, seasonalAdjustment: "NSA", points: [] };
        byCode.set(code, series);
      }
      for (let month = 0; month < 12; month++) {
        const time = Date.UTC(year, month, 1);
        const end = US_TRADE_COUNTRY_END_PERIODS[sourceCode];
        if (time > publishedThrough.getTime() || (end && time > Date.parse(end))) continue;
        const value = row[start + month];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          // This workbook reports USD millions. Normalize floating tails to $1 precision
          // before persistence, as for the SA workbook, to avoid false revisions.
          series.points.push({ obsDate: new Date(Date.UTC(year, month, 1)), value: Number(value.toFixed(6)) });
        }
      }
    }
  }
  for (const series of byCode.values()) series.points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (byCode.size < 400) throw new Error(`Census all-country series unexpectedly sparse: ${byCode.size}`);
  return [...byCode.values()];
}

const parsedCache = new Map<boolean, { at: number; promise: Promise<UsTradeSeries[]> }>();

export async function fetchUsTradeDetail(options: UsTradeFetchOptions = {}): Promise<UsTradeSeries[]> {
  const allowLocalSnapshot = options.allowLocalSnapshot === true;
  const old = parsedCache.get(allowLocalSnapshot);
  if (old && Date.now() - old.at < 3_600_000) return old.promise;
  const promise = loadUsTradeDetail(allowLocalSnapshot);
  parsedCache.set(allowLocalSnapshot, { at: Date.now(), promise });
  try { return await promise; } catch (error) { parsedCache.delete(allowLocalSnapshot); throw error; }
}

async function loadUsTradeDetail(allowLocalSnapshot: boolean): Promise<UsTradeSeries[]> {
  const [exports, imports, countries, countriesNsa] = await Promise.all([
    rowsFromUrl(US_TRADE_FILES.exports, allowLocalSnapshot), rowsFromUrl(US_TRADE_FILES.imports, allowLocalSnapshot),
    rowsFromUrl(US_TRADE_FILES.countries, allowLocalSnapshot), rowsFromUrl(US_TRADE_FILES.countriesNsa, allowLocalSnapshot),
  ]);
  const exportSeries = parseUsTradeEnduse(exports, "exports");
  const importSeries = parseUsTradeEnduse(imports, "imports");
  const lastPeriod = (series: UsTradeSeries[]) => series.reduce((latest, row) =>
    row.points.reduce((last, point) => Math.max(last, point.obsDate.getTime()), latest), -Infinity);
  // If the two rolling files update at different times, use the earlier
  // confirmed release until both sides have arrived.
  const publishedThrough = new Date(Math.min(lastPeriod(exportSeries), lastPeriod(importSeries)));
  assertPublicationBoundary(publishedThrough);
  return [...exportSeries, ...parseUsTradeCountriesNsa(countriesNsa, publishedThrough), ...importSeries, ...parseUsTradeCountries(countries, publishedThrough)];
}
