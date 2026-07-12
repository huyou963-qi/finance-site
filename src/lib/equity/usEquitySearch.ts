/**
 * 全美股符号联想：SEC company_tickers.json（约 1 万条，免密钥）为主，
 * 叠加本地 equity_security（GICS 成分，带交易所语义）。进程内缓存 24h。
 */

import { prisma } from "@/lib/prisma";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import { MARKET_INSTRUMENTS } from "@/lib/data/marketInstruments";

// SEC 公平访问策略会拒绝 contact 为 localhost / 明显伪造邮箱的 UA（返回 403），
// 默认必须给一个可用的真实联系邮箱，否则线上取不到 company_tickers → 联想只剩兜底 ETF。
const SEC_UA =
  process.env.SEC_EDGAR_USER_AGENT?.trim() ||
  "finance-site/1.0 (contact: qcb963@gmail.com)";

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

/** 检索池条目：SEC/本地为纯股票；白名单带 type + 中英文别名 */
type PoolItem = {
  symbol: string;
  name: string;
  exchange: string;
  type?: string;
  aliases?: string[];
};

function scoreHit(q: string, item: PoolItem): number {
  const s = item.symbol.toUpperCase();
  const n = item.name.toUpperCase();
  if (s === q) return 1000;
  if (s.startsWith(q)) return 800 - s.length;
  // 别名命中（中文关键词如「黄金」「原油」「美债」，或英文/简写）
  for (const a of item.aliases ?? []) {
    const A = a.toUpperCase();
    if (A === q) return 720;
    if (A.startsWith(q)) return 620 - A.length;
    if (A.includes(q)) return 420;
  }
  const nameWords = n.split(/\s+/);
  if (nameWords.some((w) => w === q)) return 600;
  if (n.startsWith(q)) return 500;
  if (s.includes(q)) return 300 - s.length;
  if (n.includes(q)) return 200;
  return -1;
}

/** 大宗商品 / 外汇 / 债券 / 加密 白名单转为检索池条目 */
const CURATED_POOL: PoolItem[] = MARKET_INSTRUMENTS.map((m) => ({
  symbol: m.symbol,
  name: m.name,
  exchange: m.exchange,
  type: m.type,
  aliases: m.aliases,
}));

/**
 * 本地 equity_security（GICS 成分，含 AAPL/MSFT 等）候选。
 * 作为 SEC 拉取失败时的兜底，保证常见美股即便断网也能被检索到。
 */
async function loadLocalCandidates(q: string): Promise<SecTicker[]> {
  try {
    const rows = await prisma.equitySecurity.findMany({
      where: {
        OR: [{ symbol: { contains: q } }, { name: { contains: q, mode: "insensitive" } }],
      },
      select: { symbol: true, name: true },
      take: 50,
    });
    return rows.map((r) => ({ symbol: r.symbol.toUpperCase(), name: r.name, exchange: "US" }));
  } catch {
    return [];
  }
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

  const local = await loadLocalCandidates(q);
  // 白名单（商品/外汇/债券）在最前，命中同分时优先于 SEC 同名项（如 TLT 显示为「债券」）
  const pool: PoolItem[] = [...CURATED_POOL, ...rows, ...local, ...EXTRA_SYMBOLS];

  const scored = pool
    .map((r) => ({ r, score: scoreHit(q, r) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  // 按 symbol 去重（池内靠前者胜出，故白名单条目覆盖 SEC 重复项）
  const seen = new Set<string>();
  const out: SymbolSearchItem[] = [];
  for (const { r } of scored) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push({
      symbol: r.symbol,
      name: r.name,
      exchange: r.exchange || "US",
      type: r.type,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** symbol 是否为可识别的美股代码（供页面校验） */
export async function isKnownUsSymbol(symbol: string): Promise<boolean> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return false;
  if (CURATED_POOL.some((r) => r.symbol === sym)) return true;
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
