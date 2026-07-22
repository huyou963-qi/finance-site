/**
 * 宏观 regime 分类器（Phase 4 WS3）。
 *
 * 增长维 = INDPRO YoY + PAYEMS YoY + ISM headline 的合成 z（各自对滚动历史标准化，取均值）；
 * 通胀维 = CPI/PCE YoY 的动量（YoY 3 月变化）合成 z。两维 → 增长上/下 × 通胀升/降四象限：
 *   recovery(复苏=上/降) overheat(过热=上/升) stagflation(滞胀=下/升) contraction(衰退式=下/降)。
 *
 * PIT（近似 point-in-time）：每维度用「T 时点市场可见的最新一期」（estimatedReleaseDate ≤ T，
 * 口径同 macroAsOf：periodEnd + 典型发布滞后），滚动 z 只回看可见月，故 regime[T] 不含前视。
 * recession = NBER USREC 该月真值（ground truth），仅作 overlay/验证基准——NBER 公告有长滞后，
 * 若当可交易信号会前视，故不进入四象限判定。
 *
 * z 参考分布用滚动窗（默认 120 月）而非全历史：捕捉「相对近十年常态」的上/下，抗结构性趋势漂移。
 * 阈值/窗口均为参数，勿过拟合历史衰退（见 Phase 4 记忆口径要点）。
 */

import { prisma } from "@/lib/prisma";
import { isoToDay } from "@/lib/quant/backtest";
import { periodEnd, resolveLagDays } from "@/lib/data/macroAsOf";

// ────────────────────────────────────────────────────────── 序列码

export const REGIME_CODES = {
  indpro: "sched_fred_INDPRO",
  payems: "sched_fred_PAYEMS",
  ism: "ism_us_ism_headline",
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
  zWindowMonths: 120,
  inflationMomentumMonths: 3,
  minZSample: 24,
};

export type GrowthState = "above" | "below";
export type InflationState = "rising" | "falling";
export type RegimeQuadrant = "recovery" | "overheat" | "stagflation" | "contraction";

/** 四象限中文标签 */
export const REGIME_LABEL_ZH: Record<RegimeQuadrant, string> = {
  recovery: "复苏",
  overheat: "过热",
  stagflation: "滞胀",
  contraction: "衰退式",
};

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
  ismLevel: number | null;
  ismZ: number | null;
  cpiYoY: number | null;
  cpiMom: number | null;
  cpiMomZ: number | null;
  pceYoY: number | null;
  pceMom: number | null;
  pceMomZ: number | null;
};

export type RegimeInputs = {
  /** 各维度 T 时点可见的最新一期月份（透明化） */
  visibleMonth: Record<"indpro" | "payems" | "ism" | "cpi" | "pce", string | null>;
  growthZ: number | null;
  inflationMomZ: number | null;
  components: RegimeComponents;
  thresholds: RegimeThresholds;
};

export type MacroRegimePoint = {
  date: string;
  growthState: GrowthState;
  inflationState: InflationState;
  regime: RegimeQuadrant;
  /** 0/1 NBER USREC 该月真值；−1 未知 */
  recession: number;
  inputs: RegimeInputs;
};

type LoadedSeries = {
  indpro: MonthlySeries;
  payems: MonthlySeries;
  ism: MonthlySeries;
  cpi: MonthlySeries;
  pce: MonthlySeries;
  usrec: MonthlySeries;
};

