/**
 * 过拟合防护——编排引擎（P2 WS2）。纯统计核心在 robustness.ts，回测引擎在 backtest.ts；
 * 本模块负责触库装配 + 跨网格/分割多次跑引擎 + 聚合，供 API/CLI 调用。
 *
 * **性能是第一约束**：dataset 装配（因子截面 + 价格批载）昂贵，必须一次装配、多次复用。
 * 拆法：
 *   1) `loadCrossSections` 逐调仓日把 FactorSnapshot 全截面 pivot 成宽行 **只查一次库**；
 *   2) 每个网格点用纯函数 `runScreener` 在缓存的宽行上重放（便宜，不触库）；
 *   3) 全网格选股结果的 symbol 并集 → `loadPricesColumnar` **只批载一次**价格；
 *   4) `runBacktest` 在同一 dataset 上按网格点/时间窗口跑多次。
 *
 * 三模式：
 *   - scan：参数网格全跑一遍，出稳健性面（metric 随 topN/阈值变化）+ 对最优点算 DSR。
 *   - oos：训练段（IS）扫网格挑最优 → 测试段（OOS）只跑一次 → IS/OOS 指标对照 + DSR。
 *   - walkforward：滚动 train 挑参 + test 跑一次，各 OOS 段拼成连续净值。
 *
 * **诚实边界**：OOS/walk-forward 只在**配合参数选择（网格）**时才真正防选择性过拟合；
 * 对固定策略（空网格）的 walk-forward 只测「时间稳定性」，不等于对过拟合免疫。DSR 的试验数
 * N = 网格点数，如实记录传入（谎报 N=1 等于没校正）。
 */

import { prisma } from "@/lib/prisma";
import {
  buildRebalanceCalendar,
  computeMetrics,
  dayToIso,
  isoToDay,
  runBacktest,
  strategyDataFloor,
  validateBacktestParams,
  type BacktestDataset,
  type BacktestParams,
  type BacktestResult,
  type BacktestWeighting,
  type RebalanceSelection,
} from "@/lib/quant/backtest";
import {
  pivotFactorRows,
  referencedFactorKeys,
  runScreener,
  validateScreenerConfig,
  type ScreenerConfig,
  type SecurityMeta,
} from "@/lib/quant/screener";
import { listFactorDates } from "@/lib/quant/screenerData";
import { loadPricesColumnar } from "@/lib/quant/backtestData";
import {
  deflatedSharpe,
  oosDegradation,
  returnMoments,
  stitchWalkForward,
  type DeflatedSharpeResult,
  type NavPoint,
  type OosDegradation,
  type SplitMetrics,
  type StitchedNavPoint,
} from "@/lib/quant/robustness";

const BENCH_SYMBOL = "SPY";
const PRICE_BUFFER_DAYS = 14;

// ────────────────────────────────────────────────────────── 截面缓存（触库一次）

/** date（ISO）→ 该期 pivot 后的宽行（含 name/sector meta）。DB 重活，一次装配。 */
type CrossSectionPanel = Map<string, ReturnType<typeof pivotFactorRows>>;

export type RobustnessProgress = {
  phase: "screening" | "loadingPrices" | "simulating";
  done: number;
  total: number;
};

/**
 * 加载 FactorSnapshot 截面并 pivot 成宽行。**分块批量按 date IN(...) 查**（不逐日往返，
 * 228 期从 228 次 round-trip 降到几次），且只取网格引用到的因子（+logMarketCap）而非全 28 因子。
 * 与 factorResearchData.loadFactorPanel 同思路；不跑 runScreener，留给上层每个网格点复用。
 */
const CROSS_SECTION_DATE_CHUNK = 48;

