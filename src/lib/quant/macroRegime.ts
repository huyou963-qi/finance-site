/**
 * 宏观 regime 分类器（Phase 4 WS3）。
 *
 * 增长维 = **四块等权**合成 z：就业(PAYEMS YoY) / 收入(W875RX1 实际个人收入除转移支付 YoY) /
 * 生产(INDPRO YoY) / 调查(ISM 制造与服务 z 的均值)。各分量先对滚动历史标准化再取均值。
 *   —— 旧口径为 INDPRO+PAYEMS+ISM制造 三分量，其中 2 个偏制造业（约占 GDP 11%），
 *      权重与经济结构倒挂；实测（2000+）新旧口径判别衰退的 AUC 分别 0.967 / 0.955（差异很小），
 *      但新口径成分更忠实于经济结构。
 * 通胀维 = CPI/PCE YoY 的动量（YoY 3 月变化）合成 z。两维 → 增长上/下 × 通胀升/降四象限：
 *   recovery(复苏=上/降) overheat(过热=上/升) stagflation(滞胀=下/升) contraction(衰退式=下/降)。
 *
 * PIT（近似 point-in-time）：每维度用「T 时点市场可见的最新一期」（estimatedReleaseDate ≤ T，
 * 口径同 macroAsOf：periodEnd + 典型发布滞后），滚动 z 只回看可见月，故 regime[T] 不含前视。
 * recession = NBER USREC 该月真值（ground truth），仅作 overlay/验证基准——NBER 公告有长滞后，
 * 若当可交易信号会前视，故不进入四象限判定。
 *
 * z 参考分布用滚动窗（默认 120 月）而非全历史：捕捉「相对近十年常态」的上/下，抗结构性趋势漂移。
 *
 * **滞回带**：状态需越过 阈值±band 才切换，带内保持上期状态（applyHysteresis）。
 * 治「z 在阈值附近反复穿越」的月度抖动——实测 2000+（band 均取 0.25）：增长维翻转 16→9 次
 * （平均持续 18.6→31.9 月）、通胀维 74→56 次（4.2→5.6 月），且衰退月识别保持 28/28 不受损。
 * 只依赖过去状态，无前视；故 computeRegimeSeries 必须按日期升序推进。
 *
 * 阈值/窗口/滞回带均为参数，勿过拟合历史衰退（见 Phase 4 记忆口径要点）。
 * 特别注意：**不要**用「哪个口径让各象限股票收益差异最大」来反选宏观定义——
 * 那是拿收益数据反向拟合宏观状态，正是 P2 过拟合防护要防的选择性过拟合。
 */

import { prisma } from "@/lib/prisma";
import { isoToDay } from "@/lib/quant/backtest";
import { periodEnd, resolveLagDays } from "@/lib/data/macroAsOf";

// ────────────────────────────────────────────────────────── 序列码

export const REGIME_CODES = {
  indpro: "sched_fred_INDPRO",
  payems: "sched_fred_PAYEMS",
  /** 实际个人收入（除转移支付）——NBER 认定衰退的官方同步指标之一，全经济口径 */
  income: "sched_fred_W875RX1",
  ism: "ism_us_ism_headline",
  /** ISM 服务业 PMI（1997-07 起）；缺失期调查块自动退化为仅制造业 */
  ismSvc: "ism_svc_us_svc_headline",
  cpi: "sched_fred_CPIAUCSL",
  pce: "sched_fred_PCEPI",
  usrec: "sched_fred_USREC",
} as const;

// ────────────────────────────────────────────────────────── 参数

