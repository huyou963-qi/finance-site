import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { US_TRADE_FILES, usTradePlacement, type UsTradeSeries } from "./catalog";

type Rows = (string | number | null | undefined)[][];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const cache = new Map<string, { at: number; promise: Promise<Rows> }>();

async function rowsFromUrl(url: string): Promise<Rows> {
  const old = cache.get(url);
  if (old && Date.now() - old.at < 3_600_000) return old.promise;
  const promise = (async () => {
    let bytes: Buffer;
    try {
      const response = await fetch(url, { headers: { "User-Agent": "finance-site/1.0 (official Census trade data)" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Census trade ${response.status}: ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
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
  cache.set(url, { at: Date.now(), promise });
  try { return await promise; } catch (error) { cache.delete(url); throw error; }
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

export function parseUsTradeCountries(rows: Rows): UsTradeSeries[] {
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

export function parseUsTradeCountriesNsa(rows: Rows): UsTradeSeries[] {
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

let parsedCache: { at: number; promise: Promise<UsTradeSeries[]> } | null = null;

export async function fetchUsTradeDetail(): Promise<UsTradeSeries[]> {
  if (parsedCache && Date.now() - parsedCache.at < 3_600_000) return parsedCache.promise;
  const promise = loadUsTradeDetail();
  parsedCache = { at: Date.now(), promise };
  try { return await promise; } catch (error) { parsedCache = null; throw error; }
}

async function loadUsTradeDetail(): Promise<UsTradeSeries[]> {
  const [exports, imports, countries, countriesNsa] = await Promise.all([
    rowsFromUrl(US_TRADE_FILES.exports), rowsFromUrl(US_TRADE_FILES.imports), rowsFromUrl(US_TRADE_FILES.countries), rowsFromUrl(US_TRADE_FILES.countriesNsa),
  ]);
  return [...parseUsTradeEnduse(exports, "exports"), ...parseUsTradeCountriesNsa(countriesNsa), ...parseUsTradeEnduse(imports, "imports"), ...parseUsTradeCountries(countries)];
}
