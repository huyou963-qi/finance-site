/**
 * 美国实际 GDP nowcast —— 纯函数模型（无 DB、无 React）。
 *
 * 目标：实际 GDP 季度环比折年率的「首发值」（BEA advance estimate，%）= 目标季度首次公布时，
 * 该季与上季实际 GDP 水平之比的四次方减一（同一版本）。
 * 方法（桥接方程组合）：每个月度指标按 as-of 日能看到的版本，取目标季度与上一季度的月度均值；
 * 季内尚未公布的月份用该指标自身近 5 年月度增速的 AR(1) 外推。每个指标单独对 GDP 首发值做
 * 滚动 OLS（桥接方程），再按各桥接方程过去的样本外误差取逆 MSE 权重组合。
 * 每个历史季度只用当时可见的版本（ALFRED 真实时点），训练集剔除 2020Q1–2021Q2。
 * 研究与验证：docs/research/US_GDP_NOWCAST.md。
 */
import { quantile, solveOls } from "../usCpi/model";
import { addDays, addMonths, minIso, valueAsOf, type RevisionLedger } from "../usNfp/model";

export { addDays, addMonths, minIso, valueAsOf, type RevisionLedger };

/**
 * growth —— 季均水平的折年增速 %（缺月 AR(1) 外推）
 * level  —— 季均水平（扩散指数；缺月沿用最后值）
 * nx     —— 贸易差额（百万美元/月）季均变化对 GDP 的折年拉动 %（缺月沿用最后值）
 * inv    —— 库存存量（百万美元，月末）隐含的存货投资变化对 GDP 的折年拉动 %（缺月 AR(1) 外推）
 */
export type IndicatorTransform = "growth" | "level" | "nx" | "inv";
export type IndicatorSpec = { key: string; transform: IndicatorTransform };

export type GdpModelInputs = {
  /** 实际 GDP 水平版本账本（季度，键为季度首月 YYYY-MM-01） */
  gdp: RevisionLedger;
  /** 名义 GDP（十亿美元，折年）版本账本：nx / inv 换算成 GDP 拉动的分母 */
  nominalGdp: RevisionLedger;
  /** 月度指标版本账本 */
  monthly: Record<string, RevisionLedger>;
};

const COVID_FROM = "2020-01-01";
const COVID_TO = "2021-04-01";
/** AR(1) 外推的估计窗口（月） */
const AR_WINDOW = 60;
const MIN_HISTORY = 24;

export const isCovidQuarter = (q: string) => q >= COVID_FROM && q <= COVID_TO;

// ─────────────────────────────────────────────────────────────── 季度工具 ──

export function quarterOf(month: string): string {
  const y = month.slice(0, 4);
  const m = Number(month.slice(5, 7));
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}
export const addQuarters = (q: string, k: number) => addMonths(q, 3 * k);
export const quarterLabel = (q: string) => `${q.slice(0, 4)}Q${Math.floor((Number(q.slice(5, 7)) - 1) / 3) + 1}`;

const annualized = (ratio: number) => (Math.pow(ratio, 4) - 1) * 100;

// ─────────────────────────────────────────────────────────────── GDP 版本 ──

/** as-of 日能看到的 q 季折年增速（两季水平取同一版本）；不可见为 NaN */
export function gdpGrowthAsOf(gdp: RevisionLedger, q: string, asOf: string): number {
  return annualized(valueAsOf(gdp, q, asOf) / valueAsOf(gdp, addQuarters(q, -1), asOf));
}

/** 首发日与首发折年增速 */
export function gdpFirstRelease(gdp: RevisionLedger, q: string): { at: string; growth: number } | null {
  const revs = gdp.get(q);
  if (!revs?.length) return null;
  const at = revs[0]!.at;
  const growth = gdpGrowthAsOf(gdp, q, at);
  return Number.isFinite(growth) ? { at, growth } : null;
}

/** as-of 日能看到的最新季度（首发日 ≤ as-of） */
export function latestGdpQuarter(gdp: RevisionLedger, asOf: string): string | null {
  let best: string | null = null;
  for (const [q, revs] of gdp) if (revs[0]!.at <= asOf && (!best || q > best)) best = q;
  return best;
}

// ─────────────────────────────────────────────────────────────── 月度指标 ──

export type IndicatorValue = {
  /** growth：季均折年增速 %；level：季均水平 */
  value: number;
  /** 目标季度已公布的月数（0–3） */
  observed: number;
};

