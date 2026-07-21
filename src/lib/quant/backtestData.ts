/**
 * 回测数据装配层（Phase 3 WS2）：因子截面重放 + 价格批载 + 引擎编排。
 * 纯函数引擎在 backtest.ts；本模块负责触库，供 CLI / API 调用。
 *
 * - 价格：所有持仓 symbol 的 adjClose 一次性分块批载进内存（列式数组），
 *   全程不逐期查库、不触发远端回补（Phase 0 已回填，只读 DB）。
 * - adjClose 为 Yahoo 复权价（含分红，已验证），比值即总收益；
 *   全 0 占位行由 SQL 过滤（adj_close > 0 AND close > 0）。
 * - 选股：每个调仓日 T 加载 FactorSnapshot 全截面（与 /equity/screener 完全同源），
 *   复用 runScreener 纯函数——引擎不自算因子。
 * - 主交易日历 = SPY 日线（1993 起，覆盖全回测区间）。
 */

import { prisma } from "@/lib/prisma";
import {
  buildRebalanceCalendar,
  isoToDay,
  runBacktest,
  strategyDataFloor,
  validateBacktestParams,
  type BacktestDataset,
  type BacktestParams,
  type BacktestResult,
  type RebalanceSelection,
  type SymbolPrices,
} from "@/lib/quant/backtest";
import {
  pivotFactorRows,
  runScreener,
  validateScreenerConfig,
  type ScreenerConfig,
  type SecurityMeta,
} from "@/lib/quant/screener";
import { listFactorDates } from "@/lib/quant/screenerData";

const BENCH_SYMBOL = "SPY";
/** 价格加载起点相对首个调仓日的前置缓冲（覆盖 nextClose 执行 + 7 天陈旧窗口） */
const PRICE_BUFFER_DAYS = 14;
const PRICE_SYMBOL_CHUNK = 80;

export type BacktestProgress = {
  phase: "screening" | "loadingPrices" | "simulating";
  done: number;
  total: number;
};

export type ExecuteBacktestOptions = {
  onProgress?: (p: BacktestProgress) => void;
};

export type BacktestExecution = {
  result: BacktestResult;
  /** 实际生效的回测起点（策略数据下限与请求起点取 max 后的首个调仓日） */
  effectiveStart: string;
  /** 策略数据下限（由引用因子的 startYear 推导） */
  dataFloor: string;
  rebalanceCount: number;
  /** 全程涉及的持仓 symbol 数（含选中但无价被跳过的） */
  symbolCount: number;
};

// ────────────────────────────────────────────────────────── 截面重放

/**
 * 逐调仓日重放选股。截面读取与 screenerData.loadFactorCrossSection 同口径，
 * 但证券元信息跨期缓存（300 期只查新增 symbol）。
 */
async function replaySelections(
  dates: readonly string[],
  config: ScreenerConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<RebalanceSelection[]> {
  const metaCache = new Map<string, SecurityMeta>();
  const selections: RebalanceSelection[] = [];
  // date 字段属于单期查询语义，重放时逐期覆盖，避免误用保存时钉定的截面
  const replayConfig: ScreenerConfig = { ...config, date: null };

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const snaps = await prisma.factorSnapshot.findMany({
      where: { date: new Date(`${date}T00:00:00.000Z`) },
      select: { symbol: true, factorKey: true, value: true, zscore: true, sectorZscore: true },
    });
    const missingMeta = [...new Set(snaps.map((s) => s.symbol))].filter((s) => !metaCache.has(s));
    if (missingMeta.length > 0) {
      const securities = await prisma.equitySecurity.findMany({
        where: { symbol: { in: missingMeta } },
        select: { symbol: true, name: true, gicsSector: true },
      });
      for (const s of securities) metaCache.set(s.symbol, { name: s.name, sector: s.gicsSector });
      for (const s of missingMeta) {
        if (!metaCache.has(s)) metaCache.set(s, { name: null, sector: null });
      }
    }
    const rows = pivotFactorRows(
      snaps.map((s) => ({
        symbol: s.symbol,
        factorKey: s.factorKey,
        value: s.value,
        zscore: s.zscore,
        sectorZscore: s.sectorZscore,
      })),
      metaCache,
    );
    const { rows: resultRows, stats } = runScreener(rows, replayConfig);
    selections.push({
      date,
      rows: resultRows.map((r) => ({ symbol: r.symbol, marketCap: r.marketCap, score: r.score })),
      stats,
    });
    onProgress?.(i + 1, dates.length);
  }
  return selections;
}

