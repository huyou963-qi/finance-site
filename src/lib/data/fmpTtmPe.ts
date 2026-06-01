import type { CandlestickData, LineData } from "lightweight-charts";
import {
  buildTtmEpsTimeline,
  peLineFromQuarterlyPe,
  ttmPeLineFromCandles,
  type QuarterlyEpsRow,
  type QuarterlyPePoint,
  type TtmEpsPoint,
} from "@/lib/data/ttmPeSeries";

const FMP_BASE = "https://financialmodelingprep.com/stable";

/** FMP 免费/基础档 income-statement、ratios 的 limit 通常为 0–5 */
const FMP_QUARTERLY_LIMIT_DEFAULT = 5;
const FMP_QUARTERLY_LIMIT_MAX = 5;

function fmpQuarterlyLimit(): number {
  const raw = Number(process.env.FMP_QUARTERLY_LIMIT ?? FMP_QUARTERLY_LIMIT_DEFAULT);
  if (!Number.isFinite(raw) || raw < 1) return FMP_QUARTERLY_LIMIT_DEFAULT;
  return Math.min(FMP_QUARTERLY_LIMIT_MAX, Math.floor(raw));
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseFmpError(status: number, text: string, sym: string, endpoint: string): Error {
  if (status === 402 && /limit/i.test(text)) {
    return new Error(
      `FMP 套餐限制：${endpoint} 的 limit 最多为 ${FMP_QUARTERLY_LIMIT_MAX}（当前密钥）。` +
        ` 已按上限请求；升级订阅可拉更长历史。详情：${text.slice(0, 120)}`,
    );
  }
  return new Error(
    `FMP ${endpoint} 请求失败（${sym}）：HTTP ${status} ${text.slice(0, 160)}`,
  );
}

async function fmpGetJson(
  url: string,
  sym: string,
  endpoint: string,
): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw parseFmpError(res.status, text, sym, endpoint);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`FMP ${endpoint} 返回非 JSON：${text.slice(0, 120)}`);
  }
}

function parseQuarterlyEps(json: unknown): QuarterlyEpsRow[] {
  if (!Array.isArray(json)) return [];
  const out: QuarterlyEpsRow[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const dateRaw = r.date ?? r.fillingDate ?? r.acceptedDate;
    if (typeof dateRaw !== "string") continue;
    const date = dateRaw.trim().slice(0, 10);
    if (!date) continue;
    const eps =
      num(r.epsdiluted) ??
      num(r.eps) ??
      num(r.earningsPerShareDiluted) ??
      num(r.earningsPerShare);
    if (eps == null) continue;
    out.push({ date, eps });
  }
  return out;
}

function parseQuarterlyPe(json: unknown): QuarterlyPePoint[] {
  if (!Array.isArray(json)) return [];
  const out: QuarterlyPePoint[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const dateRaw = r.date ?? r.fillingDate;
    if (typeof dateRaw !== "string") continue;
    const date = dateRaw.trim().slice(0, 10);
    if (!date) continue;
    const pe =
      num(r.priceToEarningsRatio) ??
      num(r.peRatio) ??
      num(r.priceEarningsRatio) ??
      num(r.peRatioTTM);
    if (pe == null || pe <= 0) continue;
    out.push({ date, pe });
  }
  return out;
}

export async function fetchQuarterlyPeFromFmp(
  symbol: string,
  apiKey: string,
): Promise<QuarterlyPePoint[]> {
  const sym = symbol.trim().toUpperCase().split(".")[0]!;
  const limit = fmpQuarterlyLimit();
  const url = `${FMP_BASE}/ratios?symbol=${encodeURIComponent(sym)}&period=quarter&limit=${limit}&apikey=${encodeURIComponent(apiKey)}`;
  const json = await fmpGetJson(url, sym, "季度财务比率 ratios");
  return parseQuarterlyPe(json);
}

export async function fetchQuarterlyEpsFromFmp(
  symbol: string,
  apiKey: string,
): Promise<QuarterlyEpsRow[]> {
  const sym = symbol.trim().toUpperCase().split(".")[0]!;
  const limit = fmpQuarterlyLimit();
  const url = `${FMP_BASE}/income-statement?symbol=${encodeURIComponent(sym)}&period=quarter&limit=${limit}&apikey=${encodeURIComponent(apiKey)}`;
  const json = await fmpGetJson(url, sym, "季度利润表 income-statement");
  const rows = parseQuarterlyEps(json);
  if (!rows.length) {
    throw new Error(`FMP 未返回 ${sym} 的季度 EPS 数据`);
  }
  return rows;
}

export type TtmPePayload = {
  symbol: string;
  ttmTimeline: TtmEpsPoint[];
  quarterlyPe?: QuarterlyPePoint[];
  line: LineData[];
  attribution: string;
};

export async function buildTtmPePayload(
  symbol: string,
  candles?: CandlestickData[],
): Promise<TtmPePayload> {
  const apiKey = process.env.FMP_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少环境变量 FMP_API_KEY（用于 TTM PE）");
  }
  const sym = symbol.trim().toUpperCase().split(".")[0]!;
  const limit = fmpQuarterlyLimit();

  let quarterlyPe: QuarterlyPePoint[] = [];
  try {
    quarterlyPe = await fetchQuarterlyPeFromFmp(sym, apiKey);
  } catch {
    quarterlyPe = [];
  }

  if (quarterlyPe.length >= 1 && candles?.length) {
    const line = peLineFromQuarterlyPe(candles, quarterlyPe);
    if (line.length) {
      return {
        symbol: sym,
        ttmTimeline: [],
        quarterlyPe,
        line,
        attribution:
          `TTM PE（FMP ratios 季度，limit=${limit}；免费档最多约 ${limit} 季）`,
      };
    }
  }

  const quarterly = await fetchQuarterlyEpsFromFmp(sym, apiKey);
  const ttmTimeline = buildTtmEpsTimeline(quarterly);
  if (!ttmTimeline.length) {
    throw new Error(
      `${sym} 季度 EPS 不足四季（FMP limit=${limit}），无法计算 TTM PE`,
    );
  }
  const line = candles?.length
    ? ttmPeLineFromCandles(candles, ttmTimeline)
    : [];
  return {
    symbol: sym,
    ttmTimeline,
    line,
    attribution:
      `TTM PE = 收盘价 ÷ 近四季 EPS（FMP income-statement，limit=${limit}）`,
  };
}
