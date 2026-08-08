import { createHash } from "node:crypto";
import type { ObservationPoint } from "../types";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
import { MOFCOM_TRADE_BASE_URL, MOFCOM_TRADE_CATEGORY } from "./catalog";

export type MofcomTradeSeries = {
  code: string;
  key: string;
  label: string;
  category: string;
  unit: string;
  points: ObservationPoint[];
};
export type MofcomTradeHistory = Map<string, MofcomTradeSeries>;
type JsonRow = Record<string, unknown>;
type Options = { historical?: boolean; fetchJson?: (path: string, body?: URLSearchParams) => Promise<unknown> };

const USER_AGENT = "finance-site-data-scheduler/1.0";
const HISTORY_START = "2000-01-01";
const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; values: MofcomTradeHistory }>();
let lastOfficialRequestAt = 0;

async function politePause(): Promise<void> {
  const wait = Math.max(0, 1_000 - (Date.now() - lastOfficialRequestAt));
  if (wait) await new Promise<void>((resolve) => setTimeout(resolve, wait));
  lastOfficialRequestAt = Date.now();
}

function codeFor(key: string) { return `mofcom_cn_trade_${createHash("sha1").update(key).digest("hex").slice(0, 18)}`; }
function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Number(n.toFixed(10)) : null;
}
function date(value: unknown): Date | null {
  const match = /^(20\d{2})(0[1-9]|1[0-2])$/.exec(String(value ?? ""));
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)) : null;
}
function add(history: MofcomTradeHistory, base: Omit<MofcomTradeSeries, "code" | "points">, point: ObservationPoint) {
  const code = codeFor(base.key); const prior = history.get(code);
  if (!prior) { history.set(code, { code, ...base, points: [point] }); return; }
  const index = prior.points.findIndex((item) => item.obsDate.getTime() === point.obsDate.getTime());
  if (index >= 0) prior.points[index] = point; else prior.points.push(point);
}
function field(history: MofcomTradeHistory, key: string, label: string, unit: string, row: JsonRow, sourceField: string, obsDate: Date, scale = 1) {
  const raw = number(row[sourceField]); if (raw === null) return;
  add(history, { key, label, category: MOFCOM_TRADE_CATEGORY, unit }, { obsDate, value: Number((raw * scale).toFixed(10)) });
}
async function defaultFetch(path: string, body?: URLSearchParams): Promise<unknown> {
  await politePause();
  const response = await fetchChinaOfficial(`${MOFCOM_TRADE_BASE_URL}/${path}`, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json,*/*", ...(body ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}) },
    body: body?.toString(), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`商务部货物贸易接口 HTTP ${response.status}: ${path}`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object") throw new Error(`商务部货物贸易接口返回非 JSON 对象: ${path}`);
  return result;
}
function rows(value: unknown): JsonRow[] {
  if (Array.isArray(value)) return value.flatMap((item) => Array.isArray(item) ? item : []).filter((item): item is JsonRow => !!item && typeof item === "object");
  if (value && typeof value === "object" && Array.isArray((value as { rows?: unknown }).rows)) return (value as { rows: unknown[] }).rows.filter((item): item is JsonRow => !!item && typeof item === "object");
  throw new Error("商务部货物贸易接口结构已变化：未找到 rows 数组");
}
function parseTotal(data: unknown, out: MofcomTradeHistory) {
  const input = rows(data); if (!input.length) throw new Error("商务部货物贸易月度总值接口为空");
  const items = [["total", "进出口总额", "total"], ["export", "出口总额", "export"], ["import", "进口总额", "import"], ["balance", "贸易差额", "imexgap"]] as const;
  for (const row of input) {
    const obsDate = date(row.trade_date); if (!obsDate) continue;
    for (const [key, label, fieldPrefix] of items) {
      field(out, `total|${key}|amount`, `外贸：${label}：当月值`, "亿美元", row, `${fieldPrefix}_value`, obsDate);
      field(out, `total|${key}|yoy`, `外贸：${label}：当月同比`, "%", row, `${fieldPrefix}_per`, obsDate);
      field(out, `total|${key}|cumulative_amount`, `外贸：${label}：累计值`, "亿美元", row, `${fieldPrefix}_lj_value`, obsDate);
      field(out, `total|${key}|cumulative_yoy`, `外贸：${label}：累计同比`, "%", row, `${fieldPrefix}_lj_per`, obsDate);
    }
  }
}
function parseTradeMethod(data: unknown, out: MofcomTradeHistory) {
  const input = rows(data); if (!input.length) throw new Error("商务部货物贸易方式接口为空");
  for (const row of input) {
    const obsDate = date(row.trade_date); const method = String(row.type ?? "").trim(); if (!obsDate || !method) continue;
    for (const [kind, label, prefix] of [["export", "出口", "export"], ["import", "进口", "import"]] as const) {
      field(out, `method|${method}|${kind}|amount`, `外贸：贸易方式：${method}：${label}当月值`, "亿美元", row, `${prefix}_value`, obsDate);
      field(out, `method|${method}|${kind}|yoy`, `外贸：贸易方式：${method}：${label}当月同比`, "%", row, `${prefix}_per`, obsDate);
      field(out, `method|${method}|${kind}|cumulative_amount`, `外贸：贸易方式：${method}：${label}累计值`, "亿美元", row, `${prefix}_lj_value`, obsDate);
      field(out, `method|${method}|${kind}|cumulative_yoy`, `外贸：贸易方式：${method}：${label}累计同比`, "%", row, `${prefix}_lj_per`, obsDate);
    }
  }
}
function parseCountry(data: unknown, out: MofcomTradeHistory) {
  const input = rows(data); if (!input.length) throw new Error("商务部货物贸易国别接口为空");
  for (const row of input) {
    const obsDate = date(row.trade_date); const country = String(row.type ?? "").trim(); if (!obsDate || !country) continue;
    for (const [kind, label, prefix] of [["total", "进出口", "total"], ["export", "出口", "export"], ["import", "进口", "import"]] as const) {
      field(out, `country|${country}|${kind}|cumulative_amount`, `外贸：国别地区：${country}：${label}累计值`, "亿美元", row, `${prefix}_lj_value`, obsDate);
      field(out, `country|${country}|${kind}|cumulative_yoy`, `外贸：国别地区：${country}：${label}累计同比`, "%", row, `${prefix}_lj_per`, obsDate);
    }
  }
}
function parseComposition(data: unknown, out: MofcomTradeHistory) {
  const input = rows(data); if (!input.length) throw new Error("商务部货物贸易商品构成接口为空");
  for (const row of input) {
    const obsDate = date(row.data_time); const item = String(row.name ?? "").trim(); if (!obsDate || !item) continue;
    // This endpoint is expressed in thousand USD; convert to 亿美元 (1 亿美元 = 100,000 千美元).
    for (const [kind, label, prefix] of [["export", "出口", "export"], ["import", "进口", "import"]] as const) {
      field(out, `commodity|${item}|${kind}|amount`, `外贸：商品构成：${item}：${label}当月值`, "亿美元", row, `${prefix}_value`, obsDate, 1 / 100_000);
      field(out, `commodity|${item}|${kind}|cumulative_amount`, `外贸：商品构成：${item}：${label}累计值`, "亿美元", row, `${prefix}_lj_value`, obsDate, 1 / 100_000);
      field(out, `commodity|${item}|${kind}|cumulative_yoy`, `外贸：商品构成：${item}：${label}累计同比`, "%", row, `${prefix}_lj_per`, obsDate);
    }
  }
}
function months(startYear: number, end: Date): string[] {
  const result: string[] = [];
  for (let year = startYear; year <= end.getUTCFullYear(); year++) for (let month = 1; month <= 12; month++) {
    if (year === end.getUTCFullYear() && month > end.getUTCMonth() + 1) break;
    result.push(`${year}${String(month).padStart(2, "0")}`);
  }
  return result;
}

/**
 * Official structure (checked 2026-08): totalmonth accepts a date range;
 * the three classification endpoints accept one YYYYMM and return all rows.
 * Historical scans are serial and caller-authorized; normal worker fetches only
 * the latest release month, so it does not repeatedly crawl history.
 */
export async function fetchMofcomTradeHistory(options: Options = {}): Promise<MofcomTradeHistory> {
  const cacheKey = options.historical ? "history" : "latest";
  const saved = !options.fetchJson ? cache.get(cacheKey) : undefined;
  if (saved && Date.now() - saved.at < CACHE_MS) return saved.values;
  const request = options.fetchJson ?? defaultFetch; const output: MofcomTradeHistory = new Map();
  const totalBody = options.historical ? new URLSearchParams({ startDate: HISTORY_START, endDate: "2099-12-31" }) : undefined;
  parseTotal(await request("totalmonth/query", totalBody), output);
  // The official endpoint returns newest-first. Do not use Array.at(-1), or a
  // historical seed would stop at the oldest row in the response.
  const totalPoints = [...output.values()].find((item) => item.key === "total|total|amount")?.points ?? [];
  const latest = totalPoints.reduce<Date | undefined>(
    (current, point) => !current || point.obsDate > current ? point.obsDate : current,
    undefined,
  );
  if (!latest) throw new Error("商务部货物贸易：月度总值未返回有效观测日期");
  const periods = options.historical ? months(2016, latest) : [latest.toISOString().slice(0, 7).replace("-", "")];
  const unavailable = { tradeMethod: 0, country: 0, composition: 0 };
  for (const period of periods) {
    const body = new URLSearchParams({ query_date: period }); const tradeMethod = await request("totaltrademethod/query", body);
    if (rows(tradeMethod).length) parseTradeMethod(tradeMethod, output); else unavailable.tradeMethod++;
    const byDate = new URLSearchParams({ date: period }); const country = await request("totalbycountry/query", byDate);
    if (rows(country).length) parseCountry(country, output); else unavailable.country++;
    const composition = await request("composition/query", byDate);
    if (rows(composition).length) parseComposition(composition, output); else unavailable.composition++;
  }
  if (!options.historical && (unavailable.tradeMethod || unavailable.country || unavailable.composition)) {
    throw new Error(`商务部货物贸易本期缺少分类数据：贸易方式=${unavailable.tradeMethod}，国别=${unavailable.country}，商品构成=${unavailable.composition}`);
  }
  if (options.historical && (unavailable.tradeMethod || unavailable.country || unavailable.composition)) {
    console.warn(`[mofcom-trade] 官方分类历史未覆盖的月份：贸易方式=${unavailable.tradeMethod}，国别=${unavailable.country}，商品构成=${unavailable.composition}`);
  }
  for (const series of output.values()) series.points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (!output.size) throw new Error("商务部货物贸易：未解析到任何官方序列");
  if (!options.fetchJson) cache.set(cacheKey, { at: Date.now(), values: output });
  return output;
}
