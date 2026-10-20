import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_LEAVES,
  HF_KEYS,
  LEVEL_KEYS,
  aggregate,
  fillInteriorGaps,
  nowcastMonth,
  prepareModel,
  quantile,
  rollMean,
  solveOls,
  shelterForecast,
  type LeafKey,
  type ModelInputs,
} from "./model";
import { accuracy, runBacktest } from "./backtest";
import { monthRange, monthlyAsOfAverage, observedCutoffDay } from "./inputs";

test("rollMean matches pandas shift(lag).rolling(n, min_periods).mean()", () => {
  const a = [1, 2, NaN, 4, 5, 6];
  assert.deepEqual(rollMean(a, 3, 1, 2).map((v) => (Number.isNaN(v) ? null : v)), [null, null, 1.5, 1.5, 3, 4.5]);
});

test("fillInteriorGaps interpolates 1–2 month interior gaps geometrically, never trailing ones", () => {
  const lv = [100, NaN, 121, NaN];
  assert.deepEqual(fillInteriorGaps(lv), [1]);
  assert.ok(Math.abs(lv[1]! - 110) < 1e-9);
  assert.ok(Number.isNaN(lv[3]!));
});

test("solveOls recovers exact coefficients", () => {
  const X = [[1, 0], [1, 1], [1, 2], [1, 3]];
  const beta = solveOls(X, [1, 3, 5, 7])!;
  assert.ok(Math.abs(beta[0]! - 1) < 1e-9 && Math.abs(beta[1]! - 2) < 1e-9);
});

test("quantile uses linear interpolation (numpy default)", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.ok(Math.abs(quantile([0, 10], 0.9) - 9) < 1e-12);
});

test("monthlyAsOfAverage only uses observations dated on or before the cutoff day", () => {
  const obs = new Map<string, number | null>([
    ["2026-09-07", 4],
    ["2026-09-21", 5],
    ["2026-09-28", 100],
  ]);
  assert.deepEqual(monthlyAsOfAverage(obs, ["2026-09-01"], 22), [4.5]);
});

test("a month with no observation before the cutoff carries the last recent price forward (flat)", () => {
  const obs = new Map<string, number | null>([
    ["2026-08-31", 4.2],
    ["2026-09-07", 4.4],
  ]);
  assert.deepEqual(monthlyAsOfAverage(obs, ["2026-09-01"], 3), [4.2]);
  // 距月初超过 10 天的旧价格不沿用
  const stale = new Map<string, number | null>([["2026-08-10", 4.2]]);
  assert.ok(Number.isNaN(monthlyAsOfAverage(stale, ["2026-09-01"], 3)[0]!));
});

test("observed cutoff follows the latest gasoline print and becomes full month once the month ends", () => {
  const gas = new Map<string, number | null>([
    ["2026-09-14", 4.3],
    ["2026-09-21", 4.5],
  ]);
  assert.deepEqual(observedCutoffDay("2026-09-01", gas, new Date("2026-09-24T00:00:00Z")), {
    cutoffDay: 21,
    observedThrough: "2026-09-21",
  });
  assert.equal(observedCutoffDay("2026-09-01", gas, new Date("2026-10-05T00:00:00Z")).cutoffDay, 31);
  assert.equal(observedCutoffDay("2026-10-01", gas, new Date("2026-10-02T00:00:00Z")).cutoffDay, 0);
});

/** 合成数据：各分项按固定趋势 + 噪声增长，高频代理与目标同步 */
function syntheticInputs(): ModelInputs {
  const months = monthRange("2008-01-01", "2026-09-01");
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.2;
  const series = () => {
    let v = 100;
    return months.map((_, i) => (i === months.length - 1 ? NaN : (v *= 1 + (0.2 + rnd()) / 100)));
  };
  const levels = Object.fromEntries(LEVEL_KEYS.map((k) => [k, series()])) as ModelInputs["levels"];
  // 高频代理用随机游走（等差序列的对数环比近乎常数，会与截距共线）
  const hf = Object.fromEntries(HF_KEYS.map((k) => [k, series().map((v, i) => (Number.isNaN(v) ? 100 + i : v))])) as ModelInputs["hf"];
  return { months, levels, hf };
}