export type RegimeThresholds = {
  /** 增长 z ≥ 此值 → 增长「上」；否则「下」 */
  growthZThreshold: number;
  /** 通胀动量 z ≥ 此值 → 通胀「升」；否则「降」 */
  inflationZThreshold: number;
  /**
   * 增长维滞回带：|z − 阈值| ≤ band 时保持上期状态，超出才切换。
   * 治「z 在阈值附近反复穿越」造成的月度抖动。实测（2000+）band 0.25 使
   * 四块口径翻转 31 次 → 7 次（平均持续 9.9 → 39.6 月），且衰退月识别仍 28/28 不受损。
   */
  growthHysteresisBand: number;
  /**
   * 通胀维滞回带。通胀动量是二阶差分（YoY 再取 3 月变化），噪音被放大，
   * 无滞回时每 4.2 个月翻转一次；band 0.25 缓解到 5.6 个月。它仍是两维中更噪的一维。
   *
   * 取值 0.25 的依据（实测 2000+ 的权衡曲线，非单一 episode 调参）：
   * band ≤0.25 时「NBER 衰退月落衰退式象限」= 75%，≥0.30 时掉到 68%，分界干净；
   * 代价是象限平均持续 6.5(band 0.4) → 4.8 月。
   * 若使用场景以 regimeFilter 择时为主（更在意换手/抖动而非分类精度），可调到 0.4。
   */
  inflationHysteresisBand: number;
  /**
   * 增长方向的回看期数（网格期，月频即月数）。方向 = growthZ[i] − growthZ[i−N] 的符号。
   * **刻意不加滞回带**：3 期差分本身已是平滑量，且这是实证检验通过的原始口径
   * （加带会改变已验证的规则，见 regime-research-findings 备忘的 OOS 结果）。
   */
  growthDirectionLookback: number;
  /**
   * 判方向前对 growthZ 做的尾部移动平均窗口（月）；1 = 不平滑。
   * 借 Chicago Fed CFNAI-MA3 的做法：月度值噪音大，官方发布也以 3 月移动平均（CFNAI-MA3）
   * 作为周期判读口径。实测（2000+，判据沿用既定的 NBER/专家区间口径）：
   * 加 MA3 后 NBER 衰退月落「增长弱」由 26/28 → **28/28**、专家区间命中 59.8% → 61.6%、
   * 象限平均持续 2.6 → 3.5 期，且 8 个专家区间**零回退**，代价仅转折点晚约 1.2 期。
   */
  growthDirectionSmoothMonths: number;
  /**
   * 最短相位（期）：新状态需连续出现此期数才被确认，否则并入上一状态；1 = 不删失。
   * 借 Bry-Boschan 商业周期定标的删失规则（月度数据最短相位 6 个月、完整周期 15 个月）。
   *
   * **取 3 而非实测最优的 4**：3 有独立先验（一个季度＝宏观数据的天然信息周期），
   * 且删失后象限平均持续 6.8 期正落在 BB 建议区间。实测专家命中 MA3+删失3 = 71.9%、
   * 删失4 = 80.6%、删失6 = 67.5%——**取 4 只因它在这 8 个专家区间上分最高，属对评测指标调参**
   * （8 个区间 × 5 个候选值，峰值大概率是噪音），故不取。
   *
   * 代价（不粉饰）：转折确认晚约 3 期；2001 通缩期命中由 88% 降至 75%。
   * 删失只回看已确认的过去状态，不看未来 → 无前视。
   */
  minPhaseMonths: number;
  /** 滚动 z 参考窗（月） */
  zWindowMonths: number;
  /** 通胀动量 = YoY 与 N 月前 YoY 之差 */
  inflationMomentumMonths: number;
  /** 滚动 z 的最小有效样本（不足则该分量 z = null） */
  minZSample: number;
};

export const DEFAULT_REGIME_THRESHOLDS: RegimeThresholds = {
  growthZThreshold: 0,
  inflationZThreshold: 0,
  growthHysteresisBand: 0.25,
  inflationHysteresisBand: 0.25,
  growthDirectionLookback: 3,
  growthDirectionSmoothMonths: 3,
  minPhaseMonths: 3,
  zWindowMonths: 120,
  inflationMomentumMonths: 3,
  minZSample: 24,
};

export type GrowthState = "above" | "below";
/**
 * 增长「方向」——增长 z 相对 N 期前的变化符号，与 GrowthState 的「水平」**正交**。
 *
 * 为何必须与水平分开：经典宏观四象限用的是方向（加速/减速），本分类器的象限用的是水平，
 * 二者在「复苏早期」会给出相反读数——2020-08~2021-04 增长 z 从 −1.83 反弹到 +0.03
 * （3 期变化 +4.46），水平仍「下」但方向「升」，实为再通胀大牛市，被象限标成「滞胀」。
 * 实测（2000+）把滞胀按方向拆开：方向升 36 月下期 SPY +0.82%、方向降 29 月 −1.32%，差 2.14pp/月。
 */
export type GrowthDirection = "rising" | "falling";
export type InflationState = "rising" | "falling";
export type RegimeQuadrant = "recovery" | "overheat" | "stagflation" | "contraction";

/** 四象限中文标签 */
export const REGIME_LABEL_ZH: Record<RegimeQuadrant, string> = {
  recovery: "复苏",
  overheat: "过热",
  stagflation: "滞胀",
  contraction: "衰退式",
};

