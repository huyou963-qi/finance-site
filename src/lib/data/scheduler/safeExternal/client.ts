import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
import { SAFE_DATASETS, type SafeDataset } from "./catalog";

export type SafeSeries = { code: string; key: string; dataset: SafeDataset; label: string; category: string; unit: string; freqLabel: "月" | "季" | "年"; points: ObservationPoint[] };
type History = Map<string, SafeSeries>;
const cache = new Map<string, { at: number; values: History }>();
const HEADERS = { "User-Agent": process.env.SAFE_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function compact(value: unknown): string { return String(value ?? "").replace(/\r?\n/g, "").replace(/\s+/g, " ").trim(); }
function normalizeUnit(value: unknown): string {
  const raw = compact(value);
  const parenthesized = /单位\s*[（(]\s*([^）)]+)\s*[）)]/.exec(raw)?.[1];
  if (parenthesized) return parenthesized.trim();
  return raw.replace(/^.*单位\s*[：:]/, "").replace(/[）)]$/, "").trim() || "原表单位";
}
function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Number(value.toFixed(10));
  const raw = String(value ?? "").replace(/,/g, "").trim();
  // XLSX represents an empty cell as null/"". Number("") is 0, which would
  // incorrectly turn the source's future placeholder columns into observations.
  if (!raw || raw === "-" || raw === "—") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(10)) : null;
}
function period(value: unknown): Date | null {
  if (typeof value === "number" && value > 30_000 && value < 60_000) { const p = XLSX.SSF.parse_date_code(value); return p ? new Date(Date.UTC(p.y, p.m - 1, 1)) : null; }
  if (typeof value === "number" && value >= 1900 && value <= 2100 && Number.isInteger(value)) return new Date(Date.UTC(value, 0, 1));
  const raw = compact(value);
  const quarter = /^((?:19|20)\d{2})Q([1-4])$/i.exec(raw);
  if (quarter) return new Date(Date.UTC(Number(quarter[1]), Number(quarter[2]) * 3 - 1, 1));
  const plainYear = /^((?:19|20)\d{2})$/.exec(raw);
  if (plainYear) return new Date(Date.UTC(Number(plainYear[1]), 0, 1));
  const m = /^((?:19|20)\d{2})年(?:\s*(\d{1,2})月)?(?:末|度|第?[一二三四]季度)?$/.exec(raw);
  const decimalMonth = /^(20\d{2})\.(\d{1,2})$/.exec(raw);
  if (decimalMonth) return new Date(Date.UTC(Number(decimalMonth[1]), Number(decimalMonth[2]) - 1, 1));
  if (!m) return null; const month = m[2] ? Number(m[2]) : /一季度/.test(raw) ? 3 : /二季度/.test(raw) ? 6 : /三季度/.test(raw) ? 9 : /四季度/.test(raw) ? 12 : 1;
  return month >= 1 && month <= 12 ? new Date(Date.UTC(Number(m[1]), month - 1, 1)) : null;
}
function frequency(points: readonly Date[]): "月" | "季" | "年" { if (points.length < 2) return "年"; const gaps = points.slice(1).map((item, index) => (item.getUTCFullYear() - points[index]!.getUTCFullYear()) * 12 + item.getUTCMonth() - points[index]!.getUTCMonth()); const smallest = Math.min(...gaps.filter((gap) => gap > 0)); return smallest <= 1 ? "月" : smallest <= 3 ? "季" : "年"; }
function codeFor(dataset: SafeDataset, key: string) { return `safe_cn_${dataset}_${createHash("sha1").update(key).digest("hex").slice(0, 12)}`; }
const BOP_CANONICAL_CODES: Readonly<Record<string, string>> = {
  "1.经常账户": "safe_cn_bop_current_account",
  "1.A.a货物": "safe_cn_bop_goods_balance",
  "1.A.b服务": "safe_cn_bop_services_balance",
  "2.2.1.1直接投资": "safe_cn_bop_direct_investment_net",
  "2.2.1.2证券投资": "safe_cn_bop_portfolio_investment_net",
  "2.2.1.4其他投资": "safe_cn_bop_other_investment_net",
};
function seriesCode(dataset: SafeDataset, sheetName: string, label: string, key: string): string {
  if (dataset === "bop" && sheetName.replace(/\s+/g, "") === "季度BOP（美元）") {
    const canonical = BOP_CANONICAL_CODES[label.replace(/\s+/g, "")];
    if (canonical) return canonical;
  }
  return codeFor(dataset, key);
}
async function text(url: string): Promise<string> { const response = await fetchChinaOfficial(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`外管局页面 HTTP ${response.status}: ${url}`); return response.text(); }
async function attachmentUrls(page: string): Promise<string[]> { const html = await text(page); const output: string[] = []; for (const match of html.matchAll(/href=["']([^"']+\.(?:xlsx?|xls))["']/gi)) output.push(new URL(match[1]!, page).toString()); return [...new Set(output)]; }
async function workbook(url: string): Promise<XLSX.WorkBook> { const response = await fetchChinaOfficial(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) }); if (!response.ok) throw new Error(`外管局表格 HTTP ${response.status}: ${url}`); return XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer", cellDates: false }); }