test("aggregate reproduces a leaf-weighted average and nowcast is finite for the target month", () => {
  const model = prepareModel(syntheticInputs());
  const T = model.months.length - 1;
  const ones = Object.fromEntries(ALL_LEAVES.map((k) => [k, 0.3])) as Record<LeafKey, number>;
  const agg = aggregate(model, ones, T);
  // 所有叶子相同 → 按叶子权重归一的各级聚合必须等于该值；核心按 BLS 核心权重归一
  for (const k of ["FOOD", "ENE", "CG", "CS"] as const) assert.ok(Math.abs(agg[k] - 0.3) < 1e-9, k);
  const w = (k: string) => model.weights[k]![T]!;
  assert.ok(Math.abs(agg.CORE - (0.3 * (w("CG") + w("CS"))) / w("CORE")) < 1e-9);
  const fallbacks: LeafKey[] = [];
  const now = nowcastMonth(model, T, fallbacks);
  assert.ok(Number.isFinite(now.ALL) && Number.isFinite(now.CORE));
  assert.deepEqual(fallbacks, []);
});

test("a leaf whose proxy is unusable falls back to its 12-month mean instead of blanking the total", () => {
  const inputs = syntheticInputs();
  inputs.hf.MANHEIM = inputs.hf.MANHEIM.map(() => NaN);
  const model = prepareModel(inputs);
  const fallbacks: LeafKey[] = [];
  const now = nowcastMonth(model, model.months.length - 1, fallbacks);
  assert.deepEqual(fallbacks, ["USED"]);
  assert.ok(Number.isFinite(now.ALL));
});

test("backtest skips the target month and reports finite accuracy", () => {
  const model = prepareModel(syntheticInputs());
  const rows = runBacktest(model, "2018-01-01", model.months.length - 2);
  assert.ok(rows.length > 90);
  const s = accuracy(rows.map((r) => r.forecast.ALL), rows.map((r) => r.actual.ALL));
  assert.ok(Number.isFinite(s.mae) && s.mae < 0.5);
});

test("shelter keeps long transmission and gates recent ZORI by publication lag", () => {
  for (const allowed of [false, true]) {
    const inputs = syntheticInputs();
    inputs.allowRecentShelter = allowed;
    const model = prepareModel(inputs);
    const t = inputs.months.length - 1;
    const z = model.specs.RENT!.recentX!.zRecent!;
    const manual = [0, 1, 2].map((j) => {
      const i = t - 1 - j;
      return 100 * Math.log(inputs.hf.ZORI[i]! / inputs.hf.ZORI[i - 1]!);
    }).reduce((a, b) => a + b, 0) / 3;
    assert.ok(Math.abs(z[t]! - manual) < 1e-12);
    const d = shelterForecast(model, "RENT", t).decision;
    assert.equal(d.publicationGateOpen, allowed);
    if (!allowed) assert.notEqual(d.mode, "recent-and-lagged");
  }
});

test("recent shelter signal must win earlier walk-forward validation, independently per component", () => {
  const inputs = syntheticInputs();
  inputs.allowRecentShelter = true;
  const model = prepareModel(inputs);
  const spec = model.specs.RENT!;
  spec.y = spec.recentX!.zRecent!.map((z) => 0.1 + 4 * z);
  const t = model.months.length - 1;
  const result = shelterForecast(model, "RENT", t);
  assert.equal(result.decision.mode, "recent-and-lagged");
  assert.ok(result.decision.validationPairs >= 18);
  assert.ok(Math.abs(result.forecast - spec.y[t]!) < 1e-6);
  // 另一分项仍有自己的目标与验证误差，不共享 RENT 的选择结果。
  assert.notDeepEqual(shelterForecast(model, "OER", t).decision, result.decision);
});

test("shelter selection and prediction do not use target or future outcomes and ZORI", () => {
  const inputs = syntheticInputs();
  inputs.allowRecentShelter = true;
  const t = inputs.months.length - 15;
  const before = shelterForecast(prepareModel(inputs), "RENT", t);
  for (const k of LEVEL_KEYS) for (let i = t; i < inputs.months.length; i++) inputs.levels[k][i] = 99999 + i;
  for (let i = t; i < inputs.months.length; i++) inputs.hf.ZORI[i] = 99999 + i;
  const after = shelterForecast(prepareModel(inputs), "RENT", t);
  assert.deepEqual(after, before);
});

test("missing recent ZORI retains lagged model, wholly missing ZORI uses disclosed autoregression", () => {
  const inputs = syntheticInputs();
  inputs.hf.ZORI[inputs.months.length - 2] = NaN;
  inputs.allowRecentShelter = true;
  const t = inputs.months.length - 1;
  assert.equal(shelterForecast(prepareModel(inputs), "RENT", t).decision.mode, "lagged");
  inputs.hf.ZORI.fill(NaN);
  const result = shelterForecast(prepareModel(inputs), "RENT", t);
  assert.equal(result.decision.mode, "autoregressive");
  assert.ok(Number.isFinite(result.forecast));
});