/**
 * Dalio 式四象限：**两轴同为「方向」**（增长方向 × 通胀方向），与上面按
 * 「增长水平 × 通胀动量」划分的 RegimeQuadrant **并列存在、互不替代**。
 *
 * 为何需要它：现行 RegimeQuadrant 两轴的导数阶数不一致——增长用水平（崩盘后长期为负、
 * 恢复慢），通胀用动量（二阶量、基数效应几个月就翻正）。于是每次周期见底都被机械地
 * 推去「增长下+通胀升」= 滞胀：实测 **13 次离开「衰退式」象限，13 次全部跳到「滞胀」**，
 * 且「衰退式↔滞胀」锁成二元振荡出不去复苏。这是定义的产物而非经济现实。
 *
 * 两轴同为方向后结构健康（离开最差象限有 3 个去向）、区分度更高
 * （最好−最差价差 1.47 vs 1.33 pp/月）、故事更干净（三个「还行」态都在 1.15% 左右，
 * 一个明确坏态 stagflation −0.31%）。NBER 衰退月落点两者相当。
 *
 * 命名注意：`stagflation` 与 RegimeQuadrant 同名但**语义不同**（这里是「增长方向降 +
 * 通胀升」，不含水平条件）。回测 regimeFilter 里用 `dalio:` 前缀区分，勿混用。
 */
export type DalioQuadrant = "reflation" | "goldilocks" | "stagflation" | "deflation";

export const DALIO_LABEL_ZH: Record<DalioQuadrant, string> = {
  reflation: "再通胀（增↑通↑）",
  goldilocks: "金发女孩（增↑通↓）",
  stagflation: "真滞胀（增↓通↑）",
  deflation: "通缩衰退（增↓通↓）",
};

/** 增长方向 × 通胀方向 → Dalio 四象限；方向未知（序列头部）→ null */
export function dalioQuadrant(
  growth: GrowthDirection | null,
  inflation: InflationState | null,
): DalioQuadrant | null {
  if (growth == null || inflation == null) return null;
  if (growth === "rising") return inflation === "rising" ? "reflation" : "goldilocks";
  return inflation === "rising" ? "stagflation" : "deflation";
}

// ────────────────────────────────────────────────────────── 纯函数

/** 增长上/下 × 通胀升/降 → 四象限 */
export function classifyQuadrant(
  growth: GrowthState,
  inflation: InflationState,
): RegimeQuadrant {
  if (growth === "above") return inflation === "rising" ? "overheat" : "recovery";
  return inflation === "rising" ? "stagflation" : "contraction";
}

/**
 * 增长方向：当前 z 与 lookback 期前的 z 相比升/降。
 * history = 按网格日升序的历史 growthZ（最近一期在末尾，不含当前期）。
 * 任一端缺失或历史不足 lookback 期 → null（不猜方向）。
 */
/**
 * 尾部移动平均：out[i] = mean(有限值 of xs[i−k+1..i])。窗内无有限值 → null。
 * 只回看，无前视。k ≤ 1 时原样返回。
 */
export function trailingMean(
  xs: readonly (number | null)[],
  k: number,
): (number | null)[] {
  if (!(k > 1)) return [...xs];
  return xs.map((_, i) => {
    const w: number[] = [];
    for (let j = Math.max(0, i - k + 1); j <= i; j++) {
      const v = xs[j];
      if (v != null && Number.isFinite(v)) w.push(v);
    }
    return w.length ? w.reduce((s, v) => s + v, 0) / w.length : null;
  });
}

/**
 * 最短相位删失（Bry-Boschan 式）：新状态需连续出现 minRun 期才被确认，
 * 否则沿用上一个已确认状态。**只用已确认的过去状态延续，不看未来 → 无前视。**
 *
 * 代价：转折点确认被推迟最多 minRun−1 期（这正是删失换稳定性的对价）。
 * minRun ≤ 1 时原样返回。
 */
