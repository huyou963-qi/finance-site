/**
 * 「股票数据」服务端取数：每个来源一次批量读取，再交给 resolve.ts 的纯函数逐格计算。
 * 结果不落库，进程内缓存 10 分钟。
 */

import { prisma } from "@/lib/prisma";
import { getQuarterlyFundamentalsBatch, type QuarterSnapshotRow } from "@/lib/equity/equityFundamentalsStore";
import { loadNasdaqSymbolDirectory } from "@/lib/equity/nasdaqSymbolDirectory";
import { earliestYearNeeded, resolveRow, type SymbolInput } from "./resolve";
import type { ColumnSpec, StockDataResponse } from "./types";

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; value: StockDataResponse }>();

function cacheGet(key: string): StockDataResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.value;
}

function cacheSet(key: string, value: StockDataResponse) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
}

/**
 * 上市目录首次下载要几秒（之后进程内缓存 24 小时）。最多等 1.5 秒，没等到就先不用它，
 * 下载照常在后台完成供下次使用；此时不认识的代码保留下来，而不是被误判成非美股。
 */
const DIRECTORY_WAIT_MS = 1500;
async function directoryWithin(ms: number) {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  return Promise.race([loadNasdaqSymbolDirectory().catch(() => null), timeout]);
}

/** 同一只证券在不同目录里可能写成 BRK.B 或 BRK-B */
const variants = (s: string) => [s, s.replace("-", ".")];

export async function queryStockData(
  symbols: readonly string[],
  columns: readonly ColumnSpec[],
  preIgnored: readonly string[] = [],
): Promise<StockDataResponse> {
  const key = JSON.stringify([symbols, columns]);
  const cached = cacheGet(key);
  if (cached) return { ...cached, ignored: [...preIgnored, ...cached.ignored] };

  const lookup = [...new Set(symbols.flatMap(variants))];
  const since = `${earliestYearNeeded(columns, new Date().getUTCFullYear())}-01-01`;
  const needsFundamentals = columns.some((c) => !c.indicatorId.startsWith("sec.") || c.indicatorId === "sec.statementProfile" || c.indicatorId.startsWith("sec.latest"));
  const [securities, directory, fundamentalsRaw] = await Promise.all([
    prisma.equitySecurity.findMany({
      where: { symbol: { in: lookup } },
      select: {
        symbol: true, name: true, gicsSector: true, gicsIndustryGroup: true, gicsIndustry: true,
        gicsSubIndustry: true, marketCap: true, website: true,
      },
    }),
    directoryWithin(DIRECTORY_WAIT_MS),
    needsFundamentals ? getQuarterlyFundamentalsBatch(lookup, { since }) : Promise.resolve(new Map<string, QuarterSnapshotRow[]>()),
  ]);
  const norm = (s: string) => s.toUpperCase().replace(".", "-");
  const secBy = new Map(securities.map((s) => [norm(s.symbol), s]));
  const fundamentals = new Map([...fundamentalsRaw].map(([k, v]) => [norm(k), v]));
  const wanted = new Set(symbols);
  const dirBy = new Map((directory ?? []).filter((d) => wanted.has(d.symbol)).map((d) => [d.symbol, d]));
  const directoryReady = !!directory?.length;

  const ignored: string[] = [];
  const rows = [];
  for (const symbol of symbols) {
    const sec = secBy.get(symbol);
    const dir = dirBy.get(symbol);
    const quarters = fundamentals.get(symbol) ?? [];
    // 美股判定：在证券主表、上市目录或基本面库任一处出现（目录没加载到时不据此剔除）
    if (!sec && !dir && !quarters.length && directoryReady) { ignored.push(symbol); continue; }
    const input: SymbolInput = {
      symbol,
      isFund: dir?.type === "ETF" && !quarters.length,
      security: {
        name: sec?.name ?? dir?.name ?? null,
        exchange: dir?.exchange ?? null,
        gicsSector: sec?.gicsSector ?? null,
        gicsIndustryGroup: sec?.gicsIndustryGroup ?? null,
        gicsIndustry: sec?.gicsIndustry ?? null,
        gicsSubIndustry: sec?.gicsSubIndustry ?? null,
        marketCap: sec?.marketCap ?? null,
        website: sec?.website ?? null,
      },
      quarters,
    };
    rows.push(resolveRow(input, columns));
  }

  const value: StockDataResponse = { rows, ignored, generatedAt: new Date().toISOString() };
  // 目录没加载到时交易所、ETF 判定不完整，不缓存，下次重算
  if (directoryReady) cacheSet(key, value);
  return { ...value, ignored: [...preIgnored, ...ignored] };
}
