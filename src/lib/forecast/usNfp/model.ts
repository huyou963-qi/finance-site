/**
 * 美国非农新增就业 nowcast —— 纯函数模型（无 DB、无 React）。
 *
 * 目标：非农新增就业「首发值」（千人）= 目标月首次公布时，该月与上月就业水平之差（同一版本）。
 * 回归特征（验证期 2006–2015 从 48 组「趋势 × 申领子集 × 地区联储」候选中选出，测试期 2016+
 * 未参与选择）：
 *   nfp12  —— 截至 as-of 日能看到的最近 12 个月非农变化均值（实时版本，含前期修订）
 *   icLvl  —— 参考周初请 4 周均值相对过去一年均值（劳动力市场松紧的水平信号）
 * 另算两项仅作展示的背景信号（验证期加入后误差变大，不进回归）：
 *   icChg  —— 参考周初请相对上月参考周的变化；ccChg —— 续请同口径变化
 * 估计：滚动 96 个月 OLS，剔除 2020-03~2021-06；每个月只用当时可得数据（真实时点）。
 * 研究与验证：docs/research/US_NFP_NOWCAST.md。
 */
import { quantile, solveOls } from "../usCpi/model";

export type Revision = { at: string; value: number };
/** 月份（YYYY-MM-01）→ 按生效日期升序的历次版本 */
export type RevisionLedger = Map<string, Revision[]>;
export type WeeklyObs = Array<{ date: string; value: number }>;

export type NfpModelInputs = {
  payems: RevisionLedger;
  icsa: WeeklyObs;
  ccsa: WeeklyObs;
};

/** 计算的全部信号 */
export const SIGNALS = ["nfp12", "icChg", "ccChg", "icLvl"] as const;
export type SignalKey = (typeof SIGNALS)[number];
export type SignalRow = Record<SignalKey, number>;
/** 进回归的特征 */
export const FEATURES = ["nfp12", "icLvl"] as const;
export type FeatureKey = (typeof FEATURES)[number];
export type FeatureRow = Record<FeatureKey, number>;

const WINDOW = 96;
const MIN_TRAIN = 36;
const COVID_FROM = "2020-03-01";
const COVID_TO = "2021-06-01";
export const DATASET_FROM = "2004-01-01";

// ─────────────────────────────────────────────────────────────── 日期工具 ──

const DAY_MS = 86_400_000;
export const toDay = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const fromDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => fromDay(toDay(iso) + n * DAY_MS);
export function addMonths(iso: string, k: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return fromDay(Date.UTC(y, m - 1 + k, d));
}
export const minIso = (a: string, b: string) => (a < b ? a : b);
export const isCovid = (month: string) => month >= COVID_FROM && month <= COVID_TO;

/** 参考周（含 12 日）所在周的周六——初请周度数据以周六为周末日期 */
export function refWeekEnd(month: string): string {
  const d12 = addDays(month, 11);
  const dow = new Date(toDay(d12)).getUTCDay(); // 周日=0 … 周六=6
  return addDays(d12, (6 - dow + 7) % 7);
}

// ─────────────────────────────────────────────────────────────── 版本查询 ──

/** as-of 日（含）能看到的某月非农水平；无则 NaN */
export function valueAsOf(ledger: RevisionLedger, month: string, asOf: string): number {
  const revs = ledger.get(month);
  if (!revs) return NaN;
  let v = NaN;
  for (const r of revs) {
    if (r.at <= asOf) v = r.value;
    else break;
  }
  return v;
}

/** 目标月首次公布日（最早版本日）与首发变化（同一版本的水平差） */
export function firstRelease(ledger: RevisionLedger, month: string): { at: string; change: number } | null {
  const revs = ledger.get(month);
  if (!revs?.length) return null;
  const at = revs[0]!.at;
  const change = valueAsOf(ledger, month, at) - valueAsOf(ledger, addMonths(month, -1), at);
  return Number.isFinite(change) ? { at, change } : null;
}