export function censorMinPhase<T>(
  seq: readonly (T | null)[],
  minRun: number,
): (T | null)[] {
  if (!(minRun > 1)) return [...seq];
  const out: (T | null)[] = [];
  let confirmed: T | null = null;
  let pending: T | null = null;
  let pendingLen = 0;
  for (const cur of seq) {
    if (cur == null) {
      out.push(confirmed);
      continue;
    }
    if (confirmed == null) {
      confirmed = cur;
      out.push(cur);
      continue;
    }
    if (cur === confirmed) {
      pending = null;
      pendingLen = 0;
      out.push(confirmed);
      continue;
    }
    if (cur === pending) pendingLen += 1;
    else {
      pending = cur;
      pendingLen = 1;
    }
    if (pendingLen >= minRun) {
      confirmed = pending;
      pending = null;
      pendingLen = 0;
    }
    out.push(confirmed);
  }
  return out;
}

export function growthDirectionOf(
  currentZ: number | null,
  history: readonly (number | null)[],
  lookback: number,
): GrowthDirection | null {
  if (currentZ == null || !Number.isFinite(currentZ)) return null;
  if (!(lookback >= 1) || history.length < lookback) return null;
  const past = history[history.length - lookback];
  if (past == null || !Number.isFinite(past)) return null;
  return currentZ - past > 0 ? "rising" : "falling";
}

/**
 * 滞回带状态判定：z 需越过 threshold ± band 才切换，带内保持上期状态。
 * prev = null（首期或上期不可判）时退化为普通阈值判定。
 * 只依赖过去状态 → 不引入前视。
 */
export function applyHysteresis(
  z: number | null,
  threshold: number,
  band: number,
  prev: boolean | null,
): boolean {
  if (z == null || !Number.isFinite(z)) return prev ?? false;
  // band 非有限（如调用方漏传该参数——scripts/ 不在 tsconfig 覆盖内，类型检查拦不住）
  // 必须退化为「无滞回」而非落到下面的 NaN 比较，否则会 return prev 把状态永久冻结。
  if (prev == null || !(band > 0)) return z >= threshold;
  if (z > threshold + band) return true;
  if (z < threshold - band) return false;
  return prev;
}

/**
 * 滚动窗 z：values[j] 相对 [j−window+1, j] 内有限值的标准分。
 * values[j] 非有限、或窗内有效样本 < minSample、或 std=0 → null。
 */
export function rollingZ(
  values: readonly (number | null)[],
  j: number,
  window: number,
  minSample: number,
): number | null {
  if (j < 0 || j >= values.length) return null;
  const cur = values[j];
  if (cur == null || !Number.isFinite(cur)) return null;
  const lo = Math.max(0, j - window + 1);
  const win: number[] = [];
  for (let i = lo; i <= j; i++) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) win.push(v);
  }
  if (win.length < minSample) return null;
  const mean = win.reduce((s, v) => s + v, 0) / win.length;
  const variance = win.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (win.length - 1);
  const std = Math.sqrt(variance);
  if (!(std > 0)) return null;
  return (cur - mean) / std;
}

