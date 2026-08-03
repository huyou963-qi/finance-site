/**
 * 回测引擎核心（Phase 3 WS1，纯函数）。
 *
 * - 不触库：价格/截面装配在 backtestData.ts，选股复用 screener.ts 的 runScreener
 *   （单一事实来源 = FactorSnapshot，引擎自身不算因子）。
 * - 调仓日历：FactorSnapshot 落库日按「每自然月取最后一期」去重（增量构建会留下
 *   多个月中日期，如 2026-07 有 07-09/07-10/07-13 三期）；起点按策略数据下限裁剪
 *   （引用基本面因子的策略起点 ≥ max(factorRegistry.startYear)）。
 * - 执行时点：信号日 T 的下一交易日收盘成交（nextClose，防同 bar 前视）；
 *   sameClose = T 当日（或 ≤T 的最近交易日）收盘，仅供对照。
 * - NAV 采用「比值形式」：持仓价值 = allocVal × adj(t)/adj(entry)。单股 buy-and-hold
 *   时 NAV ≡ adjClose 比值可逐位复核（WS5 恒等式 a）。目标价值与当前价值完全相等的
 *   持仓不重建（零交易守卫），故「永远持有同一标的」不产生浮点链式误差（恒等式 b）。
 * - adjClose 为 Yahoo 复权价，含分红（已验证），比值即总收益。
 * - 成本 = 双边成交额 × costBps（单边费率，默认 10bp）：每一美元买入或卖出各收一次。
 * - 退市三规则（EquityDelisting 实为指数移出表）：
 *   (a) 仅被移出指数、价格仍在 → 正常持有到下个调仓日；
 *   (b) 价格序列真终止（收购/退市）→ 按最后 adjClose 冻结为现金等价，调仓日转现金
 *       不计卖出成本（无法在市场上成交）；
 *   (c) 选中但无可用价格 → 跳过并计数上报（数据边界透明化）。
 */

import { FACTOR_MAP } from "@/lib/quant/factorRegistry";
import { referencedFactorKeys, type ScreenerConfig, type ScreenerStats } from "@/lib/quant/screener";

// ────────────────────────────────────────────────────────── 日期工具

const DAY_MS = 86_400_000;

