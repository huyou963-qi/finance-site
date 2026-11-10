/**
 * 基本面概览「七个维度」图表规格（纯函数，读时计算，不落库）。
 *
 * 维度：① 增长 ② 盈利能力 ③ 利润质量 ④ 现金流 ⑤ 资产负债 ⑥ 运营效率 ⑦ 估值。
 * ①–⑥ 由本模块按季度报表生成；⑦ 估值是日频时间轴，仍由 valuationHistory 计算。
 * 银行 / 保险 / 券商 / REIT 按 detectStatementProfile 判定的披露格式换成行业指标，
 * 只用公司财报里实际披露的科目；不良率、资本充足率、出租率等监管或经营口径不在财报里，不做推算。
 *
 * 口径：
 * - TTM = 连续 4 季求和，4 季跨度须 240–300 天，否则视为断档留空；
 * - 期间平均余额 = 本季末与 4 季前季末两点均值（与 fundamentalRatios 一致）；
 * - 同比 = 与约一年前（330–400 天）的季度相比，季度断档时留空。
 */

import type { QuarterFundamentalRow } from "./ttm";
import { detectStatementProfile, type StatementLines, type StatementProfile } from "./statementTemplate";

export type DimensionId = "growth" | "profitability" | "quality" | "cashflow" | "balance" | "efficiency";

/** 数值单位：决定坐标轴与 tooltip 格式 */
export type DimensionUnit = "money" | "pct" | "signedPct" | "multiple" | "days";

export type DimensionSeries = {
  name: string;
  type: "bar" | "line";
  /** 0 = 左轴，1 = 右轴 */
  axis: 0 | 1;
  unit: DimensionUnit;
  data: (number | null)[];
  color: string;
  dashed?: boolean;
  /** 同名 stack 的柱堆叠显示 */
  stack?: string;
  /** 默认在图例中关闭（量级差太多会压扁其他线，需要时点开） */
  hidden?: boolean;
  /** 展示区间内同比超过 ±300% 时默认收起（见 isSeriesHiddenByDefault） */
  hideWhenExtreme?: boolean;
};

export type DimensionChart = {
  id: DimensionId;
  /** 维度序号 1–6（7 = 估值，不在本模块） */
  index: number;
  title: string;
  /** 口径说明（tooltip / 副标题） */
  note?: string;
  series: DimensionSeries[];
};

export type OverviewQuarter = QuarterFundamentalRow & {
  revenueYoY?: number | null;
  epsYoY?: number | null;
  grossMargin?: number | null;
  opMargin?: number | null;
  lines?: StatementLines;
};

/** Q = 逐季（TTM 为滚动 4 季）；FY = 逐财年（每行即全年，同比取上一行） */
export type OverviewFrequency = "Q" | "FY";

export type OverviewDimensions = {
  profile: StatementProfile;
  frequency: OverviewFrequency;
  periods: string[];
  charts: DimensionChart[];
};

const C = {
  blue: "#4c8dff",
  yellow: "#f2c94c",
  green: "#3ecf8e",
  red: "#ef6461",
  purple: "#a78bfa",
  cyan: "#38bdf8",
  orange: "#fb923c",
  gray: "#9da8b6",
} as const;

const DAY_MS = 86_400_000;

function days(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function div(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den === 0 || !Number.isFinite(num) || !Number.isFinite(den)) return null;
  return num / den;
}

/** 正分母才有意义的比率（权益、资产、营收为负时留空） */
function divPos(num: number | null | undefined, den: number | null | undefined): number | null {
  return den != null && den > 0 ? div(num, den) : null;
}

function sumKnown(...vals: (number | null | undefined)[]): number | null {
  let acc = 0;
  let any = false;
  for (const v of vals) {
    if (v == null || !Number.isFinite(v)) continue;
    acc += v;
    any = true;
  }
  return any ? acc : null;
}

type Sel = (q: OverviewQuarter) => number | null | undefined;

/** 季度 / 财年序列上的时间窗工具 */
class QuarterSeries {
  readonly rows: OverviewQuarter[];
  readonly frequency: OverviewFrequency;

  constructor(quarters: readonly OverviewQuarter[], frequency: OverviewFrequency = "Q") {
    this.rows = [...quarters].sort((a, b) => a.fiscalDate.localeCompare(b.fiscalDate));
    this.frequency = frequency;
  }

  line(q: OverviewQuarter, code: string): number | null {
    const v = q.lines?.[code];
    return v != null && Number.isFinite(v) ? v : null;
  }

  /** 约一年前的下标（季度 4 行前 / 财年 1 行前，且相隔 330–400 天），否则 null */
  yearAgo(i: number): number | null {
    const lag = this.frequency === "FY" ? 1 : 4;
    if (i < lag) return null;
    const d = days(this.rows[i - lag]!.fiscalDate, this.rows[i]!.fiscalDate);
    return d >= 330 && d <= 400 ? i - lag : null;
  }

  /** 全年合计：季度为滚动 4 季，财年即本行 */
  ttm(i: number, sel: Sel): number | null {
    if (this.frequency === "FY") {
      const v = sel(this.rows[i]!);
      return v != null && Number.isFinite(v) ? v : null;
    }
    if (i < 3) return null;
    const span = days(this.rows[i - 3]!.fiscalDate, this.rows[i]!.fiscalDate);
    if (span < 240 || span > 300) return null;
    let acc = 0;
    for (let k = i - 3; k <= i; k++) {
      const v = sel(this.rows[k]!);
      if (v == null || !Number.isFinite(v)) return null;
      acc += v;
    }
    return acc;
  }