/** 均值（跳过 null）；全 null → null */
export function meanOfDefined(xs: readonly (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** 同比：values[i] / values[i−12] − 1（i<12 或分母 0 → null） */
export function deriveYoY(values: readonly number[]): (number | null)[] {
  return values.map((v, i) => {
    if (i < 12) return null;
    const prev = values[i - 12]!;
    return prev !== 0 ? v / prev - 1 : null;
  });
}

/** 动量：yoy[i] − yoy[i−k]（任一 null → null） */
export function deriveMomentum(
  yoy: readonly (number | null)[],
  k: number,
): (number | null)[] {
  return yoy.map((v, i) => {
    if (i < k) return null;
    const prev = yoy[i - k];
    return v != null && prev != null && Number.isFinite(v) && Number.isFinite(prev)
      ? v - prev
      : null;
  });
}

// ────────────────────────────────────────────────────────── 月频序列（近似 PIT）

export type MonthlySeries = {
  code: string;
  /** 月起始日 ISO（YYYY-MM-01），升序 */
  months: string[];
  values: number[];
  /** 各期估算发布日的 epoch 天（periodEnd + lagDays），单调升 */
  releaseDay: number[];
  lagDays: number;
};

/** 读一条月频宏观序列并预算各期估算发布日（口径同 macroAsOf） */
export async function loadMonthlySeriesByCode(code: string): Promise<MonthlySeries> {
  const inst = await prisma.instrument.findUnique({ where: { code }, select: { id: true } });
  if (!inst) throw new Error(`宏观序列不存在：${code}`);
  const obs = await prisma.macroObservation.findMany({
    where: { instrumentId: inst.id },
    orderBy: { obsDate: "asc" },
    select: { obsDate: true, value: true },
  });
  const { lagDays } = await resolveLagDays(inst.id);
  const months: string[] = [];
  const values: number[] = [];
  const releaseDay: number[] = [];
  for (const o of obs) {
    const iso = o.obsDate.toISOString().slice(0, 10);
    months.push(iso);
    values.push(o.value);
    const end = periodEnd(iso, "MONTHLY");
    releaseDay.push(isoToDay(end) + lagDays);
  }
  return { code, months, values, releaseDay, lagDays };
}

/** T 日可见的最新期下标（releaseDay ≤ T）；无则 −1（二分，releaseDay 单调升） */
export function latestVisibleIndex(series: MonthlySeries, tDay: number): number {
  const rd = series.releaseDay;
  let lo = 0;
  let hi = rd.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rd[mid]! <= tDay) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** 月序列中 obsDate = 指定月起始的下标（USREC 真值查月）；无则 −1 */
function indexOfMonth(series: MonthlySeries, monthIso: string): number {
  return series.months.indexOf(monthIso);
}

// ────────────────────────────────────────────────────────── 分类主流程

export type RegimeComponents = {
  indproYoY: number | null;
  indproZ: number | null;
  payemsYoY: number | null;
  payemsZ: number | null;
  /** 实际个人收入（除转移支付）YoY 与其滚动 z：收入块 */
  incomeYoY: number | null;
  incomeZ: number | null;
  ismLevel: number | null;
  ismZ: number | null;
  /** ISM 服务业 PMI 水平与其滚动 z（1997-07 前为 null） */
  ismSvcLevel: number | null;
  ismSvcZ: number | null;
  /** 调查块 = ISM 制造与服务 z 的均值（服务缺失时退化为仅制造） */
  surveyZ: number | null;
  cpiYoY: number | null;
  cpiMom: number | null;
  cpiMomZ: number | null;
  pceYoY: number | null;
  pceMom: number | null;
  pceMomZ: number | null;
};

export type RegimeInputs = {
  /** 各维度 T 时点可见的最新一期月份（透明化） */
  visibleMonth: Record<
    "indpro" | "payems" | "income" | "ism" | "ismSvc" | "cpi" | "pce",
    string | null
  >;
  growthZ: number | null;
  inflationMomZ: number | null;
  components: RegimeComponents;
  thresholds: RegimeThresholds;
};

export type MacroRegimePoint = {
  date: string;
  growthState: GrowthState;
  /** 增长方向；回看期数不足（序列头部）时为 null */
  growthDirection: GrowthDirection | null;
  inflationState: InflationState;
  regime: RegimeQuadrant;
  /**
   * Dalio 式象限（增长方向 × 通胀方向）；与 regime 并列，方向未知时为 null。
   * 经 computeRegimeSeries 的序列级处理：方向用 MA 平滑后的 growthZ 判定，象限再过最短相位删失。
   * 故删失生效的月份会与「growthDirection × inflationState 直接组合」不一致（见 censoredPhase）。
   */
  dalioRegime: DalioQuadrant | null;
  /** 该期 dalioRegime 是否由最短相位删失改写（true = 与原始组合不同，透明化用） */
  censoredPhase?: boolean;
  /** 0/1 NBER USREC 该月真值；−1 未知 */
  recession: number;
  inputs: RegimeInputs;
};

type LoadedSeries = {
  indpro: MonthlySeries;
  payems: MonthlySeries;
  income: MonthlySeries;
  ism: MonthlySeries;
  ismSvc: MonthlySeries;
  cpi: MonthlySeries;
  pce: MonthlySeries;
  usrec: MonthlySeries;
};

/** 一次性读取全部 regime 输入序列 */
export async function loadRegimeSeries(): Promise<LoadedSeries> {
  const [indpro, payems, income, ism, ismSvc, cpi, pce, usrec] = await Promise.all([
    loadMonthlySeriesByCode(REGIME_CODES.indpro),
    loadMonthlySeriesByCode(REGIME_CODES.payems),
    loadMonthlySeriesByCode(REGIME_CODES.income),
    loadMonthlySeriesByCode(REGIME_CODES.ism),
    loadMonthlySeriesByCode(REGIME_CODES.ismSvc),
    loadMonthlySeriesByCode(REGIME_CODES.cpi),
    loadMonthlySeriesByCode(REGIME_CODES.pce),
    loadMonthlySeriesByCode(REGIME_CODES.usrec),
  ]);
  return { indpro, payems, income, ism, ismSvc, cpi, pce, usrec };
}

/** 月起始日（YYYY-MM-01）：T 所在自然月，用于 USREC 真值对齐 */
function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * 单个 T（网格日）的 regime。derived = 预算好的各序列衍生数组（YoY/动量），
 * 避免每 T 重复求导。
 */
export function classifyRegimeAt(
  tIso: string,
  s: LoadedSeries,
  derived: {
    indproYoY: (number | null)[];
    payemsYoY: (number | null)[];
    incomeYoY: (number | null)[];
    cpiYoY: (number | null)[];
    cpiMom: (number | null)[];
    pceYoY: (number | null)[];
    pceMom: (number | null)[];
  },
  th: RegimeThresholds,
  /**
   * 跨期状态：滞回带用 growth/inflation，方向判定用 growthZHistory
   * （按网格日升序的历史 growthZ，最近一期在末尾）。null = 首期，退化为普通阈值 + 方向未知。
   */
  prev: {
    growth: GrowthState;
    inflation: InflationState;
    growthZHistory: readonly (number | null)[];
  } | null = null,
): MacroRegimePoint {
  const tDay = isoToDay(tIso);
  const { zWindowMonths: W, minZSample: MS } = th;

  const jIndpro = latestVisibleIndex(s.indpro, tDay);
  const jPayems = latestVisibleIndex(s.payems, tDay);
  const jIncome = latestVisibleIndex(s.income, tDay);
  const jIsm = latestVisibleIndex(s.ism, tDay);
  const jIsmSvc = latestVisibleIndex(s.ismSvc, tDay);
  const jCpi = latestVisibleIndex(s.cpi, tDay);
  const jPce = latestVisibleIndex(s.pce, tDay);

  const indproZ = rollingZ(derived.indproYoY, jIndpro, W, MS);
  const payemsZ = rollingZ(derived.payemsYoY, jPayems, W, MS);
  const incomeZ = rollingZ(derived.incomeYoY, jIncome, W, MS);
  const ismZ = rollingZ(s.ism.values, jIsm, W, MS);
  const ismSvcZ = rollingZ(s.ismSvc.values, jIsmSvc, W, MS);
  const cpiMomZ = rollingZ(derived.cpiMom, jCpi, W, MS);
  const pceMomZ = rollingZ(derived.pceMom, jPce, W, MS);

  // 四块等权：就业 / 收入 / 生产 / 调查（调查块内部先把制造与服务平均，
  // 避免调查类占两票且两票都是制造业——制造业仅约占 GDP 11%，
  // 旧口径 3 分量里 2 个偏制造，权重与经济结构严重倒挂）。
  const surveyZ = meanOfDefined([ismZ, ismSvcZ]);
  const growthZ = meanOfDefined([payemsZ, incomeZ, indproZ, surveyZ]);
  const inflationMomZ = meanOfDefined([cpiMomZ, pceMomZ]);

  const growthAbove = applyHysteresis(
    growthZ,
    th.growthZThreshold,
    th.growthHysteresisBand,
    prev ? prev.growth === "above" : null,
  );
  const inflationRising = applyHysteresis(
    inflationMomZ,
    th.inflationZThreshold,
    th.inflationHysteresisBand,
    prev ? prev.inflation === "rising" : null,
  );
  const growthState: GrowthState = growthAbove ? "above" : "below";
  const inflationState: InflationState = inflationRising ? "rising" : "falling";
  const regime = classifyQuadrant(growthState, inflationState);
  // 方向与象限正交：只依赖过去的 growthZ，无前视
  const growthDirection = growthDirectionOf(
    growthZ,
    prev?.growthZHistory ?? [],
    th.growthDirectionLookback,
  );

  const usrecIdx = indexOfMonth(s.usrec, monthStartOf(tIso));
  const recession = usrecIdx >= 0 ? Math.round(s.usrec.values[usrecIdx]!) : -1;

  const components: RegimeComponents = {
    indproYoY: jIndpro >= 0 ? derived.indproYoY[jIndpro] ?? null : null,
    indproZ,
    payemsYoY: jPayems >= 0 ? derived.payemsYoY[jPayems] ?? null : null,
    payemsZ,
    incomeYoY: jIncome >= 0 ? derived.incomeYoY[jIncome] ?? null : null,
    incomeZ,
    ismLevel: jIsm >= 0 ? s.ism.values[jIsm] ?? null : null,
    ismZ,
    ismSvcLevel: jIsmSvc >= 0 ? s.ismSvc.values[jIsmSvc] ?? null : null,
    ismSvcZ,
    surveyZ,
    cpiYoY: jCpi >= 0 ? derived.cpiYoY[jCpi] ?? null : null,
    cpiMom: jCpi >= 0 ? derived.cpiMom[jCpi] ?? null : null,
    cpiMomZ,
    pceYoY: jPce >= 0 ? derived.pceYoY[jPce] ?? null : null,
    pceMom: jPce >= 0 ? derived.pceMom[jPce] ?? null : null,
    pceMomZ,
  };

  return {
    date: tIso,
    growthState,
    growthDirection,
    inflationState,
    regime,
    dalioRegime: dalioQuadrant(growthDirection, inflationState),
    recession,
    inputs: {
      visibleMonth: {
        indpro: jIndpro >= 0 ? s.indpro.months[jIndpro]! : null,
        payems: jPayems >= 0 ? s.payems.months[jPayems]! : null,
        income: jIncome >= 0 ? s.income.months[jIncome]! : null,
        ism: jIsm >= 0 ? s.ism.months[jIsm]! : null,
        ismSvc: jIsmSvc >= 0 ? s.ismSvc.months[jIsmSvc]! : null,
        cpi: jCpi >= 0 ? s.cpi.months[jCpi]! : null,
        pce: jPce >= 0 ? s.pce.months[jPce]! : null,
      },
      growthZ,
      inflationMomZ,
      components,
      thresholds: th,
    },
  };
}

/** 预算各序列衍生数组（供 classifyRegimeAt 复用） */
export function deriveRegimeArrays(s: LoadedSeries, th: RegimeThresholds) {
  const cpiYoY = deriveYoY(s.cpi.values);
  const pceYoY = deriveYoY(s.pce.values);
  return {
    indproYoY: deriveYoY(s.indpro.values),
    payemsYoY: deriveYoY(s.payems.values),
    incomeYoY: deriveYoY(s.income.values),
    cpiYoY,
    cpiMom: deriveMomentum(cpiYoY, th.inflationMomentumMonths),
    pceYoY,
    pceMom: deriveMomentum(pceYoY, th.inflationMomentumMonths),
  };
}

/**
 * 全网格 regime 序列（各 date 一个 MacroRegimePoint）。
 *
 * 滞回带需要上期状态，故**必须按日期升序逐期推进**（内部排序，输出同为升序）。
 * 只回看过去状态，不引入前视。
 */
export async function computeRegimeSeries(
  gridDates: readonly string[],
  thresholds: RegimeThresholds = DEFAULT_REGIME_THRESHOLDS,
): Promise<MacroRegimePoint[]> {
  const s = await loadRegimeSeries();
  const derived = deriveRegimeArrays(s, thresholds);
  const sorted = [...gridDates].sort();
  const out: MacroRegimePoint[] = [];
  const growthZHistory: (number | null)[] = [];
  let prev: {
    growth: GrowthState;
    inflation: InflationState;
    growthZHistory: readonly (number | null)[];
  } | null = null;
  for (const d of sorted) {
    const p = classifyRegimeAt(d, s, derived, thresholds, prev);
    out.push(p);
    growthZHistory.push(p.inputs.growthZ);
    prev = { growth: p.growthState, inflation: p.inflationState, growthZHistory };
  }

  // ── 第二遍：方向与 Dalio 象限的序列级处理（逐点算不了，只回看故仍无前视）
  //
  // ① MA3 平滑后再判方向（CFNAI-MA3 思路）：月度 growthZ 噪音大。
  // ② 最短相位删失（Bry-Boschan）：**删失的是「相位」= 复合象限本身，不是单条序列**——
  //    实测删方向几乎无效（专家命中 64.6% vs 删象限 71.9%），因为象限翻转来自两条轴，
  //    只删方向则通胀那一侧的翻转照样漏过来。BB 定标的也正是复合相位。
  //
  // 后果（须知）：dalioRegime 是**删失后的相位**，在删失生效的月份会与
  // 「growthDirection × inflationState 的直接组合」不一致——这是有意的，
  // censoredPhase 标记了这些月份。
  const smoothed = trailingMean(growthZHistory, thresholds.growthDirectionSmoothMonths);
  const dirs = smoothed.map((z, i) =>
    growthDirectionOf(z, smoothed.slice(0, i), thresholds.growthDirectionLookback),
  );
  const rawBoxes = dirs.map((d, i) => dalioQuadrant(d, out[i]!.inflationState));
  const censored = censorMinPhase(rawBoxes, thresholds.minPhaseMonths);

  return out.map((p, i) => ({
    ...p,
    growthDirection: dirs[i] ?? null,
    dalioRegime: censored[i] ?? null,
    censoredPhase: censored[i] !== rawBoxes[i],
  }));
}

// ────────────────────────────────────────────────────────── 落库 / 读取

/** upsert regime 行（date 唯一）。返回写入行数。 */
export async function persistRegimeSeries(points: readonly MacroRegimePoint[]): Promise<number> {
  let n = 0;
  for (const p of points) {
    const date = new Date(`${p.date}T00:00:00.000Z`);
    await prisma.macroRegime.upsert({
      where: { date },
      create: {
        date,
        growthState: p.growthState,
        growthDirection: p.growthDirection,
        inflationState: p.inflationState,
        regime: p.regime,
        dalioRegime: p.dalioRegime,
        recession: p.recession,
        inputs: p.inputs as unknown as object,
      },
      update: {
        growthState: p.growthState,
        growthDirection: p.growthDirection,
        inflationState: p.inflationState,
        regime: p.regime,
        dalioRegime: p.dalioRegime,
        recession: p.recession,
        inputs: p.inputs as unknown as object,
      },
    });
    n++;
  }
  return n;
}

export type StoredRegime = {
  date: string;
  growthState: GrowthState;
  growthDirection: GrowthDirection | null;
  inflationState: InflationState;
  regime: RegimeQuadrant;
  dalioRegime: DalioQuadrant | null;
  recession: number;
  inputs: RegimeInputs;
};

function rowToStored(r: {
  date: Date;
  growthState: string;
  growthDirection: string | null;
  inflationState: string;
  regime: string;
  dalioRegime: string | null;
  recession: number;
  inputs: unknown;
}): StoredRegime {
  return {
    date: r.date.toISOString().slice(0, 10),
    growthState: r.growthState as GrowthState,
    growthDirection: (r.growthDirection ?? null) as GrowthDirection | null,
    inflationState: r.inflationState as InflationState,
    regime: r.regime as RegimeQuadrant,
    dalioRegime: (r.dalioRegime ?? null) as DalioQuadrant | null,
    recession: r.recession,
    inputs: r.inputs as RegimeInputs,
  };
}

/** 落库 regime 序列（升序），供 UI / 联动分析读取 */
export async function listStoredRegimes(opts: {
  start?: string | null;
  end?: string | null;
} = {}): Promise<StoredRegime[]> {
  const where: { date?: { gte?: Date; lte?: Date } } = {};
  if (opts.start || opts.end) {
    where.date = {};
    if (opts.start) where.date.gte = new Date(`${opts.start}T00:00:00.000Z`);
    if (opts.end) where.date.lte = new Date(`${opts.end}T00:00:00.000Z`);
  }
  const rows = await prisma.macroRegime.findMany({ where, orderBy: { date: "asc" } });
  return rows.map(rowToStored);
}

/** date(ISO) → regime 象限映射（精确对齐网格日；未落库 → 缺项） */
export async function loadRegimeMap(
  gridDates: readonly string[],
): Promise<Map<string, DalioQuadrant>> {
  const dateObjs = gridDates.map((d) => new Date(`${d}T00:00:00.000Z`));
  const rows = await prisma.macroRegime.findMany({
    where: { date: { in: dateObjs } },
    select: { date: true, dalioRegime: true },
  });
  const out = new Map<string, DalioQuadrant>();
  for (const r of rows) {
    if (r.dalioRegime) out.set(r.date.toISOString().slice(0, 10), r.dalioRegime as DalioQuadrant);
  }
  return out;
}

/**
 * PIT 读取：≤ 指定日的最近一期落库 regime（用于回测调仓日按可见 regime 决策）。
 * regime[T] 本身即 as-of T 的快照（只用 ≤T 可见数据），故调仓日取 ≤ 调仓日的最近期即 PIT 安全。
 */
export async function getRegimeAsOfDay(dateIso: string): Promise<StoredRegime | null> {
  const row = await prisma.macroRegime.findFirst({
    where: { date: { lte: new Date(`${dateIso}T00:00:00.000Z`) } },
    orderBy: { date: "desc" },
  });
  return row ? rowToStored(row) : null;
}