/** ISO 日期 → epoch 天数（UTC） */
export function isoToDay(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00.000Z`) / DAY_MS);
}

export function dayToIso(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────── 参数模型

export type BacktestWeighting = "equal" | "mcap" | "score";
export type BacktestExecution = "nextClose" | "sameClose";

export type BacktestParams = {
  /** YYYY-MM-DD；缺省 = 策略数据下限起 */
  start?: string | null;
  /** YYYY-MM-DD；缺省 = 数据最新 */
  end?: string | null;
  /** 权重模式：equal 等权 / mcap 市值加权（exp(logMarketCap)）/ score 复合分加权 */
  weighting: BacktestWeighting;
  /** 执行时点，默认 nextClose */
  execution: BacktestExecution;
  /** 单边费率（bp），对买卖双边成交额各收一次；默认 10 */
  costBps: number;
  /**
   * 调仓频率，默认 monthly。引擎本身只消费传入的 selections，本参数由数据层
   * （executeBacktest/executeRobustness）在构建调仓日历时消费并随 run 一起持久化，
   * 使「换手成本 vs 信号衰减」可作为一个可回放的参数被对照。
   */
  rebalanceFrequency?: RebalanceFrequency | null;
  /**
   * regime 条件化（Phase 4 WS4）：仅当调仓日 PIT regime ∈ 此集合才建仓，否则清仓持现金。
   * 缺省/空 = 不过滤。regime 值挂在 RebalanceSelection.regime（backtestData 按信号日 PIT 注入）。
   */
  regimeFilter?: string[] | null;
  /**
   * regime 未命中时保留的目标仓位比例（0–1），命中时恒为 1。默认 0 = 清仓持现金（旧行为）。
   *
   * 二元开关把择时压成「全仓 / 空仓」，其降波动的收益里混着「单纯降暴露」的成分，
   * 无法与等平均暴露的常数仓位对照。给出连续比例后，可用同一平均暴露的常数仓位作
   * 对照组，把真正的择时能力从降暴露里剥离出来。regimeFilter 为空时本参数无效。
   */
  regimeBlockedExposure?: number | null;
};

export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  weighting: "equal",
  execution: "nextClose",
  costBps: 10,
};

export function validateBacktestParams(params: BacktestParams): void {
  for (const [k, v] of [["start", params.start], ["end", params.end]] as const) {
    if (v != null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw new Error(`${k} 格式应为 YYYY-MM-DD：${v}`);
    }
  }
  if (params.start && params.end && params.start > params.end) {
    throw new Error("start 不能晚于 end");
  }
  if (!["equal", "mcap", "score"].includes(params.weighting)) {
    throw new Error(`未知权重模式：${params.weighting}`);
  }
  if (!["nextClose", "sameClose"].includes(params.execution)) {
    throw new Error(`未知执行模式：${params.execution}`);
  }
  if (!Number.isFinite(params.costBps) || params.costBps < 0) {
    throw new Error("costBps 必须是非负数");
  }
  if (params.regimeFilter != null) {
    if (!Array.isArray(params.regimeFilter)) throw new Error("regimeFilter 必须是数组");
    for (const r of params.regimeFilter) {
      if (!isValidRegimeFilterKey(r)) throw new Error(`未知 regime：${r}`);
    }
  }
  if (
    params.rebalanceFrequency != null &&
    !(params.rebalanceFrequency in REBALANCE_MONTH_STEP)
  ) {
    throw new Error(`未知调仓频率：${params.rebalanceFrequency}`);
  }
  const ex = params.regimeBlockedExposure;
  if (ex != null && (!Number.isFinite(ex) || ex < 0 || ex > 1)) {
    throw new Error("regimeBlockedExposure 必须在 0–1 之间");
  }
}

export const REGIME_QUADRANTS = ["recovery", "overheat", "stagflation", "contraction"] as const;
export const REGIME_DIRECTIONS = ["rising", "falling"] as const;
/** Dalio 式象限（增长方向 × 通胀方向），filter 里带 `dalio:` 前缀 */
export const DALIO_QUADRANTS = ["reflation", "goldilocks", "stagflation", "deflation"] as const;
export const DALIO_PREFIX = "dalio:";

/**
 * regimeFilter 键三种形态：
 *  1. `<象限>`                 —— 水平口径象限（recovery/overheat/stagflation/contraction）
 *  2. `<象限>-<增长方向>`      —— 象限 + 方向，如 stagflation-rising 是再通胀
 *     （2020-08~2021-04 大牛市），stagflation-falling 才是真滞胀
 *  3. `dalio:<Dalio象限>`      —— 两轴同为方向的 Dalio 口径，与 1/2 **并列**
 *
 * 前缀必须：`stagflation` 在两套口径里同名但语义不同（水平口径含「增长低于近十年均值」
 * 条件，Dalio 口径只看方向），不加前缀无法区分。
 */
export function isValidRegimeFilterKey(key: string): boolean {
  if (key.startsWith(DALIO_PREFIX)) {
    return (DALIO_QUADRANTS as readonly string[]).includes(key.slice(DALIO_PREFIX.length));
  }
  const [q, dir, ...rest] = key.split("-");
  if (rest.length > 0) return false;
  if (!q || !(REGIME_QUADRANTS as readonly string[]).includes(q)) return false;
  if (dir === undefined) return true;
  return (REGIME_DIRECTIONS as readonly string[]).includes(dir);
}

/**
 * 该调仓期是否被 regimeFilter 放行。三类键取或——命中任一即持仓：
 *  - 象限键          匹配整个水平口径象限
 *  - 象限-方向键     只匹配该增长方向
 *  - `dalio:` 前缀键 匹配 Dalio 口径象限（与前两者并列，可混用于同一 filter）
 *
 * 未知一律拦截（宁可空仓不乱开仓）：regime 为 null → 前两类都不放行；
 * 方向为 null → 象限-方向键不放行；dalioRegime 为 null → dalio 键不放行。
 */
export function regimeAllowed(
  filter: ReadonlySet<string> | null,
  regime: string | null | undefined,
  direction: string | null | undefined,
  dalioRegime?: string | null,
): boolean {
  if (filter == null) return true;
  if (regime != null) {
    if (filter.has(regime)) return true;
    if (direction != null && filter.has(`${regime}-${direction}`)) return true;
  }
  return dalioRegime != null && filter.has(`${DALIO_PREFIX}${dalioRegime}`);
}

// ────────────────────────────────────────────────────────── 调仓日历

/**
 * 策略数据下限：引用因子（条件+排序+权重）里最晚的 startYear 决定回测最早起点。
 * mcap 加权 / 最小市值过滤依赖 logMarketCap（基本面，2021 起）。
 */
export function strategyDataFloor(config: ScreenerConfig, weighting: BacktestWeighting): string {
  const keys = new Set(referencedFactorKeys(config));
  if (weighting === "mcap" || config.universe?.minMarketCap != null) keys.add("logMarketCap");
  let year = 2000;
  for (const key of keys) {
    const def = FACTOR_MAP.get(key);
    if (def && def.startYear > year) year = def.startYear;
  }
  return `${year}-01-01`;
}

/** 调仓频率；月频以外按「每 k 个可用月取一期」抽稀 */
export type RebalanceFrequency = "monthly" | "quarterly" | "semiannual" | "annual";

export const REBALANCE_MONTH_STEP: Record<RebalanceFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * 调仓日历：因子落库日（升序 ISO）按自然月取最后一期去重，再按 [start, end] 裁剪。
 * start 应已含 strategyDataFloor 裁剪（buildBacktestCalendar 的调用方负责取 max）。
 *
 * frequency 非月频时**在裁剪之后**每 k 个月取一期（从区间首期起算），保证首期与月频一致、
 * 间隔均匀；先抽稀再裁剪会让 start 的微小变化整体平移相位，两次回测不可比。
 */
export function buildRebalanceCalendar(
  factorDates: readonly string[],
  opts: { start?: string | null; end?: string | null; frequency?: RebalanceFrequency } = {},
): string[] {
  const byMonth = new Map<string, string>();
  for (const d of factorDates) {
    const month = d.slice(0, 7);
    const prev = byMonth.get(month);
    if (!prev || d > prev) byMonth.set(month, d);
  }
  const inRange = [...byMonth.values()]
    .filter((d) => (!opts.start || d >= opts.start) && (!opts.end || d <= opts.end))
    .sort();
  const step = REBALANCE_MONTH_STEP[opts.frequency ?? "monthly"] ?? 1;
  if (step <= 1) return inRange;
  return inRange.filter((_, i) => i % step === 0);
}

// ────────────────────────────────────────────────────────── 数据集/选股输入

/** 单标的价格序列：days 升序 epoch 天，closes 为同长度 adjClose（含分红复权） */
export type SymbolPrices = {
  days: number[];
  closes: number[];
};

export type BacktestDataset = {
  /** 主交易日历（= 基准 SPY 的交易日，epoch 天升序） */
  calendar: number[];
  prices: ReadonlyMap<string, SymbolPrices>;
  /** 基准（SPY）；null = 无基准列 */
  bench: SymbolPrices | null;
};

/** 调仓日 T 的选股结果（runScreener 输出裁剪），rows 顺序即目标排序 */
export type RebalanceSelection = {
  /** 因子截面日（信号日）ISO */
  date: string;
  rows: { symbol: string; marketCap: number | null; score: number | null }[];
  /** 选股统计（宇宙覆盖率/剔除计数，透明化上报用；引擎不消费） */
  stats?: ScreenerStats | null;
  /** 信号日 PIT regime 象限（regimeFilter 用；backtestData 注入，null=未知） */
  regime?: string | null;
  /** 信号日增长方向（rising/falling）；supports `<象限>-<方向>` 形式的 regimeFilter 键 */
  growthDirection?: string | null;
  /** 信号日 Dalio 象限（增长方向×通胀方向）；supports `dalio:<象限>` 形式的 filter 键 */
  dalioRegime?: string | null;
  /**
   * 信号日所属月的 NBER USREC 真值（1=衰退 / 0=否 / null=未知）。
   * 仅作覆盖度透明化——**不进任何交易判定**（NBER 公告长滞后，当信号会前视）。
   * 与 regime 象限须分开看：contraction 象限只是增长动能向下，绝大多数不是真衰退。
   */
  recession?: number | null;
};

// ────────────────────────────────────────────────────────── 输出模型

export type BacktestNavPoint = {
  date: string;
  nav: number;
  benchNav: number | null;
};

export type PositionExitReason = "sold" | "carried" | "liquidated" | "endOfBacktest";

export type BacktestPositionRow = {
  /** 信号日（因子截面日） */
  rebalanceDate: string;
  symbol: string;
  /** 目标权重（跳过无价标的后重归一） */
  weight: number;
  /** 入场 adjClose（复权口径，非名义价） */
  entryPrice: number;
  exitReason: PositionExitReason;
};

export type BacktestPeriodReport = {
  /** 信号日 */
  date: string;
  /** 实际成交日 */
  execDate: string;
  /** 选股返回数 */
  selected: number;
  /** 实际持仓数（扣除无价跳过/权重缺失） */
  held: number;
  /** 无可用价格被跳过的标的数（退市规则 c） */
  noPriceSkipped: number;
  /** mcap/score 加权时权重输入缺失被剔除的标的数 */
  droppedNoWeight: number;
  /** 本期按最后价冻结转现金的旧持仓数（退市规则 b） */
  liquidated: number;
  /** 双边成交额 / 调仓前 NAV（买+卖各计一次；首期 = 1） */
  turnover: number;
  /** 本期成本扣减（NAV 相对量） */
  cost: number;
  /** 选股统计（透明化） */
  stats: ScreenerStats | null;
  /** 信号日 PIT regime（透明化；无过滤时仍回填便于对照） */
  regime: string | null;
  /** 信号日增长方向（透明化；与象限的「水平」正交） */
  growthDirection: string | null;
  /** 信号日 Dalio 象限（透明化；与 regime 并列的另一套口径） */
  dalioRegime: string | null;
  /** 信号日所属月 NBER USREC 真值（1/0/null）；仅透明化，不参与交易判定 */
  recession: number | null;
  /** 本期被 regimeFilter 拦截（按 regimeBlockedExposure 减仓，默认清仓持现金） */
  regimeBlocked: boolean;
  /** 本期实际目标暴露（1=满仓，0=空仓）；拦截期 = regimeBlockedExposure */
  exposure: number;
};

export type BacktestMetrics = {
  /** 年化收益（365.25 天口径） */
  cagr: number;
  /** 年化波动（日简单收益 std × √252） */
  vol: number;
  /** 夏普（rf=0：日均收益×252 / 年化波动） */
  sharpe: number;
  /** 最大回撤（负数） */
  maxDrawdown: number;
  /** Calmar = CAGR / |最大回撤| */
  calmar: number | null;
  /** 月胜率 vs 基准（自然月收益逐月比较；无基准 = null） */
  monthlyWinRate: number | null;
  /** 参与比较的完整月数 */
  monthlyCount: number;
  /** 平均年换手（单边口径 = 双边/2 按年平均） */
  avgAnnualTurnover: number;
  benchCagr: number | null;
  benchMaxDrawdown: number | null;
  /**
   * 年化跟踪误差 = std(日超额收益) × √252。超额取**算术差** r − r_bench
   * （非对数差）：与 IR 分子同口径才可比。无基准 = null。
   */
  trackingError: number | null;
  /**
   * 信息比 IR = 年化超额均值 / 跟踪误差。衡量「相对基准的主动收益是否稳定」，
   * 与夏普正交：夏普高可能只是 beta 高，IR 高才说明选股本身有超额。无基准/TE=0 = null。
   */
  informationRatio: number | null;
  /** 累计超额 = 策略累计涨幅 − 基准累计涨幅（区间端点口径）。无基准 = null */
  cumulativeExcess: number | null;
  /** 回测天数（自然日） */
  days: number;
};

export type BacktestResult = {
  nav: BacktestNavPoint[];
  positions: BacktestPositionRow[];
  periods: BacktestPeriodReport[];
  metrics: BacktestMetrics;
  /** 宏观状态覆盖度（透明化：本回测到底见过多少种宏观环境） */
  regimeCoverage: RegimeCoverage;
};

// ────────────────────────────────────────────────── regime 覆盖度（透明化）

/** 象限样本低于此期数 → 该象限结论不可靠 */
export const THIN_QUADRANT_PERIODS = 12;
/** NBER 衰退期样本低于此期数 → 下行/危机行为结论不可靠 */
export const THIN_RECESSION_PERIODS = 6;

export type RegimeCoverage = {
  /** 总调仓期数 */
  total: number;
  /** 各象限调仓期数（recovery/overheat/stagflation/contraction） */
  byQuadrant: Record<string, number>;
  /** regime 未知的期数（macro_regime 未覆盖该日） */
  unknown: number;
  /** 落在 NBER 衰退月的调仓期数 */
  recessionPeriods: number;
  /** recession 真值未知的期数 */
  recessionUnknown: number;
  /** 样本不足（< THIN_QUADRANT_PERIODS）的象限名 */
  thinQuadrants: string[];
  /** 衰退样本是否不足（< THIN_RECESSION_PERIODS） */
  recessionThin: boolean;
};

/**
 * 统计本回测覆盖了哪些宏观状态。
 *
 * 为什么必须单列 NBER 衰退期数：contraction 象限只表示「增长动能向下」，
 * 中周期放缓也计入——实测 2013+ 有 39 个 contraction 月但仅 1 个真衰退月。
 * 只看象限分布会误以为下行样本充足。
 */
export function computeRegimeCoverage(
  periods: readonly Pick<BacktestPeriodReport, "regime" | "recession">[],
): RegimeCoverage {
  const byQuadrant: Record<string, number> = {
    recovery: 0,
    overheat: 0,
    stagflation: 0,
    contraction: 0,
  };
  let unknown = 0;
  let recessionPeriods = 0;
  let recessionUnknown = 0;
  for (const p of periods) {
    if (p.regime == null) unknown++;
    else byQuadrant[p.regime] = (byQuadrant[p.regime] ?? 0) + 1;
    if (p.recession == null || p.recession < 0) recessionUnknown++;
    else if (p.recession > 0) recessionPeriods++;
  }
  const thinQuadrants = Object.entries(byQuadrant)
    .filter(([, n]) => n < THIN_QUADRANT_PERIODS)
    .map(([k]) => k);
  return {
    total: periods.length,
    byQuadrant,
    unknown,
    recessionPeriods,
    recessionUnknown,
    thinQuadrants,
    recessionThin: recessionPeriods < THIN_RECESSION_PERIODS,
  };
}

// ────────────────────────────────────────────────────────── 价格查找

/** days 中 ≤ day 的最大下标；无则 -1 */
function lowerBound(days: readonly number[], day: number): number {
  let lo = 0;
  let hi = days.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid]! <= day) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** 距 execDay 超过此天数没有新价 → 视为价格序列终止（与 pitCrossSection 陈旧阈值一致） */
export const PRICE_STALE_DAYS = 7;

type PriceCursor = {
  series: SymbolPrices;
  /** 单调游标：日历升序推进时避免重复二分 */
  idx: number;
};

function priceAt(cur: PriceCursor, day: number): { px: number; pxDay: number } | null {
  const { days, closes } = cur.series;
  // 游标推进（day 单调递增时 O(1)）
  while (cur.idx + 1 < days.length && days[cur.idx + 1]! <= day) cur.idx++;
  if (cur.idx < 0 || days[cur.idx]! > day) {
    // 游标可能落后于起点（首次查询），做一次二分校正
    const i = lowerBound(days, day);
    if (i < 0) return null;
    cur.idx = i;
  }
  return { px: closes[cur.idx]!, pxDay: days[cur.idx]! };
}

// ────────────────────────────────────────────────────────── 权重

/**
 * score 加权的归一：复合分可能为负，将截面平移到非负后按比例分配。
 * 平移量 = −min + span/n（最差者仍保留正权重、排序单调保持）；全同分 → 等权。
 */
export function normalizeScoreWeights(scores: readonly number[]): number[] {
  const n = scores.length;
  if (n === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (min > 0) {
    const sum = scores.reduce((a, b) => a + b, 0);
    return scores.map((s) => s / sum);
  }
  const span = max - min;
  if (span === 0) return scores.map(() => 1 / n);
  const floor = span / n;
  const shifted = scores.map((s) => s - min + floor);
  const sum = shifted.reduce((a, b) => a + b, 0);
  return shifted.map((s) => s / sum);
}

// ────────────────────────────────────────────────────────── 主引擎

type Holding = {
  symbol: string;
  /** 入场时分配的美元价值（NAV 相对量） */
  allocVal: number;
  /** 入场 adjClose */
  entryPx: number;
  entryDay: number;
  /** 该持仓所属调仓期在 positions 输出中的行下标（用于回填 exitReason） */
  rowIdx: number;
};

/**
 * 执行回测。纯函数：同输入必同输出（WS5 恒等式 e 的基础）。
 * selections 需按 date 升序；执行日 = 信号日的下一交易日（nextClose）或
 * ≤ 信号日的最近交易日（sameClose）。执行日相同/乱序的期次跳过后一期。
 */
export function runBacktest(
  dataset: BacktestDataset,
  selections: readonly RebalanceSelection[],
  params: BacktestParams,
): BacktestResult {
  validateBacktestParams(params);
  const costRate = params.costBps / 10_000;
  const regimeSet =
    params.regimeFilter && params.regimeFilter.length ? new Set(params.regimeFilter) : null;
  const blockedExposure = params.regimeBlockedExposure ?? 0;

  // 1) 求各期执行日（主日历上），并去除执行日重复/越界的期次
  const cal = dataset.calendar;
  if (cal.length === 0) throw new Error("主交易日历为空");
  const endDay = params.end ? isoToDay(params.end) : cal[cal.length - 1]!;

  type PlannedRebalance = { execDay: number; sel: RebalanceSelection };
  const planned: PlannedRebalance[] = [];
  for (const sel of selections) {
    const sigDay = isoToDay(sel.date);
    let execDay: number | null = null;
    if (params.execution === "nextClose") {
      // 首个 > 信号日的交易日
      const i = lowerBound(cal, sigDay);
      execDay = i + 1 < cal.length ? cal[i + 1]! : null;
    } else {
      const i = lowerBound(cal, sigDay);
      execDay = i >= 0 ? cal[i]! : null;
    }
    if (execDay == null || execDay > endDay) continue;
    const last = planned[planned.length - 1];
    if (last && execDay <= last.execDay) continue;
    planned.push({ execDay, sel });
  }
  if (planned.length === 0) throw new Error("回测区间内没有可执行的调仓期");

  const startDay = planned[0]!.execDay;
  const navDays = cal.filter((d) => d >= startDay && d <= endDay);

  // 2) 基准游标（日历即 SPY 交易日，基准存在时逐日精确对齐）
  const benchCur: PriceCursor | null = dataset.bench
    ? { series: dataset.bench, idx: -1 }
    : null;
  const benchStart = benchCur ? priceAt(benchCur, startDay) : null;

  const cursorBySymbol = new Map<string, PriceCursor>();
  const cursorOf = (symbol: string): PriceCursor | null => {
    let cur = cursorBySymbol.get(symbol);
    if (!cur) {
      const series = dataset.prices.get(symbol);
      if (!series || series.days.length === 0) return null;
      cur = { series, idx: -1 };
      cursorBySymbol.set(symbol, cur);
    }
    return cur;
  };

  // 3) 主循环：沿主日历逐日估值，执行日做调仓
  const nav: BacktestNavPoint[] = [];
  const positions: BacktestPositionRow[] = [];
  const periods: BacktestPeriodReport[] = [];
  let holdings: Holding[] = [];
  let cash = 1; // 起点 NAV = 1，全部现金
  let nextRebalance = 0;
  let totalTurnover = 0;

  const valueOf = (h: Holding, day: number): { val: number; pxDay: number } => {
    const cur = cursorOf(h.symbol)!;
    const p = priceAt(cur, day)!; // 入场时必有价，故 ≤ day 必有值
    // 目标价值恰好等于当前价值时持仓未重建：px == entryPx 时价值即 allocVal（零交易守卫的逐位对应）
    return { val: p.px === h.entryPx ? h.allocVal : h.allocVal * (p.px / h.entryPx), pxDay: p.pxDay };
  };

  for (const day of navDays) {
    // ── 调仓（收盘价成交：先按当日收盘估值旧组合，再切换到新组合）
    while (nextRebalance < planned.length && planned[nextRebalance]!.execDay === day) {
      const { sel } = planned[nextRebalance]!;
      nextRebalance++;

      // 旧持仓按当日收盘估值，区分「可交易」与「价格已终止（冻结转现金）」
      let liveVal = 0;
      let frozenVal = 0;
      let liquidatedCount = 0;
      const liveValBySymbol = new Map<string, number>();
      for (const h of holdings) {
        const { val, pxDay } = valueOf(h, day);
        if (day - pxDay > PRICE_STALE_DAYS) {
          frozenVal += val; // 规则 b：按最后 adjClose 清算为现金，不计卖出成本
          liquidatedCount++;
          positions[h.rowIdx]!.exitReason = "liquidated";
        } else {
          liveVal += val;
          liveValBySymbol.set(h.symbol, (liveValBySymbol.get(h.symbol) ?? 0) + val);
        }
      }
      const navPre = cash + liveVal + frozenVal;

      // regime 门：调仓日 PIT regime ∉ 过滤集 → 本期减仓到 blockedExposure（默认 0 = 持现金）
      const regimeBlocked = !regimeAllowed(regimeSet, sel.regime, sel.growthDirection, sel.dalioRegime);
      const exposure = regimeBlocked ? blockedExposure : 1;

      // 目标组合：跳过无价标的（规则 c）与权重输入缺失的标的，剩余重归一
      let noPriceSkipped = 0;
      let droppedNoWeight = 0;
      type Target = { symbol: string; px: number; raw: number; score: number | null };
      const targets: Target[] = [];
      const seen = new Set<string>();
      for (const r of exposure > 0 ? sel.rows : []) {
        if (seen.has(r.symbol)) continue;
        seen.add(r.symbol);
        const cur = cursorOf(r.symbol);
        const p = cur ? priceAt(cur, day) : null;
        if (!p || day - p.pxDay > PRICE_STALE_DAYS) {
          noPriceSkipped++;
          continue;
        }
        if (params.weighting === "mcap") {
          if (r.marketCap == null || !(r.marketCap > 0)) {
            droppedNoWeight++;
            continue;
          }
          targets.push({ symbol: r.symbol, px: p.px, raw: r.marketCap, score: r.score });
        } else if (params.weighting === "score") {
          if (r.score == null || !Number.isFinite(r.score)) {
            droppedNoWeight++;
            continue;
          }
          targets.push({ symbol: r.symbol, px: p.px, raw: r.score, score: r.score });
        } else {
          targets.push({ symbol: r.symbol, px: p.px, raw: 1, score: r.score });
        }
      }

      let weights: number[];
      if (params.weighting === "score") {
        weights = normalizeScoreWeights(targets.map((t) => t.raw));
      } else {
        const sum = targets.reduce((a, t) => a + t.raw, 0);
        weights = sum > 0 ? targets.map((t) => t.raw / sum) : [];
      }

      // 成交额（双边）：|目标价值 − 当前可交易价值|，冻结部分已是现金不计卖出
      const targetValBySymbol = new Map<string, number>();
      targets.forEach((t, i) => targetValBySymbol.set(t.symbol, weights[i]! * exposure * navPre));
      let traded = 0;
      for (const [sym, tv] of targetValBySymbol) {
        traded += Math.abs(tv - (liveValBySymbol.get(sym) ?? 0));
      }
      for (const [sym, lv] of liveValBySymbol) {
        if (!targetValBySymbol.has(sym)) traded += lv;
      }
      const cost = traded * costRate;
      const navPost = navPre - cost;
      const turnover = navPre > 0 ? traded / navPre : 0;
      totalTurnover += turnover;

      // 旧持仓 exitReason 回填（liquidated 已标）
      const targetSet = new Set(targetValBySymbol.keys());
      for (const h of holdings) {
        const row = positions[h.rowIdx]!;
        if (row.exitReason === "liquidated") continue;
        row.exitReason = targetSet.has(h.symbol) ? "carried" : "sold";
      }

      // 建新组合。零交易守卫：目标价值与当前价值逐位相等的持仓原样保留
      // （单一持仓不动时 NAV 序列 = adjClose 比值，WS5 恒等式 a/b 的逐位基础）。
      const oldBySymbol = new Map<string, Holding>();
      for (const h of holdings) {
        if (positions[h.rowIdx]!.exitReason === "carried") oldBySymbol.set(h.symbol, h);
      }
      const newHoldings: Holding[] = [];
      let investedVal = 0; // 新组合按当日收盘计的总价值（现金 = navPost − 该值）
      targets.forEach((t, i) => {
        const w = weights[i]!;
        if (!(w > 0)) return;
        const targetVal = w * exposure * navPost;
        const old = oldBySymbol.get(t.symbol);
        const rowIdx = positions.length;
        positions.push({
          rebalanceDate: sel.date,
          symbol: t.symbol,
          // 记实际 NAV 权重而非组合内权重：减仓期 Σweight = exposure，余下是现金
          weight: w * exposure,
          entryPrice: t.px,
          exitReason: "endOfBacktest",
        });
        if (old && cost === 0 && targetVal === liveValBySymbol.get(t.symbol)) {
          // 未发生交易：保留原 allocVal/entryPx，不引入 px/entryPx 的链式舍入
          newHoldings.push({ ...old, rowIdx });
        } else {
          newHoldings.push({ symbol: t.symbol, allocVal: targetVal, entryPx: t.px, entryDay: day, rowIdx });
        }
        investedVal += targetVal;
      });
      holdings = newHoldings;
      cash = navPost - investedVal;
      // 浮点残差防护：全额投资时 cash 理论为 0
      if (Math.abs(cash) < 1e-12 * Math.max(1, navPost)) cash = 0;

      periods.push({
        date: sel.date,
        execDate: dayToIso(day),
        selected: sel.rows.length,
        held: newHoldings.length,
        noPriceSkipped,
        droppedNoWeight,
        liquidated: liquidatedCount,
        turnover,
        cost,
        stats: sel.stats ?? null,
        regime: sel.regime ?? null,
        growthDirection: sel.growthDirection ?? null,
        dalioRegime: sel.dalioRegime ?? null,
        recession: sel.recession ?? null,
        regimeBlocked,
        exposure,
      });
    }

    // ── 当日估值
    let value = cash;
    for (const h of holdings) value += valueOf(h, day).val;
    let benchNav: number | null = null;
    if (benchCur && benchStart) {
      const p = priceAt(benchCur, day);
      if (p) benchNav = p.px === benchStart.px ? 1 : p.px / benchStart.px;
    }
    nav.push({ date: dayToIso(day), nav: value, benchNav });
  }

  const metrics = computeMetrics(nav, totalTurnover);
  return { nav, positions, periods, metrics, regimeCoverage: computeRegimeCoverage(periods) };
}

// ────────────────────────────────────────────────────────── 绩效指标

/** 年化口径：CAGR 用 365.25 自然日；波动/夏普用 252 交易日；月胜率按自然月末点 */
export function computeMetrics(
  nav: readonly BacktestNavPoint[],
  totalDoubleSidedTurnover: number,
): BacktestMetrics {
  if (nav.length < 2) {
    return {
      cagr: 0, vol: 0, sharpe: 0, maxDrawdown: 0, calmar: null,
      monthlyWinRate: null, monthlyCount: 0, avgAnnualTurnover: 0,
      benchCagr: null, benchMaxDrawdown: null,
      trackingError: null, informationRatio: null, cumulativeExcess: null,
      days: 0,
    };
  }
  const first = nav[0]!;
  const last = nav[nav.length - 1]!;
  const days = isoToDay(last.date) - isoToDay(first.date);
  const years = days / 365.25;

  const growth = last.nav / first.nav;
  const cagr = years > 0 ? Math.pow(growth, 1 / years) - 1 : 0;

  // 日简单收益
  const rets: number[] = [];
  for (let i = 1; i < nav.length; i++) rets.push(nav[i]!.nav / nav[i - 1]!.nav - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.length > 1
    ? rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1)
    : 0;
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  const sharpe = vol > 0 ? (mean * 252) / vol : 0;

  const maxDrawdown = drawdownOf(nav.map((p) => p.nav));

  const hasBench = nav.every((p) => p.benchNav != null);
  const benchCagr = hasBench && years > 0
    ? Math.pow(last.benchNav! / first.benchNav!, 1 / years) - 1
    : null;
  const benchMaxDrawdown = hasBench ? drawdownOf(nav.map((p) => p.benchNav!)) : null;

  // 主动风险：逐日超额 r − r_bench 的年化标准差与信息比
  let trackingError: number | null = null;
  let informationRatio: number | null = null;
  let cumulativeExcess: number | null = null;
  if (hasBench) {
    const excess: number[] = [];
    for (let i = 1; i < nav.length; i++) {
      excess.push(
        nav[i]!.nav / nav[i - 1]!.nav - nav[i]!.benchNav! / nav[i - 1]!.benchNav!,
      );
    }
    if (excess.length > 1) {
      const em = excess.reduce((a, b) => a + b, 0) / excess.length;
      const ev =
        excess.reduce((a, b) => a + (b - em) * (b - em), 0) / (excess.length - 1);
      trackingError = Math.sqrt(ev) * Math.sqrt(252);
      informationRatio =
        trackingError > MIN_TRACKING_ERROR ? (em * 252) / trackingError : null;
    }
    cumulativeExcess = growth - last.benchNav! / first.benchNav!;
  }

  // 月胜率：每自然月最后一个 NAV 点为月末，逐月收益 vs 基准
  let monthlyWinRate: number | null = null;
  let monthlyCount = 0;
  if (hasBench) {
    const monthEnd = new Map<string, BacktestNavPoint>();
    for (const p of nav) monthEnd.set(p.date.slice(0, 7), p); // 升序遍历，后写覆盖
    const pts = [...monthEnd.values()];
    // 首月基线 = 序列起点（否则首月收益因起点被同月月末覆盖而丢失）
    if (pts.length > 0 && pts[0]!.date !== first.date) pts.unshift(first);
    let wins = 0;
    for (let i = 1; i < pts.length; i++) {
      const r = pts[i]!.nav / pts[i - 1]!.nav - 1;
      const rb = pts[i]!.benchNav! / pts[i - 1]!.benchNav! - 1;
      if (r > rb) wins++;
      monthlyCount++;
    }
    monthlyWinRate = monthlyCount > 0 ? wins / monthlyCount : null;
  }

  const avgAnnualTurnover = years > 0 ? totalDoubleSidedTurnover / 2 / years : 0;

  return {
    cagr,
    vol,
    sharpe,
    maxDrawdown,
    calmar: maxDrawdown < 0 ? cagr / Math.abs(maxDrawdown) : null,
    monthlyWinRate,
    monthlyCount,
    avgAnnualTurnover,
    benchCagr,
    benchMaxDrawdown,
    trackingError,
    informationRatio,
    cumulativeExcess,
    days,
  };
}

/**
 * 跟踪误差低于此值即视为「与基准无差异」，IR 记 null。
 * 纯持有基准的策略其逐日超额只剩浮点噪声（年化 TE ~1e-16），不设下限会算出
 * 1e15 量级的假 IR。真实策略的年化 TE 在 1e-2 量级，1e-10 的门槛不会误伤。
 */
const MIN_TRACKING_ERROR = 1e-10;

function drawdownOf(series: readonly number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    const dd = v / peak - 1;
    if (dd < mdd) mdd = dd;
  }
  return mdd;
}
