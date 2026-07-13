/**
 * 衍生财务比率层（Bloomberg FA / Wind F9 风格）。
 * 输入为已落库的季度快照（升序），全部读取时计算，不落库。
 * TTM 比率用「滚动 4 季流量 / 期间平均时点值」口径（平均取本季与 4 季前两点均值）。
 */

import type { QuarterFundamentalRow } from "@/lib/equity/ttm";

export type QuarterRatioPoint = {
  period: string;
  fiscalDate: string;
  /** TTM 净资产收益率 = TTM 净利 / 平均股东权益 */
  roeTtm: number | null;
  /** TTM 总资产收益率 = TTM 净利 / 平均总资产 */
  roaTtm: number | null;
  /** 杜邦①：TTM 净利率 */
  netMarginTtm: number | null;
  /** 杜邦②：总资产周转率 = TTM 营收 / 平均总资产 */
  assetTurnoverTtm: number | null;
  /** 杜邦③：权益乘数 = 平均总资产 / 平均股东权益 */
  equityMultiplier: number | null;
  /** 资产负债率 = 总负债 / 总资产（期末） */
  debtRatio: number | null;
  /** 净债务 = 长期债务 − 现金（期末；金融公司口径意义有限） */
  netDebt: number | null;
  /** TTM 派息率 = TTM 分红 / TTM 净利 */
  payoutRatioTtm: number | null;
  /** 近 4 季净回购率 = (4 季前股本 − 当前股本) / 4 季前股本 */
  buybackRate: number | null;
  /** 每股净资产 = 股东权益 / 流通股本（期末） */
  bvps: number | null;
  /** TTM 每股自由现金流 */
  fcfPerShareTtm: number | null;
  /** TTM EPS（滚动 4 季求和） */
  epsTtm: number | null;
};

function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0 || !Number.isFinite(num) || !Number.isFinite(den)) {
    return null;
  }
  return num / den;
}

function sumWindow(
  rows: QuarterFundamentalRow[],
  end: number,
  sel: (r: QuarterFundamentalRow) => number | null,
): number | null {
  if (end < 3) return null;
  let acc = 0;
  for (let i = end - 3; i <= end; i++) {
    const v = sel(rows[i]!);
    if (v == null || !Number.isFinite(v)) return null;
    acc += v;
  }
  return acc;
}

/** 期间平均：本季末与 4 季前季末两点均值（Wind 口径），4 季前缺失时退化为期末值 */
function avgWindow(
  rows: QuarterFundamentalRow[],
  end: number,
  sel: (r: QuarterFundamentalRow) => number | null,
): number | null {
  const curr = sel(rows[end]!);
  if (curr == null) return null;
  const prev = end >= 4 ? sel(rows[end - 4]!) : null;
  return prev == null ? curr : (curr + prev) / 2;
}

/** 逐季比率序列（与输入等长，前 3 季 TTM 类指标为 null） */
export function computeQuarterRatios(quarters: QuarterFundamentalRow[]): QuarterRatioPoint[] {
  const rows = [...quarters].sort((a, b) => a.fiscalDate.localeCompare(b.fiscalDate));

  return rows.map((r, i) => {
    const niTtm = sumWindow(rows, i, (x) => x.netIncome);
    const revTtm = sumWindow(rows, i, (x) => x.revenue);
    const ocfTtm = sumWindow(rows, i, (x) => x.ocf);
    const capexTtm = sumWindow(rows, i, (x) => x.capex);
    const divTtm = sumWindow(rows, i, (x) => x.dividendsPaid);
    const avgEquity = avgWindow(rows, i, (x) => x.equity);
    const avgAssets = avgWindow(rows, i, (x) => x.totalAssets);
    const fcfTtm = ocfTtm != null && capexTtm != null ? ocfTtm - capexTtm : null;
    const sharesPrev = i >= 4 ? rows[i - 4]!.sharesOutstanding : null;

    return {
      period: r.period,
      fiscalDate: r.fiscalDate,
      roeTtm: avgEquity != null && avgEquity > 0 ? ratio(niTtm, avgEquity) : null,
      roaTtm: avgAssets != null && avgAssets > 0 ? ratio(niTtm, avgAssets) : null,
      netMarginTtm: ratio(niTtm, revTtm),
      assetTurnoverTtm: avgAssets != null && avgAssets > 0 ? ratio(revTtm, avgAssets) : null,
      equityMultiplier:
        avgEquity != null && avgEquity > 0 && avgAssets != null ? avgAssets / avgEquity : null,
      debtRatio: ratio(r.totalLiabilities, r.totalAssets),
      netDebt: r.longTermDebt != null || r.cash != null ? (r.longTermDebt ?? 0) - (r.cash ?? 0) : null,
      payoutRatioTtm:
        niTtm != null && niTtm > 0 && divTtm != null ? Math.abs(divTtm) / niTtm : null,
      buybackRate:
        sharesPrev != null && sharesPrev > 0 && r.sharesOutstanding != null
          ? (sharesPrev - r.sharesOutstanding) / sharesPrev
          : null,
      bvps:
        r.sharesOutstanding != null && r.sharesOutstanding > 0
          ? ratio(r.equity, r.sharesOutstanding)
          : null,
      fcfPerShareTtm:
        r.sharesOutstanding != null && r.sharesOutstanding > 0
          ? ratio(fcfTtm, r.sharesOutstanding)
          : null,
      epsTtm: sumWindow(rows, i, (x) => x.eps),
    };
  });
}

