/**
 * 全美股符号联想：SEC company_tickers.json（约 1 万条，免密钥）为主，
 * 叠加本地 equity_security（GICS 成分，带交易所语义）。进程内缓存 24h。
 */

import { prisma } from "@/lib/prisma";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";

const SEC_UA =
  process.env.SEC_EDGAR_USER_AGENT?.trim() ||
  "finance-site research (contact: admin@localhost)";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type SecTicker = { symbol: string; name: string; exchange: string };

let cache: { at: number; rows: SecTicker[] } | null = null;
let inflight: Promise<SecTicker[]> | null = null;

async function loadSecTickers(): Promise<SecTicker[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.rows;
  if (inflight) return inflight;

  inflight = (async () => {
    // company_tickers_exchange.json 带 exchange 字段；结构为 { fields, data }
    const url = "https://www.sec.gov/files/company_tickers_exchange.json";
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": SEC_UA, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`SEC tickers HTTP ${res.status}`);
    const json = (await res.json()) as {
      fields?: string[];
      data?: unknown[][];
    };
    const fields = json.fields ?? [];
    const iTicker = fields.indexOf("ticker");
    const iName = fields.indexOf("name");
    const iExch = fields.indexOf("exchange");

    const rows: SecTicker[] = [];
    for (const row of json.data ?? []) {
      const symbol = String(row[iTicker] ?? "").trim().toUpperCase();
      if (!symbol) continue;
      rows.push({
        symbol,
        name: String(row[iName] ?? "").trim(),
        exchange: iExch >= 0 ? String(row[iExch] ?? "").trim() : "",
      });
    }
    cache = { at: Date.now(), rows };
    return rows;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** ETF / 指数等 SEC 不收录的常用标的兜底 */
const EXTRA_SYMBOLS: SecTicker[] = [
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "NYSE Arca" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "Nasdaq" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF", exchange: "NYSE Arca" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", exchange: "NYSE Arca" },
  { symbol: "XLK", name: "Technology Select Sector SPDR Fund", exchange: "NYSE Arca" },
  { symbol: "XLF", name: "Financial Select Sector SPDR Fund", exchange: "NYSE Arca" },
  { symbol: "XLE", name: "Energy Select Sector SPDR Fund", exchange: "NYSE Arca" },
  { symbol: "XLV", name: "Health Care Select Sector SPDR Fund", exchange: "NYSE Arca" },
  { symbol: "XLI", name: "Industrial Select Sector SPDR Fund", exchange: "NYSE Arca" },
  { symbol: "XLY", name: "Consumer Discretionary Select Sector SPDR", exchange: "NYSE Arca" },
  { symbol: "XLP", name: "Consumer Staples Select Sector SPDR", exchange: "NYSE Arca" },
  { symbol: "XLB", name: "Materials Select Sector SPDR Fund", exchange: "NYSE Arca" },
  { symbol: "XLU", name: "Utilities Select Sector SPDR Fund", exchange: "NYSE Arca" },
  { symbol: "XLC", name: "Communication Services Select Sector SPDR", exchange: "NYSE Arca" },
  { symbol: "XLRE", name: "Real Estate Select Sector SPDR Fund", exchange: "NYSE Arca" },
];

function scoreHit(q: string, symbol: string, name: string): number {
  const s = symbol.toUpperCase();
  const n = name.toUpperCase();
  if (s === q) return 1000;
  if (s.startsWith(q)) return 800 - s.length;
  const nameWords = n.split(/\s+/);
  if (nameWords.some((w) => w === q)) return 600;
  if (n.startsWith(q)) return 500;
  if (s.includes(q)) return 300 - s.length;
  if (n.includes(q)) return 200;
  return -1;
}

export async function searchUsEquitySymbols(
  rawQuery: string,
  limit = 20,
): Promise<SymbolSearchItem[]> {
  const q = rawQuery.trim().toUpperCase();
  if (!q) return [];

  let rows: SecTicker[];
  try {
    rows = await loadSecTickers();
  } catch {
    rows = [];
  }
  const pool = rows.length ? [...rows, ...EXTRA_SYMBOLS] : EXTRA_SYMBOLS;

  // 本地成分交易所语义（覆盖 SEC exchange 缺失的情况）
  const scored = pool
    .map((r) => ({ r, score: scoreHit(q, r.symbol, r.name) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  // 按 symbol 去重（EXTRA 覆盖 SEC 重复项）
  const seen = new Set<string>();
  const out: SymbolSearchItem[] = [];
  for (const { r } of scored) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push({
      symbol: r.symbol,
      name: r.name,
      exchange: r.exchange || "US",
      type: undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** symbol 是否为可识别的美股代码（供页面校验） */
export async function isKnownUsSymbol(symbol: string): Promise<boolean> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return false;
  if (EXTRA_SYMBOLS.some((r) => r.symbol === sym)) return true;
  const local = await prisma.equitySecurity.findUnique({ where: { symbol: sym } });
  if (local) return true;
  try {
    const rows = await loadSecTickers();
    return rows.some((r) => r.symbol === sym);
  } catch {
    return false;
  }
}
