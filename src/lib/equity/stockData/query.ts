/**
 * 「股票数据」服务端取数：每个来源一次批量读取，再交给 resolve.ts 的纯函数逐格计算。
 * 结果不落库，进程内缓存 10 分钟。
 */

import { prisma } from "@/lib/prisma";
import { getQuarterlyFundamentalsBatch, type QuarterSnapshotRow } from "@/lib/equity/equityFundamentalsStore";
import { getRawDailyBarWindowsDbOnly } from "@/lib/equity/equityPriceStore";
import { loadNasdaqSymbolDirectory } from "@/lib/equity/nasdaqSymbolDirectory";
import type { RawDailyBar, SplitEvent } from "@/lib/equity/priceAdjustment";
import { buildPitRows, type PitEquityRow } from "@/lib/quant/pitCrossSection";
import { getIndicator, normalizeParams } from "./indicatorRegistry";
import {
  barWindowFor,
  benchmarkReturns,
  createMarketResolver,
  mergeWindows,
  resolveAsOfDate,
  resolveRangeDates,
} from "./marketResolve";
import { earliestYearNeeded, resolveRow, type SymbolInput } from "./resolve";
import type { ColumnSpec, StockDataResponse } from "./types";

/** Beta 的基准：标普 500 指数基金，与月度因子快照一致 */
const BENCHMARK_SYMBOL = "SPY";
/**
 * 估值用的市值下限。截面因子按指数成分股取 1 亿美元；本页覆盖更小的公司，
 * 只拦明显的股本口径错（如把几千股当成总股本）。
 */
const MIN_MARKET_CAP = 1e6;

type MarketPlan = {
  windows: { from: string; to: string }[];
  /** 需要截止日可见基本面（估值、换手率）的日期 */
  pitDates: string[];
  needsBenchmark: boolean;
};

/** 行情、估值、趋势类列要读哪些日线窗口、哪些日期的可见基本面 */
export function planMarketData(columns: readonly ColumnSpec[], today: string): MarketPlan | null {
  const windows: { from: string; to: string }[] = [];
  const pitDates = new Set<string>();
  let needsBenchmark = false;
  for (const col of columns) {
    const def = getIndicator(col.indicatorId);
    const src = def?.source;
    if (!def || !src || (src.kind !== "price" && src.kind !== "trend" && src.kind !== "valuation")) continue;
    const params = normalizeParams(def, col.params);
    if (src.kind === "valuation") { pitDates.add(resolveAsOfDate(params.asOf, today)); continue; }
    if (src.kind === "trend") { needsBenchmark = true; windows.push(barWindowFor("trend", params, today)); continue; }
    if (src.field === "close") windows.push(barWindowFor("close", params, today));
    else {
      windows.push(barWindowFor("range", params, today));
      if (src.field === "rangeTurnover") pitDates.add(resolveRangeDates(params.range, today).to);
    }
  }
  if (!windows.length && !pitDates.size) return null;
  return { windows: mergeWindows(windows), pitDates: [...pitDates], needsBenchmark };
}

type MarketData = {
  bars: Map<string, RawDailyBar[]>;
  splits: Map<string, SplitEvent[]>;
  pit: Map<string, Map<string, PitEquityRow>>;
  benchmark: Map<number, number> | null;
};

