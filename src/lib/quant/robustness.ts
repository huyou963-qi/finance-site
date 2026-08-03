/**
 * 过拟合防护——稳健性统计核心（P2 WS1，纯函数）。
 *
 * 平台的因子构造已 PIT、无前视（P0-P5 反复验证）；真正的过拟合风险在**人工的策略选择**
 * （选哪些因子/阈值/topN/权重）——即「选择性过拟合」(selection overfitting)。本模块提供
 * 治它的统计工具，不触库、可离线单测：
 *   ① Probabilistic Sharpe Ratio (PSR)：观测夏普显著优于基准的概率（校正样本长度与偏峰）。
 *   ② Deflated Sharpe Ratio (DSR)：PSR 但把「基准」抬到 N 次试验下的期望最大夏普——
 *      这才是对「从一堆策略里挑最优」的正确校正（Bailey & López de Prado 2014）。
 *   ③ 多重检验校正（Bonferroni / Benjamini-Hochberg）：作用于 IC 的 tStat 或多策略夏普的 p 值。
 *   ④ OOS 分割指标对照：样本内 vs 样本外指标退化度量。
 *   ⑤ walk-forward 段拼接：各 OOS 段按收益率链接成一条连续净值。
 *
 * **频率一致性是硬要求**：PSR/DSR 的夏普、试验夏普方差、基准夏普必须同频（本模块一律用
 * 「每期」口径 per-period，非年化）。年化夏普 ↔ 每期夏普用 `annualToPerPeriodSharpe` 转换
 * （SR_period = SR_annual / √periodsPerYear）。谎报试验数 N=1 等于没做校正——调用方须如实传。
 */

// ────────────────────────────────────────────────────────── 正态分布

/** 标准正态 CDF（Abramowitz & Stegun 7.1.26 的 erf 近似，精度 ~1e-7） */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/**
 * 标准正态分位（inverse CDF），Acklam 有理逼近（相对精度 ~1.15e-9）。
 * 不做 Halley 精修——精修需要精确 CDF，而本文件的 normalCdf 是 ~1.5e-7 的 erf 逼近，
 * 反而会拉低 ppf 在 p≈0.5 附近的精度。1e-9 对 DSR/PSR 的分位需求绰绰有余。
 * p∈(0,1)；越界返回 ±Infinity。
 */
export function normalPpf(p: number): number {
  if (!(p > 0)) return -Infinity;
  if (!(p < 1)) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  return x;
}

// ────────────────────────────────────────────────────────── Student-t 双尾 p 值

/** 正则化不完全 Beta I_x(a,b)（Numerical Recipes betai/betacf） */
function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta =
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lnBeta);
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betacf(a, b, x)) / a;
  }
  return 1 - (Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  ) *
    betacf(b, a, 1 - x)) /
    b;
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** ln Γ(x)（Lanczos 逼近） */
function lgamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Student-t 双尾 p 值 P(|T| > |t|)，自由度 df。
 * df 很大时自然收敛到正态双尾。用于把 IC 的 tStat 转成 p 值做多重检验校正。
 */
export function studentTTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  if (!(df > 0)) return 1;
  const x = df / (df + t * t);
  return regularizedIncompleteBeta(df / 2, 0.5, x);
}

// ────────────────────────────────────────────────────────── 收益矩

export type ReturnMoments = {
  /** 收益样本数 */
  n: number;
  mean: number;
  /** 总体标准差（÷n，与偏度/峰度同口径） */
  std: number;
  /** 偏度 γ3 */
  skew: number;
  /** 峰度 γ4（非超额；正态 = 3） */
  kurtosis: number;
  /** 每期夏普 = mean / std（rf=0） */
  sharpe: number;
};

export const EMPTY_MOMENTS: ReturnMoments = {
  n: 0,
  mean: 0,
  std: 0,
  skew: 0,
  kurtosis: 3,
  sharpe: 0,
};