export type FiscalYearRow = QuarterFundamentalRow & {
  /** 组内季度标签（升序） */
  quarterPeriods: string[];
  revenueYoY: number | null;
  grossMargin: number | null;
  opMargin: number | null;
  epsYoY: number | null;
};

type QuarterWithMargins = QuarterFundamentalRow & {
  grossMargin?: number | null;
  opMargin?: number | null;
  /** 财季位置 1–4（10-K 锚定）；存在时年度分组按 FQ4 对齐公司真实财年 */
  fiscalQuarter?: number | null;
};

const DAY_MS = 86_400_000;

function spanDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function sumOrNull(
  rows: QuarterWithMargins[],
  sel: (r: QuarterWithMargins) => number | null | undefined,
): number | null {
  let acc = 0;
  for (const r of rows) {
    const v = sel(r);
    if (v == null || !Number.isFinite(v)) return null;
    acc += v;
  }
  return acc;
}

/**
 * 季度 → 财年视角：优先按 FQ4（10-K 锚定）对齐公司真实财年分组；
 * 无财季位置信息时退化为「从最新季往回每 4 季一组」（滚动口径）。
 * 流量求和、时点取组内末季、毛利/营业利润率按加权（金额/营收和）重算。
 * period 标记为财年末所在年份，如 "FY2025"（与公司年报命名一致）。
 */
export function aggregateFiscalYears(quarters: QuarterWithMargins[]): FiscalYearRow[] {
  const rows = [...quarters].sort((a, b) => a.fiscalDate.localeCompare(b.fiscalDate));
  const groups: QuarterWithMargins[][] = [];

  const q4Indices = rows
    .map((r, i) => (r.fiscalQuarter === 4 ? i : -1))
    .filter((i) => i >= 3);
  if (q4Indices.length) {
    for (const end of q4Indices) {
      const g = rows.slice(end - 3, end + 1);
      const span = spanDays(g[0]!.fiscalDate, g[3]!.fiscalDate);
      if (span < 240 || span > 300) continue; // 组内断档，跳过该财年
      groups.push(g);
    }
  } else {
    for (let end = rows.length - 1; end >= 3; end -= 4) {
      const g = rows.slice(end - 3, end + 1);
      const span = spanDays(g[0]!.fiscalDate, g[3]!.fiscalDate);
      if (span < 240 || span > 300) break; // 断档：更早的组不再可靠
      groups.unshift(g);
    }
  }

  const out: FiscalYearRow[] = groups.map((g) => {
    const last = g[3]!;
    const revenue = sumOrNull(g, (r) => r.revenue);
    const grossAmt = sumOrNull(g, (r) =>
      r.grossMargin != null && r.revenue != null ? r.grossMargin * r.revenue : null,
    );
    const opAmt = sumOrNull(g, (r) =>
      r.opMargin != null && r.revenue != null ? r.opMargin * r.revenue : null,
    );
    const ocf = sumOrNull(g, (r) => r.ocf);
    const capex = sumOrNull(g, (r) => r.capex);
    return {
      period: `FY${last.fiscalDate.slice(0, 4)}`,
      fiscalDate: last.fiscalDate,
      quarterPeriods: g.map((r) => r.period),
      revenue,
      revenueYoY: null,
      grossMargin: revenue != null && revenue !== 0 && grossAmt != null ? grossAmt / revenue : null,
      opMargin: revenue != null && revenue !== 0 && opAmt != null ? opAmt / revenue : null,
      netIncome: sumOrNull(g, (r) => r.netIncome),
      eps: sumOrNull(g, (r) => r.eps),
      epsYoY: null,
      ocf,
      capex,
      dividendsPaid: sumOrNull(g, (r) => r.dividendsPaid),
      totalAssets: last.totalAssets,
      totalLiabilities: last.totalLiabilities,
      equity: last.equity,
      longTermDebt: last.longTermDebt,
      cash: last.cash,
      sharesOutstanding: last.sharesOutstanding,
    };
  });

  for (let i = 1; i < out.length; i++) {
    const curr = out[i]!;
    const prev = out[i - 1]!;
    curr.revenueYoY =
      curr.revenue != null && prev.revenue != null && prev.revenue !== 0
        ? curr.revenue / prev.revenue - 1
        : null;
    curr.epsYoY =
      curr.eps != null && prev.eps != null && prev.eps !== 0 ? curr.eps / prev.eps - 1 : null;
  }
  return out;
}
