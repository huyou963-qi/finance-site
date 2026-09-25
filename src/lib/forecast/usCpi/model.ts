/**
 * 美国 CPI 分项高频代理 nowcast —— 纯函数模型（无 DB、无 React）。
 *
 * 18 个叶子分项各用最直接的高频代理做滚动 OLS，按 BLS 相对权重（12 月值 × 当年相对价格
 * 漂移）加总为食品 / 能源 / 核心商品 / 核心服务 / 核心 / 总体。三个残差分项（其他核心商品、
 * 其他交通服务、其他核心服务）由上级指数减去已建模分项倒推，保证加总与官方口径一致。
 *
 * 信息集约定（与回测一致，杜绝前视）：CPI、PPI、Manheim、ZORI 截至 t−1 月；日/周频价格
 * （零售汽油、航油、天然气、取暖油）取 t 月「已观测天数」内的均值（回测按同一截止日）。每个 t 只用 t 之前的样本重新估计。
 *
 * 研究与验证过程见 docs/research/US_CPI_NOWCAST.md。
 */
import {
  CPI_RELATIVE_IMPORTANCE,
  relativeImportanceYearFor,
  type RelativeImportanceKey,
} from "./relativeImportance";

// ─────────────────────────────────────────────────────────────── 输入口径 ──

/** 月频水平序列（SA 除注明外） */
export const LEVEL_KEYS = [
  "ALL", "ALLNSA", "CORE", "CORENSA", "FOOD", "ENE", "FAH", "FAFH", "GAS", "GASNSA", "FUEL",
  "ELEC", "UGAS", "CG", "NEWV", "USED", "APP", "MEDC", "CS", "SHEL", "RENT", "OER", "LODG",
  "MEDS", "TRS", "AIR", "PPIFOOD",
] as const;
export type LevelKey = (typeof LEVEL_KEYS)[number];

/** 高频代理（已折成月值：日/周频为当月截止日内均值；Manheim、ZORI 为月值） */
export const HF_KEYS = ["GASRETAIL", "HEATOIL", "JET", "HH", "MANHEIM", "ZORI"] as const;
export type HfKey = (typeof HF_KEYS)[number];

export type ModelInputs = {
  /** 连续月份 YYYY-MM-01，升序；最后一个是 nowcast 目标月 */
  months: string[];
  levels: Record<LevelKey, number[]>;
  hf: Record<HfKey, number[]>;
};

export const LEAVES_FOOD = ["FAH", "FAFH"] as const;
export const LEAVES_ENE = ["GAS", "FUEL", "ELEC", "UGAS"] as const;
export const LEAVES_CG = ["NEWV", "USED", "APP", "MEDC", "OCG"] as const;
export const LEAVES_CS = ["RENT", "OER", "LODG", "MEDS", "AIR", "OTRS", "OCS"] as const;
export const ALL_LEAVES = [...LEAVES_FOOD, ...LEAVES_ENE, ...LEAVES_CG, ...LEAVES_CS] as const;
export type LeafKey = (typeof ALL_LEAVES)[number];
export type AggregateKey = "FOOD" | "ENE" | "CG" | "CS" | "CORE" | "ALL";

const WINDOW = 120;
const MIN_TRAIN = 24;
const ZORI_MODEL_START = "2017-01-01";
/** 训练剔除：疫情冲击月（另加自动识别的停发月，见 prepareModel） */
const COVID_MONTHS = ["2020-03-01", "2020-04-01", "2020-05-01", "2020-06-01"];

// ─────────────────────────────────────────────────────────────── 序列工具 ──

const isNum = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);

export function shift(a: readonly number[], k: number): number[] {
  return a.map((_, i) => (i - k >= 0 && i - k < a.length ? a[i - k]! : NaN));
}

export function pctChange(level: readonly number[]): number[] {
  return level.map((v, i) => (i > 0 && isNum(v) && isNum(level[i - 1]) ? 100 * (v / level[i - 1]! - 1) : NaN));
}