// ────────────────────────────────────────────────────────── 价格批载

/**
 * 分块批载 adjClose 为列式序列（epoch 天 + 收盘价数组）。
 * 只读库，不触发远端回补；全 0 占位/坏行由 WHERE 过滤。
 */
export async function loadPricesColumnar(
  symbols: readonly string[],
  fromIso: string,
  toIso: string | null,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, SymbolPrices>> {
  const unique = [...new Set(symbols)];
  const out = new Map<string, SymbolPrices>();
  const from = new Date(`${fromIso}T00:00:00.000Z`);
  const to = toIso ? new Date(`${toIso}T00:00:00.000Z`) : new Date();

  for (let i = 0; i < unique.length; i += PRICE_SYMBOL_CHUNK) {
    const chunk = unique.slice(i, i + PRICE_SYMBOL_CHUNK);
    const rows = await prisma.$queryRaw<{ symbol: string; date: Date; adj_close: number }[]>`
      SELECT symbol, date, adj_close
      FROM mds.equity_daily_bar
      WHERE symbol = ANY(${chunk})
        AND date >= ${from} AND date <= ${to}
        AND adj_close > 0 AND close > 0
      ORDER BY symbol, date ASC
    `;
    for (const r of rows) {
      let series = out.get(r.symbol);
      if (!series) {
        series = { days: [], closes: [] };
        out.set(r.symbol, series);
      }
      series.days.push(Math.floor(r.date.getTime() / 86_400_000));
      series.closes.push(Number(r.adj_close));
    }
    onProgress?.(Math.min(i + PRICE_SYMBOL_CHUNK, unique.length), unique.length);
  }
  return out;
}

// ────────────────────────────────────────────────────────── 编排

/**
 * 端到端执行一次回测：日历 → 截面重放选股 → 价格批载 → 纯函数引擎。
 * 抛错 = 配置无效或数据不可用（调用方负责落库 status=failed）。
 */
export async function executeBacktest(
  config: ScreenerConfig,
  params: BacktestParams,
  opts: ExecuteBacktestOptions = {},
): Promise<BacktestExecution> {
  validateScreenerConfig(config);
  validateBacktestParams(params);

  const dataFloor = strategyDataFloor(config, params.weighting);
  const effectiveStart =
    params.start && params.start > dataFloor ? params.start : dataFloor;

  const factorDates = await listFactorDates();
  const rebalanceDates = buildRebalanceCalendar(factorDates, {
    start: effectiveStart,
    end: params.end,
  });
  if (rebalanceDates.length === 0) {
    throw new Error(
      `回测区间内没有可用调仓期（起点 ${effectiveStart}${params.end ? `，终点 ${params.end}` : ""}；策略数据下限 ${dataFloor}）`,
    );
  }

  const selections = await replaySelections(rebalanceDates, config, (done, total) =>
    opts.onProgress?.({ phase: "screening", done, total }),
  );

  const symbolSet = new Set<string>();
  for (const s of selections) for (const r of s.rows) symbolSet.add(r.symbol);
  if (symbolSet.size === 0) {
    throw new Error("全部调仓期选股结果为空，请放宽条件");
  }

  const firstDay = isoToDay(rebalanceDates[0]!);
  const priceFrom = new Date((firstDay - PRICE_BUFFER_DAYS) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const prices = await loadPricesColumnar(
    [...symbolSet, BENCH_SYMBOL],
    priceFrom,
    params.end ?? null,
    (done, total) => opts.onProgress?.({ phase: "loadingPrices", done, total }),
  );

  const bench = prices.get(BENCH_SYMBOL) ?? null;
  if (!bench || bench.days.length === 0) {
    throw new Error(`基准 ${BENCH_SYMBOL} 无价格数据，无法构建主交易日历`);
  }

  const dataset: BacktestDataset = {
    calendar: bench.days,
    prices,
    bench,
  };

  opts.onProgress?.({ phase: "simulating", done: 0, total: 1 });
  const result = runBacktest(dataset, selections, { ...params, start: effectiveStart });
  opts.onProgress?.({ phase: "simulating", done: 1, total: 1 });

  return {
    result,
    effectiveStart,
    dataFloor,
    rebalanceCount: rebalanceDates.length,
    symbolCount: symbolSet.size,
  };
}