/** as-of 日能看到的、目标月之前各月的变化（按月份升序） */
export function pastChangesAsOf(ledger: RevisionLedger, target: string, asOf: string, n: number): number[] {
  const out: number[] = [];
  let m = addMonths(target, -1);
  let prev = valueAsOf(ledger, m, asOf);
  // 最新可见月可能早于 target−1（如刚过月初、上月非农未公布），向前找到第一个有值的月份
  let guard = 0;
  while (!Number.isFinite(prev) && guard++ < 3) {
    m = addMonths(m, -1);
    prev = valueAsOf(ledger, m, asOf);
  }
  for (let i = 0; i < n + 12 && out.length < n; i++) {
    const pm = addMonths(m, -1);
    const pv = valueAsOf(ledger, pm, asOf);
    if (!Number.isFinite(prev) || !Number.isFinite(pv)) break;
    out.unshift(prev - pv);
    m = pm;
    prev = pv;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────── 特征 ──

function avgWindow(obs: WeeklyObs, end: string, days: number, minCount: number): number {
  const lo = addDays(end, -days);
  let s = 0;
  let n = 0;
  for (const o of obs) {
    if (o.date > lo && o.date <= end) {
      s += o.value;
      n += 1;
    }
  }
  return n >= minCount ? s / n : NaN;
}

function visible(obs: WeeklyObs, until: string): WeeklyObs {
  return obs.filter((o) => o.date <= until);
}

/** 目标月 target、as-of 日 asOf 的特征；历史不足返回 null */
export function featuresAsOf(inputs: NfpModelInputs, target: string, asOf: string): SignalRow | null {
  const past = pastChangesAsOf(inputs.payems, target, asOf, 12);
  if (past.length < 12) return null;
  // 初请周四公布上周六结束的一周；续请再晚一周
  const ic = visible(inputs.icsa, addDays(asOf, -5));
  const cc = visible(inputs.ccsa, addDays(asOf, -12));
  if (!ic.length || !cc.length) return null;
  const rw = refWeekEnd(target);
  const rwPrev = refWeekEnd(addMonths(target, -1));
  const icEnd = minIso(rw, ic[ic.length - 1]!.date);
  const ccEnd = minIso(rw, cc[cc.length - 1]!.date);
  const icNow = avgWindow(ic, icEnd, 28, 3);
  return {
    nfp12: past.reduce((a, b) => a + b, 0) / past.length,
    icChg: Math.log(icNow / avgWindow(ic, rwPrev, 28, 3)) * 100,
    ccChg: Math.log(avgWindow(cc, ccEnd, 28, 3) / avgWindow(cc, addDays(rwPrev, -7), 28, 3)) * 100,
    icLvl: Math.log(icNow / avgWindow(ic, icEnd, 365, 20)) * 100,
  };
}

// ─────────────────────────────────────────────────────────────── 数据集 ──

/** as-of 规则：给定目标月与其首发日，返回该时点（首发前一天封顶） */
export type AsOfRule = (target: string, releaseAt: string) => string;
export const asOfOffset = (days: number): AsOfRule => (t, rel) => minIso(addDays(t, days), addDays(rel, -1));
export const asOfMonthEnd: AsOfRule = (t, rel) => minIso(addMonths(t, 1), addDays(rel, -1));
export const asOfPreRelease: AsOfRule = (_t, rel) => addDays(rel, -1);

export type DatasetRow = {
  month: string;
  releaseAt: string;
  asOf: string;
  x: SignalRow;
  y: number;
  /** 同一时点的简单基准 */
  nfp6: number;
  nfp1: number;
};

export function monthsWithRelease(ledger: RevisionLedger, from = DATASET_FROM): string[] {
  return [...ledger.keys()].filter((m) => m >= from).sort();
}

export function buildDataset(inputs: NfpModelInputs, rule: AsOfRule, months?: string[]): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (const month of months ?? monthsWithRelease(inputs.payems)) {
    const fr = firstRelease(inputs.payems, month);
    if (!fr) continue;
    const asOf = rule(month, fr.at);
    const x = featuresAsOf(inputs, month, asOf);
    if (!x || !SIGNALS.every((k) => Number.isFinite(x[k]))) continue;
    const past6 = pastChangesAsOf(inputs.payems, month, asOf, 6);
    rows.push({
      month,
      releaseAt: fr.at,
      asOf,
      x,
      y: fr.change,
      nfp6: past6.reduce((a, b) => a + b, 0) / past6.length,
      nfp1: past6[past6.length - 1] ?? NaN,
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────── 估计 ──

export type Fit = {
  intercept: number;
  coef: FeatureRow;
  /** 训练样本均值（贡献分解的基线） */
  means: FeatureRow;
  yMean: number;
  n: number;
};

/** 用 before 之前（不含）的样本滚动估计；训练集剔除疫情段 */
export function fitBefore(rows: readonly DatasetRow[], before: string): Fit | null {
  const train = rows.filter((r) => r.month < before && !isCovid(r.month)).slice(-WINDOW);
  if (train.length < MIN_TRAIN) return null;
  const X = train.map((r) => [1, ...FEATURES.map((k) => r.x[k])]);
  const beta = solveOls(X, train.map((r) => r.y));
  if (!beta) return null;
  const means = {} as FeatureRow;
  FEATURES.forEach((k) => {
    means[k] = train.reduce((s, r) => s + r.x[k], 0) / train.length;
  });
  const coef = {} as FeatureRow;
  FEATURES.forEach((k, i) => {
    coef[k] = beta[i + 1]!;
  });
  return { intercept: beta[0]!, coef, means, yMean: train.reduce((s, r) => s + r.y, 0) / train.length, n: train.length };
}

export function predict(fit: Fit, x: FeatureRow | SignalRow): number {
  return fit.intercept + FEATURES.reduce((s, k) => s + fit.coef[k] * x[k], 0);
}

/** 贡献分解：预测 = 训练均值 + Σ 系数 ×（特征 − 训练均值） */
export function contributions(fit: Fit, x: FeatureRow | SignalRow): { baseline: number; parts: FeatureRow } {
  const parts = {} as FeatureRow;
  FEATURES.forEach((k) => {
    parts[k] = fit.coef[k] * (x[k] - fit.means[k]);
  });
  return { baseline: fit.yMean, parts };
}

export type BacktestPoint = DatasetRow & { forecast: number };

/** 滚动样本外：每个月只用之前月份估计 */
export function runBacktest(rows: readonly DatasetRow[], from: string): BacktestPoint[] {
  const out: BacktestPoint[] = [];
  for (const r of rows) {
    if (r.month < from) continue;
    const fit = fitBefore(rows, r.month);
    if (!fit) continue;
    out.push({ ...r, forecast: predict(fit, r.x) });
  }
  return out;
}

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

/** 80% 区间：回测误差（剔除疫情）的 10%–90% 分位，返回相对点预测的偏移 */
export function errorBand(points: readonly BacktestPoint[]): { lower: number; upper: number } {
  const errs = points.filter((p) => !isCovid(p.month)).map((p) => p.forecast - p.y);
  return { lower: -quantile(errs, 0.9), upper: -quantile(errs, 0.1) };
}
