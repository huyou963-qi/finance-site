/**
 * 因子研究引擎核心（Phase 4 WS1，纯函数）。
 *
 * - 不触库：前向收益面 / 截面装配在 factorResearchData.ts；本模块只做数学，单测可离线跑。
 * - IC 用 Spearman rank（截面因子秩 vs 次期前向收益秩的 Pearson），抗厚尾异常值，
 *   与 Phase 4 记忆口径一致（勿用 Pearson on raw）。
 * - 分层 Q5−Q1 价差定义为「最高因子值组 − 最低因子值组」的次期收益差，
 *   符号与 IC 一致（不做方向调整，方向是展示层的事）。
 * - IC 时间序列汇总：均值 / 样本标准差 / IR=mean/std / t 统计 / IC>0 胜率 / 累计 IC。
 *   月频序列的年化 IR = IR × √12。
 */

// ────────────────────────────────────────────────────────── 秩与相关

/**
 * 平均秩（并列取平均秩，从 1 计）。有限值给秩，null/非有限保持 null。
 * 与 factorCompute.percentileRanks 同法但不归一到 0–1（Spearman 只需秩的线性相关）。
 */
export function averageRanks(values: readonly (number | null)[]): (number | null)[] {
  const idx = values
    .map((x, i) => ({ x, i }))
    .filter((p): p is { x: number; i: number } => p.x != null && Number.isFinite(p.x));
  const out: (number | null)[] = values.map(() => null);
  if (idx.length === 0) return out;
  idx.sort((a, b) => a.x - b.x);
  let k = 0;
  while (k < idx.length) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1]!.x === idx[k]!.x) j++;
    const rank = (k + j) / 2 + 1; // 1-based 平均秩
    for (let m = k; m <= j; m++) out[idx[m]!.i] = rank;
    k = j + 1;
  }
  return out;
}