/**
 * 收益序列的矩（偏度/峰度用总体口径 ÷n，与 PSR/DSR 公式一致）。
 * 非有限值剔除；n<2 或方差为 0 返回退化值（sharpe=0，kurtosis=3）。
 */
export function returnMoments(returns: readonly number[]): ReturnMoments {
  const xs = returns.filter((r) => Number.isFinite(r));
  const n = xs.length;
  if (n < 2) return { ...EMPTY_MOMENTS, n };
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const v of xs) {
    const d = v - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const std = Math.sqrt(m2);
  if (!(std > 0)) return { ...EMPTY_MOMENTS, n, mean, std: 0 };
  const skew = m3 / Math.pow(std, 3);
  const kurtosis = m4 / (m2 * m2);
  return { n, mean, std, skew, kurtosis, sharpe: mean / std };
}

/** 年化夏普 → 每期夏普（PSR/DSR 一律用每期口径） */
export function annualToPerPeriodSharpe(annualSharpe: number, periodsPerYear: number): number {
  return annualSharpe / Math.sqrt(periodsPerYear);
}

// ────────────────────────────────────────────────────────── PSR

/**
 * Probabilistic Sharpe Ratio：给定观测夏普与偏峰，真实（每期）夏普 > benchmarkSharpe 的概率。
 * 公式（López de Prado）：PSR = Φ( (SR − SR*)·√(n−1) / √(1 − γ3·SR + (γ4−1)/4·SR²) )。
 * 所有夏普均为**每期**口径。样本不足/退化返回 0.5（无信息）。
 */
export function probabilisticSharpe(
  observedSharpe: number,
  n: number,
  skew: number,
  kurtosis: number,
  benchmarkSharpe = 0,
): number {
  if (!(n > 1) || !Number.isFinite(observedSharpe)) return 0.5;
  const denomSq = 1 - skew * observedSharpe + ((kurtosis - 1) / 4) * observedSharpe * observedSharpe;
  if (!(denomSq > 0)) return observedSharpe > benchmarkSharpe ? 1 : 0;
  const z = ((observedSharpe - benchmarkSharpe) * Math.sqrt(n - 1)) / Math.sqrt(denomSq);
  return normalCdf(z);
}

// ────────────────────────────────────────────────────────── DSR

/** 欧拉-马歇罗尼常数 */
const EULER_MASCHERONI = 0.5772156649015329;

/**
 * N 次独立试验（各真实夏普=0）下的期望最大夏普（每期口径），即 DSR 的基准阈值 SR0。
 * SR0 = σ_SR · [ (1−γ)·Z⁻¹(1 − 1/N) + γ·Z⁻¹(1 − 1/(N·e)) ]，γ=欧拉常数。
 * σ_SR = 各试验夏普的横截面标准差。N<2 或 σ_SR=0 → 0（无多重检验，退回普通 PSR）。
 */
export function expectedMaxSharpe(trialSharpeStd: number, nTrials: number): number {
  if (!(nTrials > 1) || !(trialSharpeStd > 0)) return 0;
  const z1 = normalPpf(1 - 1 / nTrials);
  const z2 = normalPpf(1 - 1 / (nTrials * Math.E));
  return trialSharpeStd * ((1 - EULER_MASCHERONI) * z1 + EULER_MASCHERONI * z2);
}

/** 一组夏普的样本标准差（n−1） */
export function sharpeStd(sharpes: readonly number[]): number {
  const xs = sharpes.filter((s) => Number.isFinite(s));
  const n = xs.length;
  if (n < 2) return 0;
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const variance = xs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1);
  return Math.sqrt(variance);
}

