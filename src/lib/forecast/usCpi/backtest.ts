/**
 * 滚动样本外回测与精度汇总（纯函数）。每个月 t 只用 t 之前可得数据重新估计全部分项模型，
 * 与实际公布值比较；基准为「上月值」与「过去 12 个月均值」。
 */
import {
  ALL_LEAVES,
  nowcastMonth,
  quantile,
  type AggregateKey,
  type LeafKey,
  type PreparedModel,
} from "./model";

export type BacktestRow = {
  month: string;
  covid: boolean;
  forecast: Record<LeafKey | AggregateKey, number>;
  actual: Record<LeafKey | AggregateKey, number>;
  /** 基准：上月值、过去 12 个月均值（总体与核心） */
  lastMonth: Record<"ALL" | "CORE", number>;
  mean12: Record<"ALL" | "CORE", number>;
};

export type AccuracyStats = {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  /** |误差| ≤ 0.1 个百分点的比例 */
  within01: number;
  /** 预测与实际四舍五入到 0.1 后相等的比例（公布口径） */
  roundHit: number;
};

const AGG_KEYS: AggregateKey[] = ["FOOD", "ENE", "CG", "CS", "CORE", "ALL"];

function isCovid(month: string): boolean {
  return month >= "2020-03-01" && month <= "2020-06-01";
}

export function runBacktest(model: PreparedModel, fromMonth: string, toIndex: number): BacktestRow[] {
  const rows: BacktestRow[] = [];
  const start = model.monthIndex.get(fromMonth) ?? 0;
  const mom = model.mom;
  for (let t = start; t <= toIndex; t++) {
    if (model.gapMonths.has(t) || !Number.isFinite(mom.ALL![t]!)) continue;
    const forecast = nowcastMonth(model, t);
    const actual = {} as Record<LeafKey | AggregateKey, number>;
    for (const k of [...ALL_LEAVES, ...AGG_KEYS]) actual[k] = mom[k]![t]!;
    const mean = (k: string) => {
      const xs = mom[k]!.slice(t - 12, t);
      return xs.length === 12 && xs.every(Number.isFinite) ? xs.reduce((a, b) => a + b, 0) / 12 : NaN;
    };
    rows.push({
      month: model.months[t]!,
      covid: isCovid(model.months[t]!),
      forecast,
      actual,
      lastMonth: { ALL: mom.ALL![t - 1]!, CORE: mom.CORE![t - 1]! },
      mean12: { ALL: mean("ALL"), CORE: mean("CORE") },
    });
  }
  return rows;
}

export function accuracy(pred: readonly number[], actual: readonly number[]): AccuracyStats {
  const pairs = pred
    .map((p, i) => [p, actual[i]!] as const)
    .filter(([p, a]) => Number.isFinite(p) && Number.isFinite(a));
  const n = pairs.length;
  if (n === 0) return { n: 0, mae: NaN, rmse: NaN, bias: NaN, within01: NaN, roundHit: NaN };
  const errs = pairs.map(([p, a]) => p - a);
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    n,
    mae: errs.reduce((s, e) => s + Math.abs(e), 0) / n,
    rmse: Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / n),
    bias: errs.reduce((s, e) => s + e, 0) / n,
    within01: errs.filter((e) => Math.abs(e) <= 0.1 + 1e-9).length / n,
    roundHit: pairs.filter(([p, a]) => round1(p) === round1(a)).length / n,
  };
}

export function correlation(x: readonly number[], y: readonly number[]): number {
  const pairs = x.map((v, i) => [v, y[i]!] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = pairs.length;
  if (n < 3) return NaN;
  const mx = pairs.reduce((s, [a]) => s + a, 0) / n;
  const my = pairs.reduce((s, [, b]) => s + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [a, b] of pairs) {
    sxy += (a - mx) * (b - my);
    sxx += (a - mx) ** 2;
    syy += (b - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** 预测区间：回测误差（剔除疫情月）的经验分位；返回 [下限, 上限] 相对点预测的偏移 */
export function errorBand(rows: readonly BacktestRow[], key: "ALL" | "CORE", lo = 0.1, hi = 0.9) {
  const errs = rows.filter((r) => !r.covid).map((r) => r.forecast[key] - r.actual[key]);
  // 误差 = 预测 − 实际，故实际 = 预测 − 误差：下限用误差上分位
  return { lower: -quantile(errs, hi), upper: -quantile(errs, lo) };
}
