/**
 * 资金面因子计算（Phase 5 WS2）——机构持仓（13F）纯函数。
 *
 * 照 [[phase1-factor-library]] 的 computeFundamentalFactors 模式：读 PIT 可见的原始持仓 →
 * 产出 Record<string,number>，与技术/基本面因子合并后进 winsorize+zscore → FactorSnapshot，
 * 由此自动获得 screener/回测/IC-IR/regime 全部能力（架构复利）。
 *
 * PIT 口径（严格无前视）：
 * - 每个报告期 P 的聚合只计 filedAt ≤ periodEnd+WINDOW 的 filing（每 filer 取窗口内最新一份，
 *   吸收准时申报 + 短期修正，排除远期重述）；
 * - 该期「可见日」visibility = periodEnd + WINDOW；因子在 T 只取 visibility ≤ T 的最新期。
 * - 于是任一被选中期，其全部计入 filing 均 filedAt ≤ periodEnd+WINDOW ≤ T → T 之后 filed 的数据
 *   必在窗口外、不影响该期聚合 → 无前视测试恒成立。
 *
 * 拆股口径：入参 shares 须已由加载层归一到「现拆股刻度」（× ∏ratio(exDate>periodEnd)），
 * 与 PIT sharesOutstanding（现刻度）同口径，避免跨拆股的占比/环比失真（[[phase1-factor-library]] 坑1）。
 */

/** 报告期后多少天视为可见（13F 法定 45 天 + 缓冲）；也是聚合计入 filing 的窗口上限 */
export const FILING_WINDOW_DAYS = 50;

const DAY_MS = 86_400_000;

export function addDaysIso(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** 单 filer 单期持仓（shares 已归一到现拆股刻度） */
export type FilerHolding = {
  filerCik: string;
  filedAtIso: string;
  periodEndIso: string;
  shares: number;
  value: number;
};

/** 某 symbol 某报告期的跨 filer 聚合 */
export type PeriodAgg = {
  periodEndIso: string;
  /** 可见日 = periodEnd + FILING_WINDOW_DAYS */
  visibilityIso: string;
  totalShares: number;
  totalValue: number;
  /** 持有该股的机构家数 */
  holderCount: number;
  /** 持仓集中度 HHI = Σ(w_i²)，w_i = filer_i 份额占比；1=单一机构，→0=极分散 */
  hhi: number;
};

/**
 * 逐 filer 持仓 → 逐期聚合。窗口内每 filer 取最新 filing（去重修正/多份），
 * 计 totalShares/holderCount/HHI。按 periodEnd 升序。
 */
export function aggregatePeriods(
  holdings: FilerHolding[],
  windowDays = FILING_WINDOW_DAYS,
): PeriodAgg[] {
  // periodEnd → filerCik → 该 filer 窗口内最新 filing
  const byPeriod = new Map<string, Map<string, FilerHolding>>();
  for (const h of holdings) {
    const cutoff = addDaysIso(h.periodEndIso, windowDays);
    if (h.filedAtIso > cutoff) continue; // 超窗口（远期重述）不计
    let filers = byPeriod.get(h.periodEndIso);
    if (!filers) {
      filers = new Map();
      byPeriod.set(h.periodEndIso, filers);
    }
    const cur = filers.get(h.filerCik);
    if (!cur || h.filedAtIso > cur.filedAtIso) filers.set(h.filerCik, h);
  }

  const out: PeriodAgg[] = [];
  for (const [periodEndIso, filers] of byPeriod) {
    let totalShares = 0;
    let totalValue = 0;
    let holderCount = 0;
    const shareList: number[] = [];
    for (const h of filers.values()) {
      if (h.shares > 0) {
        totalShares += h.shares;
        holderCount++;
        shareList.push(h.shares);
      }
      totalValue += h.value;
    }
    let hhi = 0;
    if (totalShares > 0) {
      for (const s of shareList) {
        const w = s / totalShares;
        hhi += w * w;
      }
    }
    out.push({
      periodEndIso,
      visibilityIso: addDaysIso(periodEndIso, windowDays),
      totalShares,
      totalValue,
      holderCount,
      hhi,
    });
  }
  out.sort((a, b) => a.periodEndIso.localeCompare(b.periodEndIso));
  return out;
}

/** 因子键（供 registry / 覆盖率报表引用） */
export const FUNDING_FACTOR_KEYS = [
  "instOwnershipPct",
  "instOwnershipChgQoQ",
  "instHolderCount",
  "instConcentration",
] as const;

/**
 * 单 symbol 在 T 的资金面因子。periods 为该 symbol 的逐期聚合（aggregatePeriods 产物）。
 * sharesOutstanding 为 T 可见的现刻度股本（占比分母，缺则不出占比类因子）。
 */
export function computeFundingFactors(
  periods: PeriodAgg[],
  tIso: string,
  sharesOutstanding: number | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (k: string, x: number | null) => {
    if (x != null && Number.isFinite(x)) out[k] = x;
  };

  // T 可见的最新期 + 上一可见期
  const visible = periods.filter((p) => p.visibilityIso <= tIso);
  if (!visible.length) return out;
  const cur = visible[visible.length - 1]!;
  const prev = visible.length >= 2 ? visible[visible.length - 2]! : null;

  put("instHolderCount", cur.holderCount > 0 ? cur.holderCount : null);
  put("instConcentration", cur.holderCount > 0 ? cur.hhi : null);
  if (sharesOutstanding != null && sharesOutstanding > 0 && cur.totalShares > 0) {
    put("instOwnershipPct", cur.totalShares / sharesOutstanding);
  }
  if (prev && prev.totalShares > 0 && cur.totalShares > 0) {
    put("instOwnershipChgQoQ", cur.totalShares / prev.totalShares - 1);
  }
  return out;
}