  avg(i: number, sel: Sel): number | null {
    const curr = sel(this.rows[i]!);
    if (curr == null || !Number.isFinite(curr)) return null;
    const j = this.yearAgo(i);
    const prev = j == null ? null : sel(this.rows[j]!);
    return prev == null || !Number.isFinite(prev) ? curr : (curr + prev) / 2;
  }

  yoy(i: number, sel: Sel): number | null {
    const j = this.yearAgo(i);
    if (j == null) return null;
    const curr = sel(this.rows[i]!);
    const prev = sel(this.rows[j]!);
    if (curr == null || prev == null || prev <= 0) return null;
    return curr / prev - 1;
  }

  map(fn: (q: OverviewQuarter, i: number) => number | null | undefined): (number | null)[] {
    return this.rows.map((q, i) => {
      const v = fn(q, i);
      return v != null && Number.isFinite(v) ? v : null;
    });
  }
}

// ---------------------------------------------------------------------------
// 共用科目口径
// ---------------------------------------------------------------------------

function costOfRevenue(s: QuarterSeries, q: OverviewQuarter): number | null {
  const direct = s.line(q, "costOfRevenue");
  if (direct != null) return direct;
  const gp = s.line(q, "grossProfit");
  if (q.revenue != null && gp != null) return q.revenue - gp;
  if (q.revenue != null && q.grossMargin != null) return q.revenue * (1 - q.grossMargin);
  return null;
}

function depreciation(s: QuarterSeries, q: OverviewQuarter): number | null {
  return s.line(q, "depreciationAmortization") ?? s.line(q, "depreciationAmortizationIs");
}

/** 营业利润；不列营业利润小计的公司（能源、REIT 常见）退化为 EBIT = 税前利润 + 利息费用 */
function operatingIncome(s: QuarterSeries, q: OverviewQuarter): number | null {
  const direct = s.line(q, "operatingIncome");
  if (direct != null) return direct;
  if (q.revenue != null && q.opMargin != null) return q.revenue * q.opMargin;
  const pretax = s.line(q, "pretaxIncome");
  const interest = s.line(q, "interestExpense");
  return pretax != null && interest != null ? pretax + Math.abs(interest) : null;
}

/**
 * 有息负债 = 长期债务 + 一年内到期 + 短期借款。
 * 长期债务缺失时整体留空：只剩短期部分会把高负债公司算成净现金（例：REIT 的优先票据未抽取到）。
 */
function totalDebt(s: QuarterSeries, q: OverviewQuarter): number | null {
  if (q.longTermDebt == null) return null;
  return q.longTermDebt + (s.line(q, "currentDebt") ?? 0) + (s.line(q, "shortTermBorrowings") ?? 0);
}

/** 净负债 = 有息负债 − 现金 − 短期投资（为负即净现金） */
function netDebt(s: QuarterSeries, q: OverviewQuarter): number | null {
  const debt = totalDebt(s, q);
  if (debt == null) return null;
  return debt - (q.cash ?? 0) - (s.line(q, "shortTermInvestments") ?? 0);
}

/** 股东回报 = 分红 + 回购（XBRL 符号不统一，一律取绝对值） */
function shareholderReturn(q: OverviewQuarter): number | null {
  if (q.dividendsPaid == null && q.buybackPaid == null) return null;
  return Math.abs(q.dividendsPaid ?? 0) + Math.abs(q.buybackPaid ?? 0);
}

/** 毛利率；不列毛利润的公司（AMZN、WMT、GOOGL）用营收与营业成本推出 */
function grossMarginOf(s: QuarterSeries, q: OverviewQuarter): number | null {
  if (q.grossMargin != null) return q.grossMargin;
  const cost = s.line(q, "costOfRevenue");
  return cost != null && q.revenue != null ? divPos(q.revenue - cost, q.revenue) : null;
}

function netMargin(q: OverviewQuarter): number | null {
  return divPos(q.netIncome, q.revenue);
}

/**
 * FFO（近似，NAREIT 口径的简化）= 净利润 + 折旧摊销 − 投资损益。
 * 财报科目里没有单列「出售房地产收益」，用投资损益近似扣除。
 */
export function ffoOf(q: OverviewQuarter): number | null {
  if (q.netIncome == null) return null;
  const da = q.lines?.depreciationAmortization ?? q.lines?.depreciationAmortizationIs;
  if (da == null) return null;
  return q.netIncome + da - (q.lines?.investmentGains ?? 0);
}

/** 逐季 TTM 每股 FFO（REIT 估值带用，与输入同序：按 fiscalDate 升序） */
export function computeFfoPerShareTtm(
  quarters: readonly OverviewQuarter[],
  frequency: OverviewFrequency = "Q",
): { fiscalDate: string; ffoPerShareTtm: number | null }[] {
  const s = new QuarterSeries(quarters, frequency);
  return s.rows.map((q, i) => ({
    fiscalDate: q.fiscalDate,
    ffoPerShareTtm: divPos(s.ttm(i, ffoOf), q.sharesOutstanding),
  }));
}