export function logChange(level: readonly number[]): number[] {
  return level.map((v, i) =>
    i > 0 && isNum(v) && isNum(level[i - 1]) && v > 0 && level[i - 1]! > 0 ? 100 * Math.log(v / level[i - 1]!) : NaN,
  );
}

/** pandas `s.shift(lag).rolling(n, min_periods).mean()` */
export function rollMean(a: readonly number[], n: number, lag = 1, minPeriods = Math.max(3, Math.floor(n / 2))): number[] {
  return a.map((_, i) => {
    let sum = 0;
    let cnt = 0;
    for (let j = i - lag - n + 1; j <= i - lag; j++) {
      if (j >= 0 && isNum(a[j])) {
        sum += a[j]!;
        cnt += 1;
      }
    }
    return cnt >= minPeriods ? sum / cnt : NaN;
  });
}

/** 中间 1–2 个月的缺口按对数线性插值（BLS 停发月），返回被补的下标 */
export function fillInteriorGaps(level: number[], maxGap = 2): number[] {
  const filled: number[] = [];
  let i = 1;
  while (i < level.length) {
    if (!isNum(level[i]) && isNum(level[i - 1])) {
      let j = i;
      while (j < level.length && !isNum(level[j])) j++;
      const gap = j - i;
      if (j < level.length && gap <= maxGap && level[i - 1]! > 0 && level[j]! > 0) {
        const a = Math.log(level[i - 1]!);
        const b = Math.log(level[j]!);
        for (let k = i; k < j; k++) {
          level[k] = Math.exp(a + ((b - a) * (k - i + 1)) / (gap + 1));
          filled.push(k);
        }
      }
      i = j;
    } else {
      i++;
    }
  }
  return filled;
}

export function quantile(values: readonly number[], q: number): number {
  const s = [...values].filter(isNum).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** 小规模最小二乘：正规方程 + 部分主元高斯消元 */
export function solveOls(X: readonly number[][], y: readonly number[]): number[] | null {
  const p = X[0]!.length;
  const A = Array.from({ length: p }, () => new Array<number>(p + 1).fill(0));
  for (let r = 0; r < X.length; r++) {
    const row = X[r]!;
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) A[i]![j]! += row[i]! * row[j]!;
      A[i]![p]! += row[i]! * y[r]!;
    }
  }
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    if (Math.abs(A[piv]![c]!) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k <= p; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  return A.map((row, i) => row[p]! / row[i]!);
}

// ─────────────────────────────────────────────────────────────── 模型准备 ──

type Features = Record<string, number[]>;
type LeafSpec = { y: number[]; X: Features; start?: string; fallbackX?: Features };

export type PreparedModel = {
  months: string[];
  monthIndex: Map<string, number>;
  /** 各水平序列的环比（%），停发月已插值 */
  mom: Record<string, number[]>;
  levels: Record<LevelKey, number[]>;
  weights: Record<string, number[]>;
  /** 训练与评估都剔除的月份下标（疫情 + 停发月及其后一月） */
  excluded: Set<number>;
  /** 停发月及其后一月（环比是插值出来的） */
  gapMonths: Set<number>;
  specs: Record<string, LeafSpec>;
};

const WEIGHT_KEYS: RelativeImportanceKey[] = [
  "FAH", "FAFH", "GAS", "FUEL", "ELEC", "UGAS", "CORE", "CG", "NEWV", "USED", "APP", "MEDC",
  "CS", "SHEL", "RENT", "LODG", "OER", "MEDS", "TRS", "AIR", "ENE", "FOOD",
];