/** 最后一个可见月之后的月份按近 5 年月度对数增速的 AR(1) 外推（就地写入 byMonth） */
function fillAr(levels: ReadonlyArray<{ m: string; v: number }>, byMonth: Map<string, number>, end: string): boolean {
  if (levels.some((l) => l.v <= 0)) return false;
  const g: number[] = [];
  for (let i = 1; i < levels.length; i++) {
    if (addMonths(levels[i - 1]!.m, 1) !== levels[i]!.m) {
      g.length = 0;
      continue;
    }
    g.push(Math.log(levels[i]!.v / levels[i - 1]!.v));
  }
  if (g.length < MIN_HISTORY - 1) return false;
  const tail = g.slice(-AR_WINDOW);
  const beta = solveOls(tail.slice(0, -1).map((v) => [1, v]), tail.slice(1));
  const c = beta?.[0] ?? tail.reduce((s, v) => s + v, 0) / tail.length;
  const phi = beta ? Math.max(-0.9, Math.min(0.9, beta[1]!)) : 0;
  const last = levels[levels.length - 1]!;
  let prevG = tail[tail.length - 1]!;
  let lv = last.v;
  for (let m = addMonths(last.m, 1); m <= end; m = addMonths(m, 1)) {
    prevG = c + phi * prevG;
    lv *= Math.exp(prevG);
    byMonth.set(m, lv);
  }
  return true;
}

/** as-of 日能看到的最新名义 GDP 水平（十亿美元，折年） */
function nominalScale(ledger: RevisionLedger, asOf: string): number {
  const q = latestGdpQuarter(ledger, asOf);
  return q ? valueAsOf(ledger, q, asOf) : NaN;
}

/**
 * as-of 日某月度指标对目标季度 q 的取值。季内（及之前）未公布的月份按变换类型外推；
 * 可见历史不足 24 个月、或最新可见月早于上季度首月，返回 null。
 */
export function indicatorAsOf(
  ledger: RevisionLedger,
  spec: IndicatorSpec,
  q: string,
  asOf: string,
  nominalGdp?: RevisionLedger,
): IndicatorValue | null {
  const end = addMonths(q, 2);
  const from = addMonths(q, -6 - AR_WINDOW);
  const levels: Array<{ m: string; v: number }> = [];
  for (let m = from; m <= end; m = addMonths(m, 1)) {
    const v = valueAsOf(ledger, m, asOf);
    if (Number.isFinite(v)) levels.push({ m, v });
  }
  if (levels.length < MIN_HISTORY) return null;
  const last = levels[levels.length - 1]!;
  if (last.m < addMonths(q, -3)) return null;
  const byMonth = new Map(levels.map((l) => [l.m, l.v]));
  const observed = [q, addMonths(q, 1), end].filter((m) => byMonth.has(m)).length;
  const avg = (start: string) =>
    [start, addMonths(start, 1), addMonths(start, 2)].reduce((s, m) => s + (byMonth.get(m) ?? NaN), 0) / 3;
  const fillLast = () => {
    for (let m = addMonths(last.m, 1); m <= end; m = addMonths(m, 1)) byMonth.set(m, last.v);
  };

  let value: number;
  if (spec.transform === "level") {
    fillLast();
    value = avg(q);
  } else if (spec.transform === "nx") {
    fillLast();
    // 月度差额 ×12 折年，除以名义 GDP（十亿 → 百万），季度变化 ×4 折年
    value = (400 * 12 * (avg(q) - avg(addQuarters(q, -1)))) / (1000 * nominalScale(nominalGdp ?? new Map(), asOf));
  } else {
    if (!fillAr(levels, byMonth, end)) return null;
    if (spec.transform === "growth") {
      value = annualized(avg(q) / avg(addQuarters(q, -1)));
    } else {
      // 存货投资（折年）≈ 4 × 季末存量变化；其变化即对 GDP 的拉动
      const endOf = (k: number) => byMonth.get(addMonths(q, 2 - 3 * k)) ?? NaN;
      const cbi = (k: number) => 4 * (endOf(k) - endOf(k + 1));
      value = (400 * (cbi(0) - cbi(1))) / (1000 * nominalScale(nominalGdp ?? new Map(), asOf));
    }
  }
  return Number.isFinite(value) ? { value, observed } : null;
}