// ---------------------------------------------------------------------------
// 各维度（一般企业）
// ---------------------------------------------------------------------------

/** 同比超过 ±300% 的系列默认收起：基数接近零时（扭亏、低基数）会把其余增速线压平 */
const YOY_HIDE_THRESHOLD = 3;

/**
 * 图例里是否默认关闭。必须用「当前展示区间」的数据判断（传入已截取的系列）：
 * 用全量历史判断时，区间外的一次扭亏尖峰会让近 5 年都正常的增速线被收起。
 */
export function isSeriesHiddenByDefault(ser: DimensionSeries): boolean {
  if (ser.hidden) return true;
  return !!ser.hideWhenExtreme && ser.data.some((v) => v != null && Math.abs(v) > YOY_HIDE_THRESHOLD);
}

/** @param includeEps REIT 传 false：折旧大、EPS 基数小，同比动辄上千 %，改看每股 FFO */
function growthChart(s: QuarterSeries, extra: DimensionSeries[] = [], includeEps = true): DimensionChart {
  const chart = growthChartRaw(s, extra, includeEps);
  // 营收增速是主线，不收起
  return {
    ...chart,
    series: chart.series.map((ser) =>
      ser.name === "营收 YoY" || ser.type === "bar" ? ser : { ...ser, hideWhenExtreme: true },
    ),
  };
}

function growthChartRaw(s: QuarterSeries, extra: DimensionSeries[], includeEps: boolean): DimensionChart {
  return {
    id: "growth",
    index: 1,
    title: "增长",
    note: "单季营收；同比与上年同季比较",
    series: [
      { name: "营收", type: "bar", axis: 0, unit: "money", color: C.blue, data: s.map((q) => q.revenue) },
      {
        name: "营收 YoY",
        type: "line",
        axis: 1,
        unit: "signedPct",
        color: C.yellow,
        data: s.map((q, i) => (q.revenueYoY !== undefined ? q.revenueYoY : s.yoy(i, (x) => x.revenue))),
      },
      ...extra,
      ...(includeEps ? [{
        name: "EPS YoY",
        type: "line",
        axis: 1,
        unit: "signedPct",
        color: C.green,
        dashed: true,
        data: s.map((q, i) => (q.epsYoY !== undefined ? q.epsYoY : s.yoy(i, (x) => x.eps))),
      } satisfies DimensionSeries] : []),
    ],
  };
}

function roeSeries(s: QuarterSeries, color: string = C.purple): DimensionSeries {
  return {
    name: "ROE (TTM)",
    type: "line",
    axis: 0,
    unit: "pct",
    color,
    data: s.map((_q, i) => divPos(s.ttm(i, (x) => x.netIncome), s.avg(i, (x) => x.equity))),
  };
}

function equityMultiplierSeries(s: QuarterSeries): DimensionSeries {
  return {
    name: "权益乘数",
    type: "line",
    axis: 1,
    unit: "multiple",
    color: C.gray,
    dashed: true,
    data: s.map((_q, i) => {
      const eq = s.avg(i, (x) => x.equity);
      return eq != null && eq > 0 ? div(s.avg(i, (x) => x.totalAssets), eq) : null;
    }),
  };
}

function generalProfitability(s: QuarterSeries): DimensionChart {
  return {
    id: "profitability",
    index: 2,
    title: "盈利能力",
    note: "单季利润率；ROE 与权益乘数为 TTM（杜邦：ROE = 净利率 × 资产周转 × 权益乘数）",
    series: [
      { name: "毛利率", type: "line", axis: 0, unit: "pct", color: C.blue, data: s.map((q) => grossMarginOf(s, q)) },
      { name: "营业利润率", type: "line", axis: 0, unit: "pct", color: C.yellow, data: s.map((q) => q.opMargin ?? null) },
      { name: "净利率", type: "line", axis: 0, unit: "pct", color: C.green, data: s.map(netMargin) },
      roeSeries(s),
      equityMultiplierSeries(s),
    ],
  };
}

function generalQuality(s: QuarterSeries): DimensionChart {
  const gap = (sel: Sel) =>
    s.map((_q, i) => {
      const g = s.yoy(i, sel);
      const r = s.yoy(i, (x) => x.revenue);
      return g != null && r != null ? g - r : null;
    });
  return {
    id: "quality",
    index: 3,
    title: "利润质量",
    note: "现金含量 = TTM 经营现金流 / TTM 净利润，长期低于 1 需警惕；增速差 > 0 表示应收或存货比营收涨得快",
    series: [
      {
        name: "现金含量 (TTM)",
        type: "line",
        axis: 0,
        unit: "multiple",
        color: C.blue,
        data: s.map((_q, i) => divPos(s.ttm(i, (x) => x.ocf), s.ttm(i, (x) => x.netIncome))),
      },
      {
        name: "应收增速 − 营收增速",
        type: "bar",
        axis: 1,
        unit: "signedPct",
        color: C.yellow,
        data: gap((q) => s.line(q, "accountsReceivable")),
      },
      {
        name: "存货增速 − 营收增速",
        type: "bar",
        axis: 1,
        unit: "signedPct",
        color: C.orange,
        data: gap((q) => s.line(q, "inventory")),
      },
    ],
  };
}

