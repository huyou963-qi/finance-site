/**
 * 免费日线收盘价：Yahoo Finance（免密钥）为主，可选 Tiingo。
 * 用于 Sector ETF / SPY，不依赖 IBKR。
 */

import type { ClosePoint } from "@/lib/equity/sectorReturns";

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateToUtcSec(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** 按交易日数量粗算 Yahoo range 参数 */
function yahooRangeForLimit(limit: number): string {
  if (limit <= 30) return "1mo";
  if (limit <= 70) return "3mo";
  if (limit <= 140) return "6mo";
  if (limit <= 280) return "1y";
  if (limit <= 560) return "2y";
  return "5y";
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
    error?: unknown;
  };
};

/** 单根日线（time 为 Yahoo 原始时间戳秒；close 原始收盘，adjClose 复权收盘） */
export type DailyBarPoint = {
  time: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjClose: number;
  volume: number | null;
};

async function fetchYahooChart(symbol: string, range: string): Promise<YahooChartResponse> {
  const sym = symbol.trim().toUpperCase();
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
    `?interval=1d&range=${range}&events=div%7Csplit`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; finance-site/1.0; +https://localhost)",
      Accept: "application/json",
    },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Yahoo ${sym} HTTP ${res.status} ${text.slice(0, 120)}`);
  }
  try {
    return JSON.parse(text) as YahooChartResponse;
  } catch {
    throw new Error(`Yahoo ${sym} 返回非 JSON`);
  }
}

/** Yahoo 日线 OHLCV + 复权收盘（供价格持久层落库） */
export async function fetchYahooDailyBars(
  symbol: string,
  limit = 320,
): Promise<DailyBarPoint[]> {
  const json = await fetchYahooChart(symbol, yahooRangeForLimit(limit));
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adj = result?.indicators?.adjclose?.[0]?.adjclose ?? [];

  const out: DailyBarPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    if (typeof t !== "number" || !Number.isFinite(t)) continue;
    const close = num(quote.close?.[i]);
    const adjClose = num(adj[i]) ?? close;
    if (close == null && adjClose == null) continue;
    out.push({
      time: Math.floor(t),
      open: num(quote.open?.[i]),
      high: num(quote.high?.[i]),
      low: num(quote.low?.[i]),
      close: close ?? adjClose!,
      adjClose: adjClose ?? close!,
      volume: num(quote.volume?.[i]),
    });
  }
  out.sort((a, b) => a.time - b.time);
  if (limit > 0 && out.length > limit) return out.slice(-limit);
  return out;
}

/**
 * Yahoo Finance chart API（免密钥）
 * https://query1.finance.yahoo.com/v8/finance/chart/XLK?interval=1d&range=1y
 */
export async function fetchYahooDailyCloses(
  symbol: string,
  limit = 320,
): Promise<ClosePoint[]> {
  const json = await fetchYahooChart(symbol, yahooRangeForLimit(limit));
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const adj =
    result?.indicators?.adjclose?.[0]?.adjclose ??
    result?.indicators?.quote?.[0]?.close ??
    [];

  const out: ClosePoint[] = [];
  const n = Math.min(timestamps.length, adj.length);
  for (let i = 0; i < n; i++) {
    const t = timestamps[i];
    const c = adj[i];
    if (typeof t !== "number" || !Number.isFinite(t)) continue;
    if (c == null || !Number.isFinite(c)) continue;
    out.push({ time: Math.floor(t), close: c });
  }
  out.sort((a, b) => a.time - b.time);
  if (limit > 0 && out.length > limit) return out.slice(-limit);
  return out;
}

/**
 * Tiingo EOD（需 TIINGO_API_TOKEN）；优先 adjClose。
 */
export async function fetchTiingoDailyCloses(
  symbol: string,
  limit = 320,
): Promise<ClosePoint[]> {
  const token = process.env.TIINGO_API_TOKEN?.trim();
  if (!token) throw new Error("未配置 TIINGO_API_TOKEN");

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - Math.ceil(limit * 1.6) - 30);
  const startDate = start.toISOString().slice(0, 10);
  const url =
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices` +
    `?startDate=${startDate}&token=${encodeURIComponent(token)}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Tiingo ${symbol} HTTP ${res.status} ${text.slice(0, 120)}`);
  }
  let rows: { date?: string; close?: number; adjClose?: number }[];
  try {
    rows = JSON.parse(text) as typeof rows;
  } catch {
    throw new Error(`Tiingo ${symbol} 非 JSON`);
  }
  if (!Array.isArray(rows)) return [];

  const out: ClosePoint[] = [];
  for (const r of rows) {
    const dateRaw = typeof r.date === "string" ? r.date.slice(0, 10) : "";
    const time = dateToUtcSec(dateRaw);
    const close = num(r.adjClose) ?? num(r.close);
    if (time == null || close == null) continue;
    out.push({ time, close });
  }
  out.sort((a, b) => a.time - b.time);
  if (limit > 0 && out.length > limit) return out.slice(-limit);
  return out;
}

export type EtfCloseSource = "yahoo" | "tiingo";

/**
 * 单标的日线：默认 Yahoo；`EQUITY_ETF_EOD_SOURCE=tiingo` 且配置 token 时优先 Tiingo。
 */
export async function fetchFreeEtfDailyCloses(
  symbol: string,
  limit = 320,
): Promise<{ points: ClosePoint[]; source: EtfCloseSource | null }> {
  const prefer = (process.env.EQUITY_ETF_EOD_SOURCE ?? "yahoo").trim().toLowerCase();

  if (prefer === "tiingo") {
    try {
      const points = await fetchTiingoDailyCloses(symbol, limit);
      if (points.length >= 2) return { points, source: "tiingo" };
    } catch {
      /* fall through */
    }
  }

  try {
    const points = await fetchYahooDailyCloses(symbol, limit);
    if (points.length >= 2) return { points, source: "yahoo" };
  } catch {
    /* try tiingo fallback */
  }

  if (prefer !== "tiingo" && process.env.TIINGO_API_TOKEN?.trim()) {
    try {
      const points = await fetchTiingoDailyCloses(symbol, limit);
      if (points.length >= 2) return { points, source: "tiingo" };
    } catch {
      /* ignore */
    }
  }

  return { points: [], source: null };
}

const BATCH_DELAY_MS = 80;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 批量拉取多标的日线（串行限速，默认 Yahoo） */
export async function fetchSymbolDailyCloses(
  symbols: string[],
  limit = 320,
): Promise<{
  closes: Record<string, ClosePoint[]>;
  source: EtfCloseSource | null;
  missing: string[];
}> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const closes: Record<string, ClosePoint[]> = {};
  const missing: string[] = [];
  let source: EtfCloseSource | null = null;

  for (const symbol of unique) {
    const { points, source: symSource } = await fetchFreeEtfDailyCloses(symbol, limit);
    if (points.length >= 2) {
      closes[symbol] = points;
      source = source ?? symSource;
    } else {
      missing.push(symbol);
    }
    await sleep(BATCH_DELAY_MS);
  }

  return { closes, source, missing };
}