/** Pearson 相关；需 ≥2 对完整数据且两侧方差非零，否则 null。 */
export function pearson(
  xs: readonly (number | null)[],
  ys: readonly (number | null)[],
): number | null {
  const n = Math.min(xs.length, ys.length);
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = xs[i];
    const b = ys[i];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    px.push(a);
    py.push(b);
  }
  const m = px.length;
  if (m < 2) return null;
  const mx = px.reduce((s, v) => s + v, 0) / m;
  const my = py.reduce((s, v) => s + v, 0) / m;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < m; i++) {
    const dx = px[i]! - mx;
    const dy = py[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * 截面 Spearman rank IC：因子值秩与次期前向收益秩的 Pearson。
 * 成对完整（任一侧 null 的股票剔除），有效对 <2 返回 null。
 */
export function spearmanIC(
  factorValues: readonly (number | null)[],
  fwdReturns: readonly (number | null)[],
): number | null {
  const n = Math.min(factorValues.length, fwdReturns.length);
  // 先取成对完整子集，再各自求秩（否则 null 会污染秩次）
  const fv: (number | null)[] = [];
  const fr: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = factorValues[i];
    const b = fwdReturns[i];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    fv.push(a);
    fr.push(b);
  }
  if (fv.length < 2) return null;
  return pearson(averageRanks(fv), averageRanks(fr));
}

// ────────────────────────────────────────────────────────── IC 时间序列

export type ICSummary = {
  /** 有效 IC 的期数 */
  n: number;
  meanIC: number;
  /** 样本标准差（n−1） */
  stdIC: number;
  /** 信息比 = meanIC / stdIC */
  ir: number;
  /** 月频年化 IR = IR × √12 */
  irAnnualized: number;
  /** t 统计 = meanIC / (stdIC/√n) */
  tStat: number;
  /** IC>0 的期数占比 */
  hitRate: number;
};

export const EMPTY_IC_SUMMARY: ICSummary = {
  n: 0,
  meanIC: 0,
  stdIC: 0,
  ir: 0,
  irAnnualized: 0,
  tStat: 0,
  hitRate: 0,
};

/** IC 序列汇总（自动跳过 null 期）。 */
export function summarizeIC(ics: readonly (number | null)[]): ICSummary {
  const valid = ics.filter((x): x is number => x != null && Number.isFinite(x));
  const n = valid.length;
  if (n === 0) return { ...EMPTY_IC_SUMMARY };
  const mean = valid.reduce((s, v) => s + v, 0) / n;
  const variance =
    n > 1 ? valid.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const ir = std > 0 ? mean / std : 0;
  const tStat = std > 0 ? mean / (std / Math.sqrt(n)) : 0;
  const wins = valid.filter((v) => v > 0).length;
  return {
    n,
    meanIC: mean,
    stdIC: std,
    ir,
    irAnnualized: ir * Math.sqrt(12),
    tStat,
    hitRate: wins / n,
  };
}

/** 累计 IC 曲线（null 期贡献 0，保持与输入等长便于按期对齐画图）。 */
export function cumulativeIC(ics: readonly (number | null)[]): number[] {
  let sum = 0;
  return ics.map((x) => {
    if (x != null && Number.isFinite(x)) sum += x;
    return sum;
  });
}

// ────────────────────────────────────────────────────────── 分层

/**
 * 按因子值分 q 组，返回各组次期等权收益（index 0 = 最低因子值组，q−1 = 最高）。
 * 成对完整后按因子值升序等分（并列按原序），组内等权平均前向收益。
 * 某组无成员 → 该组 null。
 */
export function quantileGroupReturns(
  factorValues: readonly (number | null)[],
  fwdReturns: readonly (number | null)[],
  q: number,
): (number | null)[] {
  if (q < 2) throw new Error("分层组数至少为 2");
  const n = Math.min(factorValues.length, fwdReturns.length);
  const pairs: { v: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = factorValues[i];
    const r = fwdReturns[i];
    if (v == null || r == null || !Number.isFinite(v) || !Number.isFinite(r)) continue;
    pairs.push({ v, r });
  }
  const out: (number | null)[] = Array.from({ length: q }, () => null);
  if (pairs.length < q) return out; // 样本不足分不满 q 组
  pairs.sort((a, b) => a.v - b.v);
  const m = pairs.length;
  const sums = Array.from({ length: q }, () => 0);
  const counts = Array.from({ length: q }, () => 0);
  for (let rank = 0; rank < m; rank++) {
    let g = Math.floor((rank * q) / m);
    if (g >= q) g = q - 1;
    sums[g] += pairs[rank]!.r;
    counts[g] += 1;
  }
  for (let g = 0; g < q; g++) {
    if (counts[g]! > 0) out[g] = sums[g]! / counts[g]!;
  }
  return out;
}

/**
 * 单期分层价差 = 最高因子值组 − 最低因子值组的次期等权收益差。
 * 符号与 IC 一致（IC>0 ⇒ 高因子值 → 高收益 ⇒ 价差 >0）。
 */
export function quantileSpread(
  factorValues: readonly (number | null)[],
  fwdReturns: readonly (number | null)[],
  q: number,
): number | null {
  const groups = quantileGroupReturns(factorValues, fwdReturns, q);
  const top = groups[q - 1];
  const bottom = groups[0];
  if (top == null || bottom == null) return null;
  return top - bottom;
}

export type LayeringSummary = {
  quantiles: number;
  /** 各组次期收益的时间平均（index 0 = 最低因子值组）；某组从无样本 → null */
  meanGroupReturns: (number | null)[];
  /** Q_top − Q_bottom 逐期价差序列 */
  perPeriodSpread: (number | null)[];
  /** 逐期价差的时间平均 */
  meanSpread: number;
  /** 有效价差期数 */
  spreadN: number;
  /** 多空价差的年化 IR（月频 × √12），刻画单调性稳定度 */
  spreadIR: number;
};

/**
 * 汇总多期分层：每期一组因子值 + 前向收益 → 组收益矩阵与价差序列的时间平均。
 * periods[i] = { factorValues, fwdReturns } 已按 symbol 对齐同序。
 */
export function summarizeLayering(
  periods: readonly {
    factorValues: readonly (number | null)[];
    fwdReturns: readonly (number | null)[];
  }[],
  q: number,
): LayeringSummary {
  const groupSums = Array.from({ length: q }, () => 0);
  const groupCounts = Array.from({ length: q }, () => 0);
  const perPeriodSpread: (number | null)[] = [];
  for (const p of periods) {
    const groups = quantileGroupReturns(p.factorValues, p.fwdReturns, q);
    for (let g = 0; g < q; g++) {
      const v = groups[g];
      if (v != null && Number.isFinite(v)) {
        groupSums[g] += v;
        groupCounts[g] += 1;
      }
    }
    const top = groups[q - 1];
    const bottom = groups[0];
    perPeriodSpread.push(top != null && bottom != null ? top - bottom : null);
  }
  const meanGroupReturns = groupSums.map((s, g) =>
    groupCounts[g]! > 0 ? s / groupCounts[g]! : null,
  );
  const spreads = perPeriodSpread.filter((x): x is number => x != null && Number.isFinite(x));
  const spreadN = spreads.length;
  const meanSpread = spreadN > 0 ? spreads.reduce((s, v) => s + v, 0) / spreadN : 0;
  const spreadVar =
    spreadN > 1
      ? spreads.reduce((s, v) => s + (v - meanSpread) * (v - meanSpread), 0) / (spreadN - 1)
      : 0;
  const spreadStd = Math.sqrt(spreadVar);
  const spreadIR = spreadStd > 0 ? (meanSpread / spreadStd) * Math.sqrt(12) : 0;
  return {
    quantiles: q,
    meanGroupReturns,
    perPeriodSpread,
    meanSpread,
    spreadN,
    spreadIR,
  };
}