function generalCashflow(s: QuarterSeries): DimensionChart {
  return {
    id: "cashflow",
    index: 4,
    title: "现金流与股东回报",
    note: "单季金额，资本开支取负向展示；覆盖率 = TTM 自由现金流 / TTM（分红 + 回购）",
    series: [
      { name: "经营现金流", type: "bar", axis: 0, unit: "money", color: C.blue, data: s.map((q) => q.ocf) },
      {
        name: "资本开支",
        type: "bar",
        axis: 0,
        unit: "money",
        color: C.red,
        data: s.map((q) => (q.capex == null ? null : -Math.abs(q.capex))),
      },
      {
        name: "自由现金流",
        type: "bar",
        axis: 0,
        unit: "money",
        color: C.green,
        data: s.map((q) => (q.ocf != null && q.capex != null ? q.ocf - Math.abs(q.capex) : null)),
      },
      { name: "分红 + 回购", type: "bar", axis: 0, unit: "money", color: C.purple, data: s.map(shareholderReturn) },
      {
        name: "回报覆盖率 (TTM)",
        type: "line",
        axis: 1,
        unit: "multiple",
        color: C.yellow,
        data: s.map((_q, i) => {
          const fcf = s.ttm(i, (x) => (x.ocf != null && x.capex != null ? x.ocf - Math.abs(x.capex) : null));
          return divPos(fcf, s.ttm(i, shareholderReturn));
        }),
      },
    ],
  };
}

function ebitdaTtm(s: QuarterSeries, i: number): number | null {
  const oi = s.ttm(i, (x) => operatingIncome(s, x));
  const da = s.ttm(i, (x) => depreciation(s, x));
  return oi != null && da != null ? oi + da : null;
}

function goodwillToEquity(s: QuarterSeries): DimensionSeries {
  return {
    name: "商誉+无形 / 净资产",
    type: "line",
    axis: 1,
    unit: "pct",
    color: C.orange,
    dashed: true,
    data: s.map((q) => {
      const gw = sumKnown(s.line(q, "goodwill"), s.line(q, "intangibleAssets"));
      return gw == null ? null : divPos(gw, q.equity);
    }),
  };
}

function netDebtToEbitda(s: QuarterSeries): DimensionSeries {
  return {
    name: "净负债 / EBITDA",
    type: "line",
    axis: 0,
    unit: "multiple",
    color: C.blue,
    data: s.map((q, i) => divPos(netDebt(s, q), ebitdaTtm(s, i))),
  };
}

function generalBalance(s: QuarterSeries): DimensionChart {
  return {
    id: "balance",
    index: 5,
    title: "资产负债",
    note: "净负债 = 有息负债 − 现金 − 短期投资（负值为净现金）；EBITDA、利息覆盖为 TTM",
    series: [
      netDebtToEbitda(s),
      {
        name: "流动比率",
        type: "line",
        axis: 0,
        unit: "multiple",
        color: C.green,
        data: s.map((q) => divPos(s.line(q, "currentAssets"), s.line(q, "currentLiabilities"))),
      },
      {
        name: "利息覆盖倍数",
        type: "line",
        axis: 0,
        unit: "multiple",
        color: C.cyan,
        hidden: true,
        data: s.map((_q, i) =>
          divPos(
            s.ttm(i, (x) => operatingIncome(s, x)),
            s.ttm(i, (x) => {
              const v = s.line(x, "interestExpense");
              return v == null ? null : Math.abs(v);
            }),
          ),
        ),
      },
      goodwillToEquity(s),
    ],
  };
}

function generalEfficiency(s: QuarterSeries): DimensionChart {
  const daysOf = (sel: Sel, flow: Sel) =>
    s.map((_q, i) => {
      const f = s.ttm(i, flow);
      const bal = s.avg(i, sel);
      return f != null && f > 0 && bal != null ? (bal / f) * 365 : null;
    });
  const cogs: Sel = (q) => costOfRevenue(s, q);
  const dso = daysOf((q) => s.line(q, "accountsReceivable"), (q) => q.revenue);
  const dio = daysOf((q) => s.line(q, "inventory"), cogs);
  const dpo = daysOf((q) => s.line(q, "accountsPayable"), cogs);
  /** 从未披露存货的公司（软件、服务）存货天数按 0 计入现金转换周期 */
  const noInventory = s.rows.every((q) => s.line(q, "inventory") == null);
  const ccc = s.rows.map((_q, i) => {
    const a = dso[i];
    const b = noInventory ? 0 : dio[i];
    const c = dpo[i];
    return a != null && b != null && c != null ? a + b - c : null;
  });
  return {
    id: "efficiency",
    index: 6,
    title: "运营效率",
    note: "周转天数 = 期间平均余额 / TTM 营收（存货、应付用营业成本）× 365；现金转换周期 = 应收 + 存货 − 应付",
    series: [
      { name: "应收天数", type: "line", axis: 0, unit: "days", color: C.blue, data: dso },
      { name: "存货天数", type: "line", axis: 0, unit: "days", color: C.orange, data: dio },
      { name: "应付天数", type: "line", axis: 0, unit: "days", color: C.red, data: dpo },
      { name: "现金转换周期", type: "line", axis: 0, unit: "days", color: C.green, dashed: true, data: ccc },
      {
        name: "资产周转率 (TTM)",
        type: "line",
        axis: 1,
        unit: "multiple",
        color: C.gray,
        data: s.map((_q, i) => divPos(s.ttm(i, (x) => x.revenue), s.avg(i, (x) => x.totalAssets))),
      },
    ],
  };
}