export function prepareModel(inputs: ModelInputs): PreparedModel {
  const { months } = inputs;
  const n = months.length;
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  // 停发月：总体 CPI 在两个有值月份之间缺失 → 全部序列插值，并剔除该月与其后一月
  const levels = Object.fromEntries(
    LEVEL_KEYS.map((k) => [k, [...inputs.levels[k]]]),
  ) as Record<LevelKey, number[]>;
  const allGaps = fillInteriorGaps(levels.ALL);
  for (const k of LEVEL_KEYS) if (k !== "ALL") fillInteriorGaps(levels[k]);
  const gapMonths = new Set<number>();
  for (const g of allGaps) {
    gapMonths.add(g);
    if (g + 1 < n) gapMonths.add(g + 1);
  }
  const excluded = new Set<number>(gapMonths);
  for (const m of COVID_MONTHS) {
    const i = monthIndex.get(m);
    if (i !== undefined) excluded.add(i);
  }

  const mom: Record<string, number[]> = {};
  for (const k of LEVEL_KEYS) mom[k] = pctChange(levels[k]);

  // 权重：BLS 12 月相对权重 × 自 12 月以来的相对价格漂移
  const weights: Record<string, number[]> = {};
  for (const k of WEIGHT_KEYS) weights[k] = new Array<number>(n).fill(NaN);
  for (let t = 1; t < n; t++) {
    const year = Number(months[t]!.slice(0, 4));
    const ry = relativeImportanceYearFor(year);
    const dec = monthIndex.get(`${ry}-12-01`);
    const prev = t - 1;
    for (const k of WEIGHT_KEYS) {
      let r = CPI_RELATIVE_IMPORTANCE[ry]![k];
      const lk = levels[k as LevelKey];
      if (
        dec !== undefined && lk &&
        isNum(lk[prev]) && isNum(lk[dec]) && isNum(levels.ALL[prev]) && isNum(levels.ALL[dec])
      ) {
        r = (r * (lk[prev]! / lk[dec]!)) / (levels.ALL[prev]! / levels.ALL[dec]!);
      }
      weights[k]![t] = r;
    }
  }
  // 能源商品里的「其他机动车燃料」并入汽油，使 能源 = 四个能源叶子之和
  weights.GAS = weights.ENE!.map((e, t) => e - weights.FUEL![t]! - weights.ELEC![t]! - weights.UGAS![t]!);
  weights.OCG = weights.CG!.map((v, t) => v - weights.NEWV![t]! - weights.USED![t]! - weights.APP![t]! - weights.MEDC![t]!);
  weights.OTRS = weights.TRS!.map((v, t) => v - weights.AIR![t]!);
  weights.OCS = weights.CS!.map(
    (v, t) => v - weights.RENT![t]! - weights.OER![t]! - weights.LODG![t]! - weights.MEDS![t]! - weights.TRS![t]!,
  );

  // 残差分项：上级指数减已建模分项
  const w = weights;
  const mm = mom;
  mom.OCG = months.map((_, t) =>
    (w.CG![t]! * mm.CG![t]! - w.NEWV![t]! * mm.NEWV![t]! - w.USED![t]! * mm.USED![t]! -
      w.APP![t]! * mm.APP![t]! - w.MEDC![t]! * mm.MEDC![t]!) / w.OCG![t]!,
  );
  mom.OTRS = months.map((_, t) => (w.TRS![t]! * mm.TRS![t]! - w.AIR![t]! * mm.AIR![t]!) / w.OTRS![t]!);
  mom.OCS = months.map((_, t) =>
    (w.CS![t]! * mm.CS![t]! - w.RENT![t]! * mm.RENT![t]! - w.OER![t]! * mm.OER![t]! -
      w.LODG![t]! * mm.LODG![t]! - w.MEDS![t]! * mm.MEDS![t]! - w.TRS![t]! * mm.TRS![t]!) / w.OCS![t]!,
  );

  // ── 各分项特征 ──
  const hf = inputs.hf;
  const g = logChange(hf.GASRETAIL);
  const ho = logChange(hf.HEATOIL);
  const hh = logChange(hf.HH);
  const jet = logChange(hf.JET);
  const mh = logChange(hf.MANHEIM);
  const zoriMom = logChange(hf.ZORI);
  // 最新可得 12 个月 ZORI 平均环比，再滞后 6 月（ZORI 领先 CPI 租金约 9–12 月）
  const zLead = shift(rollMean(zoriMom, 12, 1, 12), 6);
  const ppiFood = pctChange(levels.PPIFOOD);

  const specs: Record<string, LeafSpec> = {
    GASNSA: { y: mom.GASNSA!, X: { g0: g, g1: shift(g, 1) } },
    FUEL: { y: mom.FUEL!, X: { h0: ho, h1: shift(ho, 1), y1: shift(mom.FUEL!, 1) } },
    ELEC: {
      y: mom.ELEC!,
      X: { y1: shift(mom.ELEC!, 1), m12: rollMean(mom.ELEC!, 12), hh1: shift(hh, 1), hh2: shift(hh, 2) },
    },
    UGAS: { y: mom.UGAS!, X: { hh0: hh, hh1: shift(hh, 1), hh2: shift(hh, 2), y1: shift(mom.UGAS!, 1) } },
    FAH: { y: mom.FAH!, X: { y1: shift(mom.FAH!, 1), m6: rollMean(mom.FAH!, 6), ppi1: shift(ppiFood, 1) } },
    FAFH: { y: mom.FAFH!, X: { m3: rollMean(mom.FAFH!, 3), m12: rollMean(mom.FAFH!, 12) } },
    USED: {
      y: mom.USED!,
      X: { mh1: shift(mh, 1), mh2: shift(mh, 2), mh3: shift(mh, 3), y1: shift(mom.USED!, 1) },
    },
    AIR: { y: mom.AIR!, X: { j0: jet, j1: shift(jet, 1), y1: shift(mom.AIR!, 1) } },
  };
  for (const k of ["RENT", "OER"] as const) {
    const base = { y1: shift(mom[k]!, 1), m3: rollMean(mom[k]!, 3, 2), m6: rollMean(mom[k]!, 6, 5) };
    specs[k] = { y: mom[k]!, X: { ...base, z: zLead }, start: ZORI_MODEL_START, fallbackX: base };
  }
  // 无可靠高频代理：自回归 + 12 月均值 + 残余季节性（过去 3 年同月偏离均值）
  for (const k of ["NEWV", "APP", "MEDC", "LODG", "MEDS", "OTRS", "OCG", "OCS"] as const) {
    const m12 = rollMean(mom[k]!, 12);
    const dev = mom[k]!.map((v, i) => v - m12[i]!);
    const sd = months.map((_, i) => (dev[i - 12]! + dev[i - 24]! + dev[i - 36]!) / 3);
    specs[k] = { y: mom[k]!, X: { y1: shift(mom[k]!, 1), m12, sd } };
  }

  return { months, monthIndex, mom, levels, weights, excluded, gapMonths, specs };
}