export function parseSafeExternalSheet(dataset: typeof SAFE_DATASETS[number], sheetName: string, sheet: XLSX.WorkSheet): SafeSeries[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  // Date serials and monetary values are both numbers in Excel. A valid header is
  // therefore restricted to the source's explicit “项目” row (or a blank leading cell
  // in the quarterly tables), never a numeric data row.
  const headerIndex = rows.findIndex((row) => {
    const first = compact(row[0]);
    return (first === "" || /项目/.test(first)) && row.filter((cell) => period(cell)).length >= 2;
  });
  if (headerIndex < 0) return [];
  const header = rows[headerIndex]!; const globalUnit = normalizeUnit(rows.slice(0, headerIndex).flat().find((cell) => /单位/.test(compact(cell))) ?? "原表单位");
  const columns: { index: number; date: Date; unit: string }[] = []; let activeDate: Date | null = null;
  for (let index = 0; index < header.length; index++) { const date = period(header[index]); if (date) activeDate = date; const next = compact(rows[headerIndex + 1]?.[index]); const hasColumnUnit = /亿|元|SDR|盎司|%/.test(next); if (date || (activeDate && hasColumnUnit)) columns.push({ index, date: activeDate!, unit: hasColumnUnit ? next : globalUnit }); }
  if (columns.length < 2) return [];
  const seen = new Map<string, number>(); const output: SafeSeries[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const label = compact(row[0]); if (!label || /^注|^项目$|^单位/.test(label)) continue;
    const occurrence = (seen.get(label) ?? 0) + 1; seen.set(label, occurrence); const pointsByUnit = new Map<string, ObservationPoint[]>();
    for (const { index, date, unit } of columns) { const value = number(row[index]); if (value === null) continue; const values = pointsByUnit.get(unit) ?? []; values.push({ obsDate: date, value }); pointsByUnit.set(unit, values); }
    for (const [unit, rawPoints] of pointsByUnit) {
      const points = dataset.key === "reserve"
        ? rawPoints.filter((point) => !(point.value === 0 && point.obsDate >= new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))))
        : rawPoints;
      if (!points.length) continue;
      const key = `${dataset.key}|${sheetName}|${label}|${occurrence}|${unit}`;
      output.push({ code: seriesCode(dataset.key, sheetName, label, key), key, dataset: dataset.key, label: `${dataset.label}：${sheetName}：${label}`, category: dataset.category, unit, freqLabel: frequency(points.map((point) => point.obsDate)), points });
    }
  }
  return output;
}

/** Reads the official time-series workbooks. Existing rows are updated by stable dataset/sheet/label keys. */
export async function fetchSafeExternalHistory(options?: { datasets?: readonly SafeDataset[] }): Promise<History> {
  const selected = options?.datasets?.length ? SAFE_DATASETS.filter((dataset) => options.datasets!.includes(dataset.key)) : SAFE_DATASETS;
  const cacheKey = selected.map((dataset) => dataset.key).sort().join(",");
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) return cached.values;
  const history: History = new Map();
  for (const dataset of selected) for (const page of dataset.pages) {
    for (const url of await attachmentUrls(page)) {
      await sleep(400); const book = await workbook(url);
      for (const sheetName of book.SheetNames) for (const series of parseSafeExternalSheet(dataset, sheetName, book.Sheets[sheetName]!)) {
        const prior = history.get(series.code);
        if (!prior) history.set(series.code, series); else { const merged = new Map([...prior.points, ...series.points].map((point) => [point.obsDate.getTime(), point])); prior.points = [...merged.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()); }
      }
    }
  }
  if (!history.size) throw new Error("外管局公开表格未解析出任何时间序列"); cache.set(cacheKey, { at: Date.now(), values: history }); return history;
}