async function loadMarketData(plan: MarketPlan, lookup: string[]): Promise<MarketData> {
  const barSymbols = plan.needsBenchmark ? [...new Set([...lookup, BENCHMARK_SYMBOL])] : lookup;
  const [barSets, pitSets] = await Promise.all([
    Promise.all(plan.windows.map((w) => getRawDailyBarWindowsDbOnly({
      symbols: barSymbols, from: new Date(`${w.from}T00:00:00.000Z`), to: new Date(`${w.to}T00:00:00.000Z`),
    }))),
    Promise.all(plan.pitDates.map((d) => buildPitRows(lookup, d, { minPlausibleMarketCap: MIN_MARKET_CAP }))),
  ]);
  const bars = new Map<string, RawDailyBar[]>();
  let splits = new Map<string, SplitEvent[]>();
  for (const set of barSets) {
    splits = set.splits;
    for (const [sym, list] of set.bars) bars.set(sym, [...(bars.get(sym) ?? []), ...list]);
  }
  // 各窗口互不重叠，按时间拼接后仍是升序
  for (const list of bars.values()) list.sort((a, b) => a.time - b.time);
  const pit = new Map<string, Map<string, PitEquityRow>>();
  plan.pitDates.forEach((d, i) => {
    for (const row of pitSets[i]!) {
      const byDate = pit.get(row.symbol) ?? new Map<string, PitEquityRow>();
      byDate.set(d, row);
      pit.set(row.symbol, byDate);
    }
  });
  return { bars, splits, pit, benchmark: plan.needsBenchmark ? benchmarkReturns(bars.get(BENCHMARK_SYMBOL)) : null };
}

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
  const today = new Date().toISOString().slice(0, 10);
  const needsFundamentals = columns.some((c) => {
    const src = getIndicator(c.indicatorId)?.source;
    if (!src) return false;
    if (src.kind === "security") return src.field === "statementProfile" || src.field.startsWith("latest");
    return src.kind === "statement" || src.kind === "ratio" || src.kind === "growth";
  });
  const plan = planMarketData(columns, today);
  const [securities, directory, fundamentalsRaw, market] = await Promise.all([
    prisma.equitySecurity.findMany({
      where: { symbol: { in: lookup } },
      select: {
        symbol: true, name: true, gicsSector: true, gicsIndustryGroup: true, gicsIndustry: true,
        gicsSubIndustry: true, marketCap: true, website: true,
      },
    }),
    directoryWithin(DIRECTORY_WAIT_MS),
    needsFundamentals ? getQuarterlyFundamentalsBatch(lookup, { since }) : Promise.resolve(new Map<string, QuarterSnapshotRow[]>()),
    plan ? loadMarketData(plan, lookup) : Promise.resolve(null),
  ]);
  const norm = (s: string) => s.toUpperCase().replace(".", "-");
  const secBy = new Map(securities.map((s) => [norm(s.symbol), s]));
  const fundamentals = new Map([...fundamentalsRaw].map(([k, v]) => [norm(k), v]));
  const wanted = new Set(symbols);
  const dirBy = new Map((directory ?? []).filter((d) => wanted.has(d.symbol)).map((d) => [d.symbol, d]));
  const directoryReady = !!directory?.length;
  /** 同一证券两种写法（BRK-B / BRK.B）里取有数据的那个 */
  const pick = <T,>(m: Map<string, T> | undefined, symbol: string, has: (v: T) => boolean): T | undefined => {
    if (!m) return undefined;
    for (const v of variants(symbol)) {
      const hit = m.get(v);
      if (hit !== undefined && has(hit)) return hit;
    }
    return m.get(symbol);
  };

  const ignored: string[] = [];
  const rows = [];
  for (const symbol of symbols) {
    const sec = secBy.get(symbol);
    const dir = dirBy.get(symbol);
    const quarters = fundamentals.get(symbol) ?? [];
    const bars = pick(market?.bars, symbol, (b) => b.length > 0) ?? [];
    const pitByDate = pick(market?.pit, symbol, (m) => [...m.values()].some((r) => r.quarters.length > 0)) ?? new Map();
    const hasPitQuarters = [...pitByDate.values()].some((r) => r.quarters.length > 0);
    // 美股判定：在证券主表、上市目录、基本面库或行情库任一处出现（目录没加载到时不据此剔除）
    if (!sec && !dir && !quarters.length && !bars.length && !hasPitQuarters && directoryReady) { ignored.push(symbol); continue; }
    const isFund = dir?.type === "ETF" && !quarters.length && !hasPitQuarters;
    const resolver = market
      ? createMarketResolver(
          { bars, splits: pick(market.splits, symbol, (x) => x.length > 0) ?? [], pitByDate, isFund },
          { today, benchmark: market.benchmark },
        )
      : undefined;
    const input: SymbolInput = {
      symbol,
      isFund,
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
    rows.push(resolveRow(input, columns, resolver));
  }

  const value: StockDataResponse = { rows, ignored, generatedAt: new Date().toISOString() };
  // 目录没加载到时交易所、ETF 判定不完整，不缓存，下次重算
  if (directoryReady) cacheSet(key, value);
  return { ...value, ignored: [...preIgnored, ...ignored] };
}