export type DeflatedSharpeResult = {
  /** 入选（观测）策略的每期夏普 */
  observedSharpe: number;
  /** 试验数 N（如实记录，谎报即无效校正） */
  nTrials: number;
  /** 各试验夏普的横截面标准差（每期口径） */
  trialSharpeStd: number;
  /** N 次试验期望最大夏普 SR0（每期，仅多重检验部分） */
  expectedMaxSharpe: number;
  /** 被动基准的每期夏普（如 SPY 买入持有）；未提供 = 0 */
  benchmarkSharpe: number;
  /** 实际用作零假设的夏普 = max(expectedMaxSharpe, benchmarkSharpe) */
  thresholdSharpe: number;
  /** 未校正的 PSR（基准=0），用于对照「校正吃掉了多少显著性」 */
  psrVsZero: number;
  /** Deflated Sharpe Ratio = PSR(观测夏普 vs thresholdSharpe) */
  dsr: number;
  /** DSR ≥ 显著性阈值（默认 0.95）→ 扣除多重检验与基准后仍显著 */
  significant: boolean;
};

/**
 * Deflated Sharpe Ratio。入选策略的收益矩（observedSharpe/n/skew/kurtosis 每期口径）+
 * 全部试验的每期夏普数组 → DSR。DSR = PSR，但基准从 0 抬到 N 次试验的期望最大夏普。
 * 「从扫描里挑最优」正是这里 N>1 该校正的场景。
 *
 * `benchmarkSharpe`：对**多头股票策略**，「真实夏普 > 0」是几乎必然成立的空洞命题——
 * 买入持有 SPY 的每期夏普本就为正，任何满仓策略都能轻松通过 vs 0 的检验。要回答
 * 「选股是否真的胜过被动持有」，零假设必须抬到基准自身的夏普。故最终阈值取
 * max(期望最大夏普, 基准夏普)：前者防「挑最优」，后者防「只是拿了 beta」。
 */
export function deflatedSharpe(input: {
  observedSharpe: number;
  n: number;
  skew: number;
  kurtosis: number;
  trialSharpes: readonly number[];
  /** 被动基准的每期夏普（同频口径）；缺省 0 = 退回经典 DSR */
  benchmarkSharpe?: number;
  threshold?: number;
}): DeflatedSharpeResult {
  const threshold = input.threshold ?? 0.95;
  const nTrials = input.trialSharpes.filter((s) => Number.isFinite(s)).length;
  const trialStd = sharpeStd(input.trialSharpes);
  const srMax = expectedMaxSharpe(trialStd, nTrials);
  const benchmarkSharpe =
    input.benchmarkSharpe != null && Number.isFinite(input.benchmarkSharpe)
      ? input.benchmarkSharpe
      : 0;
  const sr0 = Math.max(srMax, benchmarkSharpe);
  const psrVsZero = probabilisticSharpe(input.observedSharpe, input.n, input.skew, input.kurtosis, 0);
  const dsr = probabilisticSharpe(input.observedSharpe, input.n, input.skew, input.kurtosis, sr0);
  return {
    observedSharpe: input.observedSharpe,
    nTrials,
    trialSharpeStd: trialStd,
    expectedMaxSharpe: srMax,
    benchmarkSharpe,
    thresholdSharpe: sr0,
    psrVsZero,
    dsr,
    significant: dsr >= threshold,
  };
}

// ────────────────────────────────────────────────────────── 多重检验校正

export type MultipleTestingItem = {
  label: string;
  /** 原始双尾 p 值 */
  pValue: number;
};

export type MultipleTestingResult = {
  label: string;
  pValue: number;
  /** Bonferroni 校正 p = min(1, p·m) */
  bonferroni: number;
  /** Benjamini-Hochberg（FDR）校正 p（step-up 单调化） */
  bh: number;
  bonferroniSignificant: boolean;
  bhSignificant: boolean;
};

/**
 * 对一组 p 值同时做 Bonferroni（控 FWER，保守）与 Benjamini-Hochberg（控 FDR）校正。
 * 返回按原顺序对齐的校正 p 值 + 是否显著（alpha 默认 0.05）。
 * m = 检验数（即试验/因子数）——多重检验的核心是 m 越大、单个越难显著。
 */