// ─────────────────────────────────────────────────────────────── 估计与预测 ──

function olsPredict(
  model: PreparedModel,
  y: readonly number[],
  X: Features,
  t: number,
  start?: string,
): number {
  const names = Object.keys(X);
  const xt = names.map((nm) => X[nm]![t]!);
  if (!xt.every(isNum)) return NaN;
  const rows: number[][] = [];
  const ys: number[] = [];
  const startIdx = start ? (model.monthIndex.get(start) ?? 0) : 0;
  for (let s = t - 1; s >= startIdx && rows.length < WINDOW; s--) {
    if (model.excluded.has(s) || !isNum(y[s])) continue;
    const row = names.map((nm) => X[nm]![s]!);
    if (!row.every(isNum)) continue;
    rows.push([1, ...row]);
    ys.push(y[s]!);
  }
  if (rows.length < MIN_TRAIN) return NaN;
  const beta = solveOls(rows, ys);
  if (!beta) return NaN;
  return beta[0]! + xt.reduce((acc, v, i) => acc + v * beta[i + 1]!, 0);
}

/** 汽油 SA 环比 − NSA 环比：过去 3 年同月均值（BLS 季节因子年内稳定） */
function seasonalGap(model: PreparedModel, sa: string, nsa: string, t: number): number {
  const gaps: number[] = [];
  for (let yy = 1; yy <= 3; yy++) {
    const s = t - 12 * yy;
    const d = model.mom[sa]![s]! - model.mom[nsa]![s]!;
    if (s >= 0 && isNum(d)) gaps.push(d);
  }
  return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
}