function shareholderReturnChart(s: QuarterSeries): DimensionChart {
  return {
    id: "cashflow",
    index: 4,
    title: "股东回报",
    note: "金融公司经营现金流含客户资金与交易性资产变动，不反映经营质量，改看分红与回购；总派息率 = TTM（分红 + 回购）/ TTM 净利润",
    series: [
      {
        name: "分红",
        type: "bar",
        axis: 0,
        unit: "money",
        color: C.blue,
        stack: "ret",
        data: s.map((q) => (q.dividendsPaid == null ? null : Math.abs(q.dividendsPaid))),
      },
      {
        name: "回购",
        type: "bar",
        axis: 0,
        unit: "money",
        color: C.purple,
        stack: "ret",
        data: s.map((q) => (q.buybackPaid == null ? null : Math.abs(q.buybackPaid))),
      },
      {
        name: "总派息率 (TTM)",
        type: "line",
        axis: 1,
        unit: "pct",
        color: C.yellow,
        data: s.map((_q, i) => divPos(s.ttm(i, shareholderReturn), s.ttm(i, (x) => x.netIncome))),
      },
    ],
  };
}

function leverageSeries(s: QuarterSeries, axis: 0 | 1 = 0): DimensionSeries {
  return {
    name: "杠杆（总资产 / 权益）",
    type: "line",
    axis,
    unit: "multiple",
    color: C.blue,
    data: s.map((q) => divPos(q.totalAssets, q.equity)),
  };
}

// ---------------------------------------------------------------------------
// 银行
// ---------------------------------------------------------------------------