/** 一次性读取全部 regime 输入序列 */
export async function loadRegimeSeries(): Promise<LoadedSeries> {
  const [indpro, payems, ism, cpi, pce, usrec] = await Promise.all([
    loadMonthlySeriesByCode(REGIME_CODES.indpro),
    loadMonthlySeriesByCode(REGIME_CODES.payems),
    loadMonthlySeriesByCode(REGIME_CODES.ism),
    loadMonthlySeriesByCode(REGIME_CODES.cpi),
    loadMonthlySeriesByCode(REGIME_CODES.pce),
    loadMonthlySeriesByCode(REGIME_CODES.usrec),
  ]);
  return { indpro, payems, ism, cpi, pce, usrec };
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
    cpiYoY: (number | null)[];
    cpiMom: (number | null)[];
    pceYoY: (number | null)[];
    pceMom: (number | null)[];
  },
  th: RegimeThresholds,
): MacroRegimePoint {
  const tDay = isoToDay(tIso);
  const { zWindowMonths: W, minZSample: MS } = th;

  const jIndpro = latestVisibleIndex(s.indpro, tDay);
  const jPayems = latestVisibleIndex(s.payems, tDay);
  const jIsm = latestVisibleIndex(s.ism, tDay);
  const jCpi = latestVisibleIndex(s.cpi, tDay);
  const jPce = latestVisibleIndex(s.pce, tDay);

  const indproZ = rollingZ(derived.indproYoY, jIndpro, W, MS);
  const payemsZ = rollingZ(derived.payemsYoY, jPayems, W, MS);
  const ismZ = rollingZ(s.ism.values, jIsm, W, MS);
  const cpiMomZ = rollingZ(derived.cpiMom, jCpi, W, MS);
  const pceMomZ = rollingZ(derived.pceMom, jPce, W, MS);

  const growthZ = meanOfDefined([indproZ, payemsZ, ismZ]);
  const inflationMomZ = meanOfDefined([cpiMomZ, pceMomZ]);

  const growthState: GrowthState =
    growthZ != null && growthZ >= th.growthZThreshold ? "above" : "below";
  const inflationState: InflationState =
    inflationMomZ != null && inflationMomZ >= th.inflationZThreshold ? "rising" : "falling";
  const regime = classifyQuadrant(growthState, inflationState);

  const usrecIdx = indexOfMonth(s.usrec, monthStartOf(tIso));
  const recession = usrecIdx >= 0 ? Math.round(s.usrec.values[usrecIdx]!) : -1;

  const components: RegimeComponents = {
    indproYoY: jIndpro >= 0 ? derived.indproYoY[jIndpro] ?? null : null,
    indproZ,
    payemsYoY: jPayems >= 0 ? derived.payemsYoY[jPayems] ?? null : null,
    payemsZ,
    ismLevel: jIsm >= 0 ? s.ism.values[jIsm] ?? null : null,
    ismZ,
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
    inflationState,
    regime,
    recession,
    inputs: {
      visibleMonth: {
        indpro: jIndpro >= 0 ? s.indpro.months[jIndpro]! : null,
        payems: jPayems >= 0 ? s.payems.months[jPayems]! : null,
        ism: jIsm >= 0 ? s.ism.months[jIsm]! : null,
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
    cpiYoY,
    cpiMom: deriveMomentum(cpiYoY, th.inflationMomentumMonths),
    pceYoY,
    pceMom: deriveMomentum(pceYoY, th.inflationMomentumMonths),
  };
}

/** 全网格 regime 序列（各 date 一个 MacroRegimePoint） */
export async function computeRegimeSeries(
  gridDates: readonly string[],
  thresholds: RegimeThresholds = DEFAULT_REGIME_THRESHOLDS,
): Promise<MacroRegimePoint[]> {
  const s = await loadRegimeSeries();
  const derived = deriveRegimeArrays(s, thresholds);
  return gridDates.map((d) => classifyRegimeAt(d, s, derived, thresholds));
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
        inflationState: p.inflationState,
        regime: p.regime,
        recession: p.recession,
        inputs: p.inputs as unknown as object,
      },
      update: {
        growthState: p.growthState,
        inflationState: p.inflationState,
        regime: p.regime,
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
  inflationState: InflationState;
  regime: RegimeQuadrant;
  recession: number;
  inputs: RegimeInputs;
};

function rowToStored(r: {
  date: Date;
  growthState: string;
  inflationState: string;
  regime: string;
  recession: number;
  inputs: unknown;
}): StoredRegime {
  return {
    date: r.date.toISOString().slice(0, 10),
    growthState: r.growthState as GrowthState,
    inflationState: r.inflationState as InflationState,
    regime: r.regime as RegimeQuadrant,
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
): Promise<Map<string, RegimeQuadrant>> {
  const dateObjs = gridDates.map((d) => new Date(`${d}T00:00:00.000Z`));
  const rows = await prisma.macroRegime.findMany({
    where: { date: { in: dateObjs } },
    select: { date: true, regime: true },
  });
  return new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r.regime as RegimeQuadrant]));
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