async function loadCrossSections(
  dates: readonly string[],
  factorKeys: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<CrossSectionPanel> {
  const keyFilter = [...factorKeys];
  // date(ISO) → 长表行；分块批量拉取
  const longByDate = new Map<string, { symbol: string; factorKey: string; value: number | null; zscore: number | null; sectorZscore: number | null }[]>();
  for (const d of dates) longByDate.set(d, []);
  const symbolSet = new Set<string>();

  for (let i = 0; i < dates.length; i += CROSS_SECTION_DATE_CHUNK) {
    const chunk = dates.slice(i, i + CROSS_SECTION_DATE_CHUNK);
    const dateObjs = chunk.map((d) => new Date(`${d}T00:00:00.000Z`));
    const snaps = await prisma.factorSnapshot.findMany({
      where: { date: { in: dateObjs }, factorKey: { in: keyFilter } },
      select: { symbol: true, date: true, factorKey: true, value: true, zscore: true, sectorZscore: true },
    });
    for (const s of snaps) {
      const iso = s.date.toISOString().slice(0, 10);
      longByDate.get(iso)?.push({
        symbol: s.symbol,
        factorKey: s.factorKey,
        value: s.value,
        zscore: s.zscore,
        sectorZscore: s.sectorZscore,
      });
      symbolSet.add(s.symbol);
    }
    onProgress?.(Math.min(i + CROSS_SECTION_DATE_CHUNK, dates.length), dates.length);
  }

  // 证券元信息（name/sector）一次性拉取
  const metaBySymbol = new Map<string, SecurityMeta>();
  const symbols = [...symbolSet];
  for (let i = 0; i < symbols.length; i += 500) {
    const chunk = symbols.slice(i, i + 500);
    const securities = await prisma.equitySecurity.findMany({
      where: { symbol: { in: chunk } },
      select: { symbol: true, name: true, gicsSector: true },
    });
    for (const s of securities) metaBySymbol.set(s.symbol, { name: s.name, sector: s.gicsSector });
  }

  const panel: CrossSectionPanel = new Map();
  for (const d of dates) panel.set(d, pivotFactorRows(longByDate.get(d) ?? [], metaBySymbol));
  return panel;
}

/** 用缓存截面对某配置重放选股（纯函数，不触库）；date 逐期覆盖。 */
function screenAll(
  panel: CrossSectionPanel,
  dates: readonly string[],
  config: ScreenerConfig,
): RebalanceSelection[] {
  const replayConfig: ScreenerConfig = { ...config, date: null };
  const out: RebalanceSelection[] = [];
  for (const date of dates) {
    const rows = panel.get(date) ?? [];
    const { rows: resultRows, stats } = runScreener(rows, replayConfig);
    out.push({
      date,
      rows: resultRows.map((r) => ({ symbol: r.symbol, marketCap: r.marketCap, score: r.score })),
      stats,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────── 参数网格

export type ScanAxisKind =
  | "topN"
  | "weighting"
  | "costBps"
  | "sortFactor"
  | "conditionMin"
  | "conditionMax";

export type ScanAxis = {
  /** 展示用短名，如 "topN" / "价值阈值" */
  key: string;
  kind: ScanAxisKind;
  /** conditionMin/conditionMax 生效的 conditions 下标 */
  conditionIndex?: number;
  /** 该轴取值序列（number 或 string，按 kind） */
  values: (number | string)[];
};

export type GridPoint = {
  index: number;
  /** 各轴取值（与 axes 同序），供热力图定位 */
  coords: (number | string)[];
  label: string;
  config: ScreenerConfig;
  params: BacktestParams;
};

function cloneConfig(c: ScreenerConfig): ScreenerConfig {
  return JSON.parse(JSON.stringify(c)) as ScreenerConfig;
}

/** 把某轴的一个取值应用到 (config, params) 副本上 */
function applyAxisValue(
  config: ScreenerConfig,
  params: BacktestParams,
  axis: ScanAxis,
  value: number | string,
): void {
  switch (axis.kind) {
    case "topN":
      config.ranking = { ...config.ranking, topN: Number(value) };
      break;
    case "weighting":
      params.weighting = value as BacktestWeighting;
      break;
    case "costBps":
      params.costBps = Number(value);
      break;
    case "sortFactor":
      config.ranking = { ...config.ranking, mode: "single", sortFactor: String(value) };
      break;
    case "conditionMin": {
      const ci = axis.conditionIndex ?? 0;
      const cond = config.conditions[ci];
      if (!cond) throw new Error(`conditionMin 轴引用了不存在的 condition[${ci}]`);
      cond.bounds = { ...cond.bounds, min: Number(value) };
      break;
    }
    case "conditionMax": {
      const ci = axis.conditionIndex ?? 0;
      const cond = config.conditions[ci];
      if (!cond) throw new Error(`conditionMax 轴引用了不存在的 condition[${ci}]`);
      cond.bounds = { ...cond.bounds, max: Number(value) };
      break;
    }
    default:
      throw new Error(`未知扫描轴：${axis.kind as string}`);
  }
}

const MAX_GRID_POINTS = 64;

/** 笛卡尔积展开参数网格。空 axes → 单点（固定策略）。 */
export function buildGrid(
  baseConfig: ScreenerConfig,
  baseParams: BacktestParams,
  axes: readonly ScanAxis[],
): GridPoint[] {
  for (const a of axes) {
    if (!a.values.length) throw new Error(`扫描轴 ${a.key} 取值为空`);
  }
  const total = axes.reduce((n, a) => n * a.values.length, 1);
  if (total > MAX_GRID_POINTS) {
    throw new Error(`参数网格 ${total} 点过大（上限 ${MAX_GRID_POINTS}）；请收窄取值范围`);
  }
  const points: GridPoint[] = [];
  const recurse = (dim: number, coords: (number | string)[]) => {
    if (dim === axes.length) {
      const config = cloneConfig(baseConfig);
      const params = { ...baseParams };
      const labelParts: string[] = [];
      axes.forEach((axis, i) => {
        applyAxisValue(config, params, axis, coords[i]!);
        labelParts.push(`${axis.key}=${coords[i]}`);
      });
      validateScreenerConfig(config);
      validateBacktestParams(params);
      points.push({
        index: points.length,
        coords: [...coords],
        label: labelParts.join(" · ") || "固定策略",
        config,
        params,
      });
      return;
    }
    for (const v of axes[dim]!.values) recurse(dim + 1, [...coords, v]);
  };
  recurse(0, []);
  return points;
}

// ────────────────────────────────────────────────────────── 单窗口回测 + 指标

export type WindowMetrics = SplitMetrics & {
  /** 年化夏普（= perPeriodSharpe × √252，展示用） */
  sharpeAnnual: number;
  /** 每期（日）夏普，DSR 用 */
  perPeriodSharpe: number;
  skew: number;
  kurtosis: number;
  /** 日收益样本数 */
  nDays: number;
  /** 平均持仓数 */
  avgHeld: number;
  calmar: number | null;
  monthlyWinRate: number | null;
};

/**
 * 在既有 dataset 上按 [winStart, winEnd] 跑一次回测并算指标。
 * 无可执行调仓期 / nav 不足 → 返回 null（该点在此窗口不可评估）。
 */
function runWindow(
  dataset: BacktestDataset,
  selections: readonly RebalanceSelection[],
  params: BacktestParams,
  winStart: string,
  winEnd: string,
): { result: BacktestResult; metrics: WindowMetrics } | null {
  const inWindow = selections.filter((s) => s.date >= winStart && s.date <= winEnd);
  if (inWindow.length === 0) return null;
  let result: BacktestResult;
  try {
    result = runBacktest(dataset, inWindow, { ...params, start: winStart, end: winEnd });
  } catch {
    return null;
  }
  if (result.nav.length < 2) return null;
  const rets: number[] = [];
  for (let i = 1; i < result.nav.length; i++) {
    rets.push(result.nav[i]!.nav / result.nav[i - 1]!.nav - 1);
  }
  const mom = returnMoments(rets);
  const m = result.metrics;
  const avgHeld =
    result.periods.length > 0
      ? result.periods.reduce((s, p) => s + p.held, 0) / result.periods.length
      : 0;
  return {
    result,
    metrics: {
      cagr: m.cagr,
      sharpe: m.sharpe,
      maxDrawdown: m.maxDrawdown,
      vol: m.vol,
      sharpeAnnual: m.sharpe,
      perPeriodSharpe: mom.sharpe,
      skew: mom.skew,
      kurtosis: mom.kurtosis,
      nDays: mom.n,
      avgHeld,
      calmar: m.calmar,
      monthlyWinRate: m.monthlyWinRate,
    },
  };
}

/** nav 降采样到每自然月末点（存储/画图用；指标始终由日频算） */
function downsampleMonthly(nav: readonly { date: string; nav: number }[]): NavPoint[] {
  const byMonth = new Map<string, { date: string; nav: number }>();
  for (const p of nav) byMonth.set(p.date.slice(0, 7), p); // 升序遍历，后写覆盖=月末
  const pts = [...byMonth.values()];
  if (nav.length > 0 && pts[0]?.date !== nav[0]!.date) pts.unshift(nav[0]!);
  return pts.map((p) => ({ date: p.date, nav: p.nav }));
}

// ────────────────────────────────────────────────────────── 结果模型

export type ScanPoint = {
  index: number;
  coords: (number | string)[];
  label: string;
  metrics: WindowMetrics | null;
};

export type ScanResult = {
  axes: { key: string; values: (number | string)[] }[];
  points: ScanPoint[];
  /** 按 selectMetric 最优的点下标（null=全不可评估） */
  bestIndex: number | null;
  /** 对最优点算的 DSR（试验数 N = 可评估点数） */
  deflated: DeflatedSharpeResult | null;
  selectMetric: SelectMetric;
};

export type OosResult = {
  splitDate: string;
  axes: { key: string; values: (number | string)[] }[];
  /** IS 段扫网格（挑选依据）；含每点 IS 指标 */
  isScan: ScanPoint[];
  winnerIndex: number | null;
  winnerLabel: string | null;
  isMetrics: WindowMetrics | null;
  oosMetrics: WindowMetrics | null;
  degradation: OosDegradation | null;
  /** 对 IS 扫描最优点算的 DSR（观测=赢家 IS 每期夏普，N=IS 可评估点数） */
  deflated: DeflatedSharpeResult | null;
  /** 赢家的 IS / OOS 净值（月末降采样），拼图异色用 */
  isNav: NavPoint[];
  oosNav: NavPoint[];
};

export type WalkforwardFold = {
  index: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  winnerLabel: string | null;
  testMetrics: WindowMetrics | null;
};

export type WalkforwardResult = {
  folds: WalkforwardFold[];
  /** 各 test 段拼成的连续 OOS 净值（segment 交替着色） */
  stitchedNav: StitchedNavPoint[];
  /** 拼接曲线的整体指标 */
  overallMetrics: SplitMetrics | null;
  /** 是否为固定策略（空网格）——诚实边界：只测时间稳定性 */
  fixedStrategy: boolean;
};

export type SelectMetric = "sharpe" | "cagr";

export type RobustnessMode = "scan" | "oos" | "walkforward";

export type RobustnessSpec = {
  mode: RobustnessMode;
  axes?: ScanAxis[];
  /** oos 分割日（IS = ≤splitDate，OOS = >splitDate） */
  splitDate?: string | null;
  /** walkforward test 段数 */
  folds?: number;
  /** walkforward 最少训练期数（调仓期计） */
  minTrainPeriods?: number;
  /** 挑选最优的指标，默认 sharpe */
  selectMetric?: SelectMetric;
};

export type RobustnessExecution = {
  mode: RobustnessMode;
  effectiveStart: string;
  end: string | null;
  dataFloor: string;
  rebalanceCount: number;
  symbolCount: number;
  gridSize: number;
  scan?: ScanResult;
  oos?: OosResult;
  walkforward?: WalkforwardResult;
};

// ────────────────────────────────────────────────────────── 挑选 + DSR

function metricValue(m: WindowMetrics | null, sel: SelectMetric): number {
  if (!m) return -Infinity;
  const v = sel === "sharpe" ? m.sharpe : m.cagr;
  return Number.isFinite(v) ? v : -Infinity;
}

function bestPointIndex(points: readonly { metrics: WindowMetrics | null }[], sel: SelectMetric): number | null {
  let best = -Infinity;
  let idx: number | null = null;
  points.forEach((p, i) => {
    const v = metricValue(p.metrics, sel);
    if (v > best) {
      best = v;
      idx = i;
    }
  });
  return idx;
}

/** 对一组点（含赢家）算 DSR：观测=赢家每期夏普，试验夏普=全部可评估点的每期夏普 */
function deflatedForPoints(
  points: readonly { metrics: WindowMetrics | null }[],
  winnerIndex: number | null,
): DeflatedSharpeResult | null {
  if (winnerIndex == null) return null;
  const winner = points[winnerIndex]?.metrics;
  if (!winner) return null;
  const trialSharpes = points
    .map((p) => p.metrics?.perPeriodSharpe)
    .filter((s): s is number => s != null && Number.isFinite(s));
  return deflatedSharpe({
    observedSharpe: winner.perPeriodSharpe,
    n: winner.nDays,
    skew: winner.skew,
    kurtosis: winner.kurtosis,
    trialSharpes,
  });
}

function splitMetricsOf(m: WindowMetrics): SplitMetrics {
  return { cagr: m.cagr, sharpe: m.sharpe, maxDrawdown: m.maxDrawdown, vol: m.vol };
}

// ────────────────────────────────────────────────────────── 主编排

/**
 * 端到端稳健性分析。装配 dataset 一次，按 mode 跨网格/分割跑引擎多次。
 * 抛错 = 配置无效或区间无数据（调用方负责落库 status=failed）。
 */
export async function executeRobustness(
  baseConfig: ScreenerConfig,
  baseParams: BacktestParams,
  spec: RobustnessSpec,
  onProgress?: (p: RobustnessProgress) => void,
): Promise<RobustnessExecution> {
  validateScreenerConfig(baseConfig);
  validateBacktestParams(baseParams);
  const selectMetric: SelectMetric = spec.selectMetric ?? "sharpe";
  const axes = spec.axes ?? [];

  // 1) 参数网格
  const grid = buildGrid(baseConfig, baseParams, axes);

  // 2) 共同起点 = 请求起点 与 全网格点最严数据下限 取 max（保证各点窗口可比）
  let dataFloor = "2000-01-01";
  for (const gp of grid) {
    const f = strategyDataFloor(gp.config, gp.params.weighting);
    if (f > dataFloor) dataFloor = f;
  }
  const effectiveStart =
    baseParams.start && baseParams.start > dataFloor ? baseParams.start : dataFloor;
  const end = baseParams.end ?? null;

  // 3) 调仓日历（一次）
  const factorDates = await listFactorDates();
  const rebalanceDates = buildRebalanceCalendar(factorDates, { start: effectiveStart, end });
  if (rebalanceDates.length < 2) {
    throw new Error(
      `区间内可用调仓期不足（${rebalanceDates.length}；起点 ${effectiveStart}${end ? `，终点 ${end}` : ""}）`,
    );
  }

  // 4) 截面缓存（触库一次）——只加载网格引用到的因子（+logMarketCap，供 marketCap/mcap 权重）
  const neededFactors = new Set<string>(["logMarketCap"]);
  for (const gp of grid) for (const k of referencedFactorKeys(gp.config)) neededFactors.add(k);
  const panel = await loadCrossSections(rebalanceDates, [...neededFactors], (done, total) =>
    onProgress?.({ phase: "screening", done, total }),
  );

  // 5) 每个网格点重放选股（纯函数）；收集 symbol 并集
  const selectionsByPoint: RebalanceSelection[][] = grid.map((gp) =>
    screenAll(panel, rebalanceDates, gp.config),
  );
  const symbolSet = new Set<string>();
  for (const sels of selectionsByPoint) for (const s of sels) for (const r of s.rows) symbolSet.add(r.symbol);
  if (symbolSet.size === 0) throw new Error("全部网格点选股结果为空，请放宽条件");

  // 6) 价格批载（一次）
  const firstDay = isoToDay(rebalanceDates[0]!);
  const priceFrom = dayToIso(firstDay - PRICE_BUFFER_DAYS);
  const prices = await loadPricesColumnar([...symbolSet, BENCH_SYMBOL], priceFrom, end, (done, total) =>
    onProgress?.({ phase: "loadingPrices", done, total }),
  );
  const bench = prices.get(BENCH_SYMBOL) ?? null;
  if (!bench || bench.days.length === 0) throw new Error(`基准 ${BENCH_SYMBOL} 无价格，无法构建日历`);
  const dataset: BacktestDataset = { calendar: bench.days, prices, bench };

  const fullStart = rebalanceDates[0]!;
  const fullEnd = end ?? dayToIso(bench.days[bench.days.length - 1]!);

  const base: Omit<RobustnessExecution, "scan" | "oos" | "walkforward"> = {
    mode: spec.mode,
    effectiveStart: fullStart,
    end,
    dataFloor,
    rebalanceCount: rebalanceDates.length,
    symbolCount: symbolSet.size,
    gridSize: grid.length,
  };

  onProgress?.({ phase: "simulating", done: 0, total: 1 });

  if (spec.mode === "scan") {
    const scan = runScanMode(dataset, grid, axes, selectionsByPoint, fullStart, fullEnd, selectMetric);
    onProgress?.({ phase: "simulating", done: 1, total: 1 });
    return { ...base, scan };
  }
  if (spec.mode === "oos") {
    const oos = runOosMode(
      dataset,
      grid,
      axes,
      selectionsByPoint,
      fullStart,
      fullEnd,
      spec.splitDate ?? null,
      selectMetric,
    );
    onProgress?.({ phase: "simulating", done: 1, total: 1 });
    return { ...base, oos };
  }
  const walkforward = runWalkforwardMode(
    dataset,
    grid,
    selectionsByPoint,
    rebalanceDates,
    fullEnd,
    spec.folds ?? 4,
    spec.minTrainPeriods ?? 24,
    selectMetric,
  );
  onProgress?.({ phase: "simulating", done: 1, total: 1 });
  return { ...base, walkforward };
}

// ────────────────────────────────────────────────────────── scan

function runScanMode(
  dataset: BacktestDataset,
  grid: readonly GridPoint[],
  axes: readonly ScanAxis[],
  selectionsByPoint: readonly RebalanceSelection[][],
  winStart: string,
  winEnd: string,
  selectMetric: SelectMetric,
): ScanResult {
  const points: ScanPoint[] = grid.map((gp, i) => {
    const run = runWindow(dataset, selectionsByPoint[i]!, gp.params, winStart, winEnd);
    return { index: gp.index, coords: gp.coords, label: gp.label, metrics: run?.metrics ?? null };
  });
  const bestIndex = bestPointIndex(points, selectMetric);
  return {
    axes: axesMeta(axes),
    points,
    bestIndex,
    deflated: deflatedForPoints(points, bestIndex),
    selectMetric,
  };
}

/** 轴元信息（key + 取值序列），供 UI 热力图定位坐标 */
function axesMeta(axes: readonly ScanAxis[]): { key: string; values: (number | string)[] }[] {
  return axes.map((a) => ({ key: a.key, values: [...a.values] }));
}

// ────────────────────────────────────────────────────────── oos

function runOosMode(
  dataset: BacktestDataset,
  grid: readonly GridPoint[],
  axes: readonly ScanAxis[],
  selectionsByPoint: readonly RebalanceSelection[][],
  fullStart: string,
  fullEnd: string,
  splitDate: string | null,
  selectMetric: SelectMetric,
): OosResult {
  const split = splitDate ?? midpointDate(fullStart, fullEnd);
  const isEnd = split;
  const oosStart = dayToIso(isoToDay(split) + 1);

  // IS 段扫网格
  const isRuns = grid.map((gp, i) => ({
    gp,
    run: runWindow(dataset, selectionsByPoint[i]!, gp.params, fullStart, isEnd),
  }));
  const isScan: ScanPoint[] = isRuns.map(({ gp, run }) => ({
    index: gp.index,
    coords: gp.coords,
    label: gp.label,
    metrics: run?.metrics ?? null,
  }));
  const winnerIndex = bestPointIndex(isScan, selectMetric);

  let oosMetrics: WindowMetrics | null = null;
  let isNav: NavPoint[] = [];
  let oosNav: NavPoint[] = [];
  let degradation: OosDegradation | null = null;
  const winnerIsMetrics = winnerIndex != null ? isScan[winnerIndex]!.metrics : null;

  if (winnerIndex != null) {
    const gp = grid[winnerIndex]!;
    const isRun = isRuns[winnerIndex]!.run;
    if (isRun) isNav = downsampleMonthly(isRun.result.nav);
    const oosRun = runWindow(dataset, selectionsByPoint[winnerIndex]!, gp.params, oosStart, fullEnd);
    if (oosRun) {
      oosMetrics = oosRun.metrics;
      oosNav = downsampleMonthly(oosRun.result.nav);
    }
    if (winnerIsMetrics && oosMetrics) {
      degradation = oosDegradation(splitMetricsOf(winnerIsMetrics), splitMetricsOf(oosMetrics));
    }
  }

  return {
    splitDate: split,
    axes: axesMeta(axes),
    isScan,
    winnerIndex,
    winnerLabel: winnerIndex != null ? grid[winnerIndex]!.label : null,
    isMetrics: winnerIsMetrics,
    oosMetrics,
    degradation,
    deflated: deflatedForPoints(isScan, winnerIndex),
    isNav,
    oosNav,
  };
}

// ────────────────────────────────────────────────────────── walk-forward

function runWalkforwardMode(
  dataset: BacktestDataset,
  grid: readonly GridPoint[],
  selectionsByPoint: readonly RebalanceSelection[][],
  rebalanceDates: readonly string[],
  fullEnd: string,
  folds: number,
  minTrainPeriods: number,
  selectMetric: SelectMetric,
): WalkforwardResult {
  const nDates = rebalanceDates.length;
  const usableFolds = Math.max(1, Math.min(folds, nDates - minTrainPeriods));
  const testStartIdx = Math.min(minTrainPeriods, nDates - usableFolds);
  const testCount = nDates - testStartIdx;
  const blockSize = Math.max(1, Math.floor(testCount / usableFolds));

  const foldsOut: WalkforwardFold[] = [];
  const segments: NavPoint[][] = [];
  const fixedStrategy = grid.length <= 1;

  for (let f = 0; f < usableFolds; f++) {
    const tStart = testStartIdx + f * blockSize;
    const tEnd = f === usableFolds - 1 ? nDates - 1 : testStartIdx + (f + 1) * blockSize - 1;
    if (tStart > tEnd || tStart >= nDates) break;
    const trainStart = rebalanceDates[0]!;
    const trainEnd = rebalanceDates[tStart - 1]!; // 训练段 = test 前的所有期（扩张窗口）
    const testStartDate = rebalanceDates[tStart]!;
    const testEndDate = f === usableFolds - 1 ? fullEnd : rebalanceDates[tEnd]!;

    // 训练段挑参（仅用 ≤trainEnd 的数据，测试段不回看 → 无前视）
    let winnerIdx = 0;
    if (!fixedStrategy) {
      const trainScan = grid.map((gp, i) => ({
        metrics: runWindow(dataset, selectionsByPoint[i]!, gp.params, trainStart, trainEnd)?.metrics ?? null,
      }));
      winnerIdx = bestPointIndex(trainScan, selectMetric) ?? 0;
    }

    // 测试段跑一次
    const testRun = runWindow(
      dataset,
      selectionsByPoint[winnerIdx]!,
      grid[winnerIdx]!.params,
      testStartDate,
      testEndDate,
    );
    foldsOut.push({
      index: f,
      trainStart,
      trainEnd,
      testStart: testStartDate,
      testEnd: testEndDate,
      winnerLabel: grid[winnerIdx]!.label,
      testMetrics: testRun?.metrics ?? null,
    });
    if (testRun) {
      // 段内日频 nav（拼接需连续；这里用日频保证拐点，最终整体降采样存储）
      segments.push(testRun.result.nav.map((p) => ({ date: p.date, nav: p.nav })));
    }
  }

  const stitchedDaily = stitchWalkForward(segments);
  const stitchedNav = downsampleStitchedMonthly(stitchedDaily);
  let overallMetrics: SplitMetrics | null = null;
  if (stitchedDaily.length >= 2) {
    const m = computeMetrics(
      stitchedDaily.map((p) => ({ date: p.date, nav: p.nav, benchNav: null })),
      0,
    );
    overallMetrics = { cagr: m.cagr, sharpe: m.sharpe, maxDrawdown: m.maxDrawdown, vol: m.vol };
  }

  return { folds: foldsOut, stitchedNav, overallMetrics, fixedStrategy };
}

/** 拼接曲线降采样到月末，保留 segment 序号（异色） */
function downsampleStitchedMonthly(pts: readonly StitchedNavPoint[]): StitchedNavPoint[] {
  const byMonth = new Map<string, StitchedNavPoint>();
  for (const p of pts) byMonth.set(p.date.slice(0, 7), p);
  const out = [...byMonth.values()];
  if (pts.length > 0 && out[0]?.date !== pts[0]!.date) out.unshift(pts[0]!);
  return out;
}

// ────────────────────────────────────────────────────────── 工具

function midpointDate(startIso: string, endIso: string): string {
  const mid = Math.floor((isoToDay(startIso) + isoToDay(endIso)) / 2);
  return dayToIso(mid);
}