export function multipleTestingCorrection(
  items: readonly MultipleTestingItem[],
  alpha = 0.05,
): MultipleTestingResult[] {
  const m = items.length;
  if (m === 0) return [];
  // BH：按 p 升序，adj_(i) = min_{j≥i} ( m/rank_j · p_(j) )，再单调化（cummin from largest）
  const order = items
    .map((it, i) => ({ i, p: it.pValue }))
    .sort((a, b) => a.p - b.p);
  const bhByIndex = new Array<number>(m);
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const rank = k + 1;
    const raw = (order[k]!.p * m) / rank;
    running = Math.min(running, raw);
    bhByIndex[order[k]!.i] = Math.min(1, running);
  }
  return items.map((it, idx) => {
    const bonf = Math.min(1, it.pValue * m);
    const bh = bhByIndex[idx] ?? Math.min(1, it.pValue);
    return {
      label: it.label,
      pValue: it.pValue,
      bonferroni: bonf,
      bh,
      bonferroniSignificant: bonf < alpha,
      bhSignificant: bh < alpha,
    };
  });
}

/** IC 汇总的 tStat（自由度 = n−1）→ 双尾 p 值，喂多重检验校正 */
export function icTStatToPValue(tStat: number, n: number): number {
  if (!(n > 1)) return 1;
  return studentTTwoSidedP(tStat, n - 1);
}

// ────────────────────────────────────────────────────────── OOS 分割对照

export type SplitMetrics = {
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  vol: number;
};

export type OosDegradation = {
  is: SplitMetrics;
  oos: SplitMetrics;
  /** OOS 夏普 / IS 夏普（<1 = 退化；负号翻转视为崩溃） */
  sharpeRetention: number | null;
  /** OOS CAGR − IS CAGR */
  cagrDelta: number;
  /** OOS 夏普 − IS 夏普 */
  sharpeDelta: number;
  /** 样本外是否崩溃：OOS 夏普 ≤ 0 而 IS 夏普 > 0 */
  collapsed: boolean;
};

/** 样本内/外指标对照 → 退化度量（纯计算，指标由 computeMetrics 产出） */
export function oosDegradation(is: SplitMetrics, oos: SplitMetrics): OosDegradation {
  const sharpeRetention =
    is.sharpe !== 0 && Number.isFinite(is.sharpe) ? oos.sharpe / is.sharpe : null;
  return {
    is,
    oos,
    sharpeRetention,
    cagrDelta: oos.cagr - is.cagr,
    sharpeDelta: oos.sharpe - is.sharpe,
    collapsed: is.sharpe > 0 && oos.sharpe <= 0,
  };
}

// ────────────────────────────────────────────────────────── walk-forward 拼接

export type NavPoint = { date: string; nav: number };
export type StitchedNavPoint = { date: string; nav: number; segment: number };

/**
 * 把多段 OOS 净值按收益率链接成一条连续曲线（各段以自身首点为基归一，链式相乘）。
 * 返回点带 segment 序号（供 UI 交替着色，一眼看清段界）。日期重复（段界处）保留后段值。
 * 每段至少 2 点方计入；空段跳过。
 */
export function stitchWalkForward(segments: readonly NavPoint[][]): StitchedNavPoint[] {
  const out: StitchedNavPoint[] = [];
  let running = 1;
  let seg = 0;
  let started = false;
  for (const segment of segments) {
    if (segment.length < 2) continue;
    const base = segment[0]!.nav;
    if (!(base > 0)) continue;
    for (let i = 0; i < segment.length; i++) {
      const p = segment[i]!;
      // 段界重复点（i=0 且已有输出）：其值 = 上段末尾 running，跳过避免重复日期
      if (i === 0 && started) continue;
      out.push({ date: p.date, nav: running * (p.nav / base), segment: seg });
    }
    running *= segment[segment.length - 1]!.nav / base;
    started = true;
    seg++;
  }
  return out;
}