// ─────────────────────────────────────────────────────────────── 数据集 ──

/** as-of 规则：给定目标季度与其首发日，返回该时点（首发前一天封顶） */
export type AsOfRule = (q: string, releaseAt: string) => string;
export const asOfOffset = (days: number): AsOfRule => (q, rel) => minIso(addDays(q, days), addDays(rel, -1));
export const asOfPreRelease: AsOfRule = (_q, rel) => addDays(rel, -1);

export type DatasetRow = {
  quarter: string;
  releaseAt: string;
  asOf: string;
  x: Record<string, IndicatorValue>;
  y: number;
  /** 同一时点的简单基准：最新可见季度增速、过去 40 季均值 */
  prevQ: number;
  mean40: number;
};

export function buildDataset(
  inputs: GdpModelInputs,
  specs: readonly IndicatorSpec[],
  rule: AsOfRule,
  quarters?: readonly string[],
): DatasetRow[] {
  const rows: DatasetRow[] = [];
  const qs = quarters ?? [...inputs.gdp.keys()].sort();
  for (const q of qs) {
    const fr = gdpFirstRelease(inputs.gdp, q);
    if (!fr) continue;
    rows.push(datasetRow(inputs, specs, q, rule(q, fr.at), fr));
  }
  return rows;
}

/** 单季度在 as-of 日的特征与基准；fr 为空表示尚未公布（y=NaN） */
export function datasetRow(
  inputs: GdpModelInputs,
  specs: readonly IndicatorSpec[],
  q: string,
  asOf: string,
  fr: { at: string; growth: number } | null,
): DatasetRow {
  const x: Record<string, IndicatorValue> = {};
  for (const s of specs) {
    const ledger = inputs.monthly[s.key];
    const v = ledger ? indicatorAsOf(ledger, s, q, asOf, inputs.nominalGdp) : null;
    if (v) x[s.key] = v;
  }
  const lastQ = latestGdpQuarter(inputs.gdp, asOf);
  const past: number[] = [];
  if (lastQ) for (let k = 0; k < 40; k++) past.push(gdpGrowthAsOf(inputs.gdp, addQuarters(lastQ, -k), asOf));
  const finite = past.filter(Number.isFinite);
  return {
    quarter: q,
    releaseAt: fr?.at ?? "",
    asOf,
    x,
    y: fr?.growth ?? NaN,
    prevQ: finite[0] ?? NaN,
    mean40: finite.length ? finite.reduce((s, v) => s + v, 0) / finite.length : NaN,
  };
}

// ─────────────────────────────────────────────────────────────── 估计 ──

/** 一条桥接方程：GDP 首发值对若干指标季度值的 OLS */
export type EquationSpec = { key: string; inputs: readonly string[] };

export type ModelConfig = {
  equations: readonly EquationSpec[];
  /** 滚动训练窗口（季度） */
  window: number;
  minTrain: number;
  /** 组合权重：逆 MSE 所用的过去样本外误差季度数；0 = 等权 */
  weightWindow: number;
};

export type FittedEquation = { key: string; intercept: number; coef: Record<string, number>; n: number };

export function fitEquation(
  rows: readonly DatasetRow[],
  target: DatasetRow,
  cfg: ModelConfig,
  eq: EquationSpec,
): FittedEquation | null {
  const train = rows
    .filter(
      (r) =>
        r.quarter < target.quarter &&
        r.releaseAt <= target.asOf &&
        !isCovidQuarter(r.quarter) &&
        eq.inputs.every((k) => r.x[k]),
    )
    .slice(-cfg.window);
  if (train.length < cfg.minTrain + eq.inputs.length) return null;
  const beta = solveOls(train.map((r) => [1, ...eq.inputs.map((k) => r.x[k]!.value)]), train.map((r) => r.y));
  if (!beta) return null;
  const coef: Record<string, number> = {};
  eq.inputs.forEach((k, i) => (coef[k] = beta[i + 1]!));
  return { key: eq.key, intercept: beta[0]!, coef, n: train.length };
}

export type EquationNowcast = { key: string; fit: FittedEquation; forecast: number; weight: number };

export type Nowcast = { forecast: number; parts: EquationNowcast[] };

type ErrorLog = Map<string, Array<{ quarter: string; releaseAt: string; err: number }>>;