export function predictLeaf(model: PreparedModel, k: LeafKey, t: number): number {
  if (k === "GAS") {
    const nsa = olsPredict(model, model.specs.GASNSA!.y, model.specs.GASNSA!.X, t);
    return nsa + seasonalGap(model, "GAS", "GASNSA", t);
  }
  const spec = model.specs[k]!;
  const p = olsPredict(model, spec.y, spec.X, t, spec.start);
  if (!isNum(p) && spec.fallbackX) return olsPredict(model, spec.y, spec.fallbackX, t);
  return p;
}

export type Nowcast = Record<LeafKey | AggregateKey, number>;

/** 叶子预测按当月权重加总到各级（与 BLS 聚合口径一致） */
export function aggregate(model: PreparedModel, leaf: Record<LeafKey, number>, t: number): Nowcast {
  const w = (k: string) => model.weights[k]![t]!;
  const wsum = (ks: readonly string[]) => ks.reduce((a, k) => a + w(k), 0);
  const dot = (ks: readonly LeafKey[]) => ks.reduce((a, k) => a + w(k) * leaf[k], 0);
  const FOOD = dot(LEAVES_FOOD) / wsum(LEAVES_FOOD);
  const ENE = dot(LEAVES_ENE) / wsum(LEAVES_ENE);
  const CG = dot(LEAVES_CG) / w("CG");
  const CS = dot(LEAVES_CS) / w("CS");
  const CORE = (w("CG") * CG + w("CS") * CS) / w("CORE");
  const ALL = (w("FOOD") * FOOD + w("ENE") * ENE + w("CORE") * CORE) / (w("FOOD") + w("ENE") + w("CORE"));
  return { ...leaf, FOOD, ENE, CG, CS, CORE, ALL };
}

/**
 * 当月 nowcast。某分项回归无法估计（代理缺数或矩阵奇异）时退回该分项过去 12 个月均值，
 * 避免单项故障让总体变成空值；退回的分项记入 `fallbacks`（若传入）。
 */
export function nowcastMonth(model: PreparedModel, t: number, fallbacks?: LeafKey[]): Nowcast {
  const leaf = {} as Record<LeafKey, number>;
  for (const k of ALL_LEAVES) {
    let v = predictLeaf(model, k, t);
    if (!isNum(v)) {
      v = rollMean(model.mom[k]!, 12)[t]!;
      fallbacks?.push(k);
    }
    leaf[k] = v;
  }
  return aggregate(model, leaf, t);
}

/** 季调环比 → 未季调同比：NSA 环比 = SA 环比 + 过去 3 年同月 (NSA−SA) 均值 */
export function toNsaYoy(
  model: PreparedModel,
  saKey: LevelKey,
  nsaKey: LevelKey,
  saMom: number,
  t: number,
): { nsaMom: number; yoy: number; prevYoy: number } {
  const nsa = model.levels[nsaKey];
  const nsaMom = saMom - seasonalGap(model, saKey, nsaKey, t);
  const level = nsa[t - 1]! * (1 + nsaMom / 100);
  return {
    nsaMom,
    yoy: 100 * (level / nsa[t - 12]! - 1),
    prevYoy: 100 * (nsa[t - 1]! / nsa[t - 13]! - 1),
  };
}