function bankCharts(s: QuarterSeries): DimensionChart[] {
  const nii: Sel = (q) => s.line(q, "netInterestIncome");
  return [
    growthChart(s, [
      { name: "净利息收入 YoY", type: "line", axis: 1, unit: "signedPct", color: C.cyan, data: s.map((_q, i) => s.yoy(i, nii)) },
    ]),
    {
      id: "profitability",
      index: 2,
      title: "盈利能力",
      note: "净息差（近似）= TTM 净利息收入 / 平均总资产（财报无平均生息资产）；成本收入比 = 非利息支出 / 营收",
      series: [
        {
          name: "净息差（近似）",
          type: "line",
          axis: 1,
          unit: "pct",
          color: C.blue,
          data: s.map((_q, i) => divPos(s.ttm(i, nii), s.avg(i, (x) => x.totalAssets))),
        },
        {
          name: "成本收入比",
          type: "line",
          axis: 0,
          unit: "pct",
          color: C.yellow,
          data: s.map((q) => divPos(s.line(q, "noninterestExpense"), q.revenue)),
        },
        roeSeries(s, C.purple),
        {
          name: "ROA (TTM)",
          type: "line",
          axis: 1,
          unit: "pct",
          color: C.green,
          dashed: true,
          data: s.map((_q, i) => divPos(s.ttm(i, (x) => x.netIncome), s.avg(i, (x) => x.totalAssets))),
        },
      ],
    },
    {
      id: "quality",
      index: 3,
      title: "资产质量",
      note: "信用成本 = TTM 信用损失拨备 / 平均贷款总额；拨贷比 = 贷款损失准备 / 贷款总额。不良率需监管报表，财报未披露",
      series: [
        {
          name: "信用成本 (TTM)",
          type: "line",
          axis: 0,
          unit: "pct",
          color: C.red,
          data: s.map((_q, i) => divPos(s.ttm(i, (x) => s.line(x, "provisionCreditLosses")), s.avg(i, (x) => s.line(x, "loansGross")))),
        },
        {
          name: "拨贷比",
          type: "line",
          axis: 0,
          unit: "pct",
          color: C.blue,
          data: s.map((q) => {
            const allowance = s.line(q, "loanLossAllowance");
            return divPos(allowance == null ? null : Math.abs(allowance), s.line(q, "loansGross"));
          }),
        },
        {
          name: "拨备",
          type: "bar",
          axis: 1,
          unit: "money",
          color: C.orange,
          data: s.map((q) => s.line(q, "provisionCreditLosses")),
        },
      ],
    },
    shareholderReturnChart(s),
    {
      id: "balance",
      index: 5,
      title: "资产负债结构",
      note: "贷存比 = 贷款净额 / 存款；同比与上年同季比较",
      series: [
        {
          name: "贷存比",
          type: "line",
          axis: 0,
          unit: "pct",
          color: C.blue,
          data: s.map((q) => divPos(s.line(q, "loansNet") ?? s.line(q, "loansGross"), s.line(q, "deposits"))),
        },
        {
          name: "权益 / 总资产",
          type: "line",
          axis: 1,
          unit: "pct",
          color: C.green,
          data: s.map((q) => divPos(q.equity, q.totalAssets)),
        },
        {
          name: "贷款 YoY",
          type: "bar",
          axis: 1,
          unit: "signedPct",
          color: C.yellow,
          data: s.map((_q, i) => s.yoy(i, (x) => s.line(x, "loansGross") ?? s.line(x, "loansNet"))),
        },
        {
          name: "存款 YoY",
          type: "bar",
          axis: 1,
          unit: "signedPct",
          color: C.purple,
          data: s.map((_q, i) => s.yoy(i, (x) => s.line(x, "deposits"))),
        },
      ],
    },
    {
      id: "efficiency",
      index: 6,
      title: "收入结构",
      note: "单季净利息收入与非利息收入；非息占比 = 非利息收入 / 营收",
      series: [
        { name: "净利息收入", type: "bar", axis: 0, unit: "money", color: C.blue, stack: "rev", data: s.map(nii) },
        {
          name: "非利息收入",
          type: "bar",
          axis: 0,
          unit: "money",
          color: C.purple,
          stack: "rev",
          data: s.map((q) => s.line(q, "noninterestIncome")),
        },
        {
          name: "非息收入占比",
          type: "line",
          axis: 1,
          unit: "pct",
          color: C.yellow,
          data: s.map((q) => divPos(s.line(q, "noninterestIncome"), q.revenue)),
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// 保险
// ---------------------------------------------------------------------------

function insurerCharts(s: QuarterSeries): DimensionChart[] {
  const earned: Sel = (q) => s.line(q, "premiumsEarned");
  const nii: Sel = (q) => s.line(q, "netInvestmentIncome");
  return [
    growthChart(s, [
      { name: "已赚保费 YoY", type: "line", axis: 1, unit: "signedPct", color: C.cyan, data: s.map((_q, i) => s.yoy(i, earned)) },
    ]),
    {
      id: "profitability",
      index: 2,
      title: "承保盈利",
      note: "赔付率 = 赔付及保单给付 / 已赚保费；获取成本率 = 保单获取成本摊销 / 已赚保费。寿险给付含储蓄型给付，赔付率可高于 100%",
      series: [
        { name: "赔付率", type: "line", axis: 0, unit: "pct", color: C.red, data: s.map((q) => divPos(s.line(q, "policyBenefits"), earned(q))) },
        {
          name: "获取成本率",
          type: "line",
          axis: 0,
          unit: "pct",
          color: C.orange,
          data: s.map((q) => divPos(s.line(q, "acquisitionCostAmortization"), earned(q))),
        },
        { name: "净利率", type: "line", axis: 1, unit: "pct", color: C.green, data: s.map(netMargin) },
        { ...roeSeries(s), axis: 1 },
      ],
    },
    {
      id: "quality",
      index: 3,
      title: "投资端",
      note: "净投资收益率 = TTM 净投资收益 / 平均投资资产",
      series: [
        { name: "净投资收益", type: "bar", axis: 0, unit: "money", color: C.blue, data: s.map(nii) },
        {
          name: "净投资收益率 (TTM)",
          type: "line",
          axis: 1,
          unit: "pct",
          color: C.yellow,
          data: s.map((_q, i) => divPos(s.ttm(i, nii), s.avg(i, (x) => s.line(x, "investments")))),
        },
        {
          name: "投资收益占营收",
          type: "line",
          axis: 1,
          unit: "pct",
          color: C.purple,
          dashed: true,
          data: s.map((q) => divPos(nii(q), q.revenue)),
        },
      ],
    },
    generalCashflow(s),
    {
      id: "balance",
      index: 5,
      title: "资产负债",
      note: "保单负债 / 权益衡量承保杠杆",
      series: [
        leverageSeries(s),
        {
          name: "保单负债 / 权益",
          type: "line",
          axis: 0,
          unit: "multiple",
          color: C.red,
          data: s.map((q) => divPos(sumKnown(s.line(q, "policyLiabilities"), s.line(q, "claimReserves"), s.line(q, "unearnedPremiums")), q.equity)),
        },
        goodwillToEquity(s),
      ],
    },
    {
      id: "efficiency",
      index: 6,
      title: "收入结构",
      note: "单季已赚保费与净投资收益",
      series: [
        { name: "已赚保费", type: "bar", axis: 0, unit: "money", color: C.blue, stack: "rev", data: s.map(earned) },
        { name: "净投资收益", type: "bar", axis: 0, unit: "money", color: C.purple, stack: "rev", data: s.map(nii) },
        {
          name: "保费 YoY",
          type: "line",
          axis: 1,
          unit: "signedPct",
          color: C.yellow,
          data: s.map((_q, i) => s.yoy(i, (x) => s.line(x, "premiumsWritten") ?? earned(x))),
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// 券商
// ---------------------------------------------------------------------------

function brokerCharts(s: QuarterSeries): DimensionChart[] {
  return [
    growthChart(s),
    {
      id: "profitability",
      index: 2,
      title: "盈利能力",
      note: "单季净利率；ROE 与权益乘数为 TTM",
      series: [
        { name: "净利率", type: "line", axis: 0, unit: "pct", color: C.green, data: s.map(netMargin) },
        { name: "税前利润率", type: "line", axis: 0, unit: "pct", color: C.yellow, data: s.map((q) => divPos(s.line(q, "pretaxIncome"), q.revenue)) },
        roeSeries(s),
        equityMultiplierSeries(s),
      ],
    },
    {
      id: "quality",
      index: 3,
      title: "收入结构",
      note: "单季各业务收入；交易类收入波动大，占比越高利润越不稳定",
      series: [
        { name: "佣金及手续费", type: "bar", axis: 0, unit: "money", color: C.blue, stack: "rev", data: s.map((q) => s.line(q, "commissionRevenue")) },
        { name: "投资银行", type: "bar", axis: 0, unit: "money", color: C.purple, stack: "rev", data: s.map((q) => s.line(q, "investmentBankingRevenue")) },
        { name: "自营交易", type: "bar", axis: 0, unit: "money", color: C.orange, stack: "rev", data: s.map((q) => s.line(q, "principalTransactions")) },
        { name: "净利息收入", type: "bar", axis: 0, unit: "money", color: C.green, stack: "rev", data: s.map((q) => s.line(q, "netInterestIncome")) },
      ],
    },
    shareholderReturnChart(s),
    {
      id: "balance",
      index: 5,
      title: "资产负债",
      note: "有形权益 = 权益 − 商誉 − 无形资产",
      series: [
        leverageSeries(s),
        {
          name: "有形权益 / 总资产",
          type: "line",
          axis: 1,
          unit: "pct",
          color: C.green,
          data: s.map((q) =>
            q.equity == null
              ? null
              : divPos(q.equity - (s.line(q, "goodwill") ?? 0) - (s.line(q, "intangibleAssets") ?? 0), q.totalAssets),
          ),
        },
      ],
    },
    {
      id: "efficiency",
      index: 6,
      title: "成本效率",
      note: "薪酬收入比 = 员工薪酬 / 营收；费用收入比 = 营业费用合计 / 营收",
      series: [
        { name: "薪酬收入比", type: "line", axis: 0, unit: "pct", color: C.blue, data: s.map((q) => divPos(s.line(q, "laborExpense"), q.revenue)) },
        {
          name: "费用收入比",
          type: "line",
          axis: 0,
          unit: "pct",
          color: C.yellow,
          data: s.map((q) => divPos(s.line(q, "operatingExpenses") ?? s.line(q, "noninterestExpense") ?? s.line(q, "costsAndExpenses"), q.revenue)),
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// REIT
// ---------------------------------------------------------------------------

function reitCharts(s: QuarterSeries): DimensionChart[] {
  const ffoPerShare = computeFfoPerShareTtm(s.rows, s.frequency);
  return [
    growthChart(s, [
      {
        name: "租赁收入 YoY",
        type: "line",
        axis: 1,
        unit: "signedPct",
        color: C.cyan,
        data: s.map((_q, i) => s.yoy(i, (x) => s.line(x, "rentalRevenue"))),
      },
      {
        name: "每股 FFO YoY (TTM)",
        type: "line",
        axis: 1,
        unit: "signedPct",
        color: C.purple,
        data: s.map((_q, i) => {
          const j = s.yearAgo(i);
          const curr = ffoPerShare[i]!.ffoPerShareTtm;
          const prev = j == null ? null : ffoPerShare[j]!.ffoPerShareTtm;
          return curr != null && prev != null && prev > 0 ? curr / prev - 1 : null;
        }),
      },
    ], false),
    {
      id: "profitability",
      index: 2,
      title: "盈利能力",
      note: "FFO（近似）= 净利润 + 折旧摊销 − 投资损益；REIT 折旧大，净利率低估真实盈利",
      series: [
        { name: "FFO 利润率", type: "line", axis: 0, unit: "pct", color: C.blue, data: s.map((q) => divPos(ffoOf(q), q.revenue)) },
        { name: "净利率", type: "line", axis: 0, unit: "pct", color: C.green, data: s.map(netMargin) },
        roeSeries(s),
      ],
    },
    {
      id: "quality",
      index: 3,
      title: "利润质量",
      note: "单季 FFO 与净利润；现金含量 = TTM 经营现金流 / TTM FFO",
      series: [
        { name: "FFO（近似）", type: "bar", axis: 0, unit: "money", color: C.blue, data: s.map(ffoOf) },
        { name: "净利润", type: "bar", axis: 0, unit: "money", color: C.green, data: s.map((q) => q.netIncome) },
        {
          name: "现金含量 (TTM)",
          type: "line",
          axis: 1,
          unit: "multiple",
          color: C.yellow,
          data: s.map((_q, i) => divPos(s.ttm(i, (x) => x.ocf), s.ttm(i, ffoOf))),
        },
      ],
    },
    {
      id: "cashflow",
      index: 4,
      title: "现金流与分红",
      note: "派息覆盖 = TTM FFO / TTM 分红，低于 1 说明分红超出经营所得",
      series: [
        { name: "经营现金流", type: "bar", axis: 0, unit: "money", color: C.blue, data: s.map((q) => q.ocf) },
        {
          name: "分红",
          type: "bar",
          axis: 0,
          unit: "money",
          color: C.purple,
          data: s.map((q) => (q.dividendsPaid == null ? null : Math.abs(q.dividendsPaid))),
        },
        {
          name: "FFO 派息覆盖 (TTM)",
          type: "line",
          axis: 1,
          unit: "multiple",
          color: C.yellow,
          data: s.map((_q, i) => divPos(s.ttm(i, ffoOf), s.ttm(i, (x) => (x.dividendsPaid == null ? null : Math.abs(x.dividendsPaid))))),
        },
      ],
    },
    {
      id: "balance",
      index: 5,
      title: "资产负债",
      note: "净负债 = 有息负债 − 现金 − 短期投资；EBITDA 为 TTM",
      series: [
        netDebtToEbitda(s),
        {
          name: "资产负债率",
          type: "line",
          axis: 1,
          unit: "pct",
          color: C.orange,
          data: s.map((q) => divPos(q.totalLiabilities, q.totalAssets)),
        },
      ],
    },
    {
      id: "efficiency",
      index: 6,
      title: "资本循环",
      note: "单季购置与开发房地产（流出）及出售房地产回收；出租率不在财报科目内",
      series: [
        {
          name: "购置 + 开发",
          type: "bar",
          axis: 0,
          unit: "money",
          color: C.red,
          data: s.map((q) => {
            const v = sumKnown(s.line(q, "realEstateAcquired"), s.line(q, "realEstateDevelopment"));
            return v == null ? null : -Math.abs(v);
          }),
        },
        {
          name: "出售回收",
          type: "bar",
          axis: 0,
          unit: "money",
          color: C.green,
          data: s.map((q) => {
            const v = s.line(q, "realEstateSold");
            return v == null ? null : Math.abs(v);
          }),
        },
        {
          name: "资产周转率 (TTM)",
          type: "line",
          axis: 1,
          unit: "multiple",
          color: C.gray,
          data: s.map((_q, i) => divPos(s.ttm(i, (x) => x.revenue), s.avg(i, (x) => x.totalAssets))),
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------

function generalCharts(s: QuarterSeries): DimensionChart[] {
  return [
    growthChart(s),
    generalProfitability(s),
    generalQuality(s),
    generalCashflow(s),
    generalBalance(s),
    generalEfficiency(s),
  ];
}

const BUILDERS: Record<StatementProfile, (s: QuarterSeries) => DimensionChart[]> = {
  general: generalCharts,
  bank: bankCharts,
  insurer: insurerCharts,
  broker: brokerCharts,
  reit: reitCharts,
};

/**
 * 概览用的报表格式：在 detectStatementProfile 基础上再确认一次，单个科目误判时退回一般企业。
 * 实测误判：ADM（粮商）因一个映射错的「未决赔款准备」、WM（垃圾处理）因自保准备金被判成保险；
 * SUN（燃料分销）因「应收客户款」被判成券商。概览按行业换图，误判比报表页排序的代价大。
 */
export function chooseOverviewProfile(rows: readonly OverviewQuarter[]): StatementProfile {
  const detected = detectStatementProfile(rows);
  const recent = rows.slice(-8);
  const has = (...codes: string[]) => recent.some((r) => codes.some((c) => r.lines?.[c] != null));
  if (detected === "insurer") {
    const policyLines = has("premiumsEarned", "premiumsWritten", "policyBenefits", "deferredAcquisitionCosts", "policyholderDeposits");
    // 只有赔款准备时再排除有存货或营业成本的公司（WM 的自保准备金、ADM 的误映射）
    return policyLines || (has("claimReserves") && !has("inventory", "costOfRevenue")) ? "insurer" : "general";
  }
  if (detected === "broker") {
    return has("segregatedCash", "receivablesFromBrokers", "securitiesBorrowed") ? "broker" : "general";
  }
  return detected;
}

/**
 * 某报表格式下应有的全部系列（"序号.维度 / 系列名"），不论有无数据。
 * buildOverviewDimensions 会丢掉全空系列，覆盖率自检靠它找回缺了哪些。
 */
export function dimensionBlueprint(profile: StatementProfile): string[] {
  return BUILDERS[profile](new QuarterSeries([])).flatMap((c) =>
    c.series.map((s) => `${c.index}.${c.title} / ${s.name}`),
  );
}

/** 至少一个系列有数值 */
export function chartHasData(chart: DimensionChart): boolean {
  return chart.series.some((ser) => ser.data.some((v) => v != null));
}

/** 年度视图下文案去掉 TTM / 单季字样（每行本身就是全年） */
function annualLabel(text: string): string {
  return text.replace(/ \(TTM\)/g, "").replace(/TTM ?/g, "全年").replace(/单季/g, "年度");
}

export function buildOverviewDimensions(
  rows: readonly OverviewQuarter[],
  profile: StatementProfile,
  frequency: OverviewFrequency = "Q",
): OverviewDimensions {
  const s = new QuarterSeries(rows, frequency);
  const charts = BUILDERS[profile](s).map((chart) => {
    // 整条为空的系列不进图例，避免出现点不亮的条目
    const series = chart.series.filter((ser) => ser.data.some((v) => v != null));
    if (frequency === "Q") return { ...chart, series };
    return {
      ...chart,
      note: chart.note ? annualLabel(chart.note) : chart.note,
      series: series.map((ser) => ({ ...ser, name: annualLabel(ser.name) })),
    };
  });
  return { profile, frequency, periods: s.rows.map((q) => q.period), charts };
}

/**
 * 截取展示区间 [start, end]（下标，含两端）。
 * 先在全量序列上算好 TTM / 同比再截，区间第一期的同比、滚动值才不会因缺上文而留空。
 */
export function sliceOverviewDimensions(d: OverviewDimensions, start: number, end: number): OverviewDimensions {
  const lo = Math.max(0, start);
  const hi = Math.min(d.periods.length - 1, end);
  return {
    ...d,
    periods: d.periods.slice(lo, hi + 1),
    charts: d.charts.map((c) => ({
      ...c,
      series: c.series
        .map((ser) => ({ ...ser, data: ser.data.slice(lo, hi + 1) }))
        .filter((ser) => ser.data.some((v) => v != null)),
    })),
  };
}