/**
 * 组合预测。权重 ∝ 1 / 过去 weightWindow 个季度该方程的样本外 MSE（同一 as-of 口径，只用目标季度
 * 之前、已公布的季度）；任一方程样本外记录不足时整体等权。
 */
export function nowcastRow(rows: readonly DatasetRow[], target: DatasetRow, cfg: ModelConfig, pastErrors?: ErrorLog): Nowcast | null {
  const parts: EquationNowcast[] = [];
  for (const eq of cfg.equations) {
    if (!eq.inputs.every((k) => target.x[k])) continue;
    const fit = fitEquation(rows, target, cfg, eq);
    if (!fit) continue;
    const forecast = fit.intercept + eq.inputs.reduce((s, k) => s + fit.coef[k]! * target.x[k]!.value, 0);
    parts.push({ key: eq.key, fit, forecast, weight: 1 });
  }
  if (!parts.length) return null;
  if (cfg.weightWindow > 0 && pastErrors) {
    const inv = parts.map((p) => {
      const errs = (pastErrors.get(p.key) ?? [])
        .filter((e) => e.quarter < target.quarter && e.releaseAt <= target.asOf && !isCovidQuarter(e.quarter))
        .slice(-cfg.weightWindow);
      if (errs.length < Math.min(8, cfg.weightWindow)) return NaN;
      return errs.length / errs.reduce((s, e) => s + e.err * e.err, 0);
    });
    if (inv.every(Number.isFinite)) parts.forEach((p, i) => (p.weight = inv[i]!));
  }
  const wSum = parts.reduce((s, p) => s + p.weight, 0);
  parts.forEach((p) => (p.weight /= wSum));
  return { forecast: parts.reduce((s, p) => s + p.weight * p.forecast, 0), parts };
}

function logErrors(errs: ErrorLog, r: DatasetRow, nc: Nowcast) {
  for (const p of nc.parts) {
    const list = errs.get(p.key) ?? [];
    list.push({ quarter: r.quarter, releaseAt: r.releaseAt, err: p.forecast - r.y });
    errs.set(p.key, list);
  }
}

export type BacktestPoint = DatasetRow & { forecast: number; parts: EquationNowcast[] };

/** 滚动样本外：按季度顺序，每季只用之前已公布季度估计；同时累积各方程的样本外误差供组合权重 */
export function runBacktest(rows: readonly DatasetRow[], cfg: ModelConfig, from: string): BacktestPoint[] {
  const errs: ErrorLog = new Map();
  const out: BacktestPoint[] = [];
  for (const r of rows) {
    const nc = nowcastRow(rows, r, cfg, errs);
    if (!nc) continue;
    logErrors(errs, r, nc);
    if (r.quarter >= from) out.push({ ...r, forecast: nc.forecast, parts: nc.parts });
  }
  return out;
}

/** 当前（未公布）季度的 nowcast：先在历史行上累积样本外误差，再预测目标行 */
export function nowcastLive(rows: readonly DatasetRow[], target: DatasetRow, cfg: ModelConfig): Nowcast | null {
  const errs: ErrorLog = new Map();
  for (const r of rows) {
    if (r.quarter >= target.quarter) break;
    const nc = nowcastRow(rows, r, cfg, errs);
    if (nc) logErrors(errs, r, nc);
  }
  return nowcastRow(rows, target, cfg, errs);
}

// ─────────────────────────────────────────────────────────────── 评估 ──

export type ErrorStats = { n: number; mae: number; rmse: number; bias: number };

export function errorStats(pred: readonly number[], actual: readonly number[]): ErrorStats {
  const e = pred.map((p, i) => p - actual[i]!).filter(Number.isFinite);
  const n = e.length;
  if (!n) return { n: 0, mae: NaN, rmse: NaN, bias: NaN };
  return {
    n,
    mae: e.reduce((s, v) => s + Math.abs(v), 0) / n,
    rmse: Math.sqrt(e.reduce((s, v) => s + v * v, 0) / n),
    bias: e.reduce((s, v) => s + v, 0) / n,
  };
}

/** 80% 区间：回测误差（剔除疫情段）的 10%–90% 分位，返回相对点预测的偏移 */
export function errorBand(points: readonly { quarter: string; forecast: number; y: number }[]): { lower: number; upper: number } {
  const errs = points.filter((p) => !isCovidQuarter(p.quarter)).map((p) => p.forecast - p.y);
  return { lower: -quantile(errs, 0.9), upper: -quantile(errs, 0.1) };
}
