import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOverviewDimensions,
  computeFfoPerShareTtm,
  chooseOverviewProfile,
  dimensionBlueprint,
  sliceOverviewDimensions,
  ffoOf,
  type DimensionChart,
  type OverviewQuarter,
} from "./overviewDimensions";

const QUARTER_ENDS = [
  "2023-03-31", "2023-06-30", "2023-09-30", "2023-12-31",
  "2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31",
];

function q(i: number, over: Partial<OverviewQuarter> = {}): OverviewQuarter {
  const date = QUARTER_ENDS[i]!;
  return {
    period: `${date.slice(0, 4)}Q${Math.floor(Number(date.slice(5, 7)) / 3)}`,
    fiscalDate: date,
    revenue: 100,
    netIncome: 10,
    eps: 1,
    ocf: 15,
    capex: 5,
    dividendsPaid: -3,
    buybackPaid: -2,
    totalAssets: 400,
    totalLiabilities: 250,
    equity: 200,
    longTermDebt: 80,
    cash: 30,
    sharesOutstanding: 10,
    grossMargin: 0.4,
    opMargin: 0.2,
    lines: {
      accountsReceivable: 50,
      inventory: 40,
      accountsPayable: 30,
      costOfRevenue: 60,
      operatingIncome: 20,
      depreciationAmortization: 5,
      interestExpense: 2,
      currentAssets: 150,
      currentLiabilities: 100,
      goodwill: 20,
      intangibleAssets: 10,
      shortTermInvestments: 0,
    },
    ...over,
  };
}

function series(chart: DimensionChart | undefined, name: string): (number | null)[] {
  const s = chart?.series.find((x) => x.name === name);
  assert.ok(s, `missing series ${name}`);
  return s.data;
}

function chart(charts: DimensionChart[], id: DimensionChart["id"]): DimensionChart {
  const c = charts.find((x) => x.id === id);
  assert.ok(c, `missing chart ${id}`);
  return c;
}

const EIGHT = QUARTER_ENDS.map((_d, i) => q(i));

test("general profile produces six dimensions in order", () => {
  const { charts, periods } = buildOverviewDimensions(EIGHT, "general");
  assert.deepEqual(charts.map((c) => c.index), [1, 2, 3, 4, 5, 6]);
  assert.equal(periods.length, 8);
});

test("earnings quality: OCF/NI TTM and receivable-vs-revenue growth gap", () => {
  const rows = EIGHT.map((r, i) =>
    i === 7 ? { ...r, lines: { ...r.lines, accountsReceivable: 60 } } : r,
  );
  const quality = chart(buildOverviewDimensions(rows, "general").charts, "quality");
  const cash = series(quality, "现金含量 (TTM)");
  assert.equal(cash[2], null, "TTM needs four quarters");
  assert.equal(cash[3], 1.5);
  const gap = series(quality, "应收增速 − 营收增速");
  assert.equal(gap[3], null, "no year-ago quarter");
  assert.ok(Math.abs(gap[7]! - 0.2) < 1e-9, "receivables +20% vs revenue +0%");
});

test("balance: net debt / EBITDA, current ratio, goodwill share", () => {
  const balance = chart(buildOverviewDimensions(EIGHT, "general").charts, "balance");
  // 净负债 = 80 − 30 = 50；EBITDA TTM = (20 + 5) × 4 = 100
  assert.equal(series(balance, "净负债 / EBITDA")[7], 0.5);
  assert.equal(series(balance, "流动比率")[7], 1.5);
  assert.equal(series(balance, "商誉+无形 / 净资产")[7], 0.15);
  // 营业利润 TTM 80 / 利息 TTM 8
  assert.equal(series(balance, "利息覆盖倍数")[7], 10);
  assert.equal(balance.series.find((s) => s.name === "利息覆盖倍数")?.hidden, true);
});

test("balance: EBIT falls back to pretax + interest when no operating income subtotal", () => {
  const rows = EIGHT.map((r) => {
    const { operatingIncome: _drop, ...lines } = r.lines!;
    return { ...r, opMargin: null, lines: { ...lines, pretaxIncome: 18 } };
  });
  const balance = chart(buildOverviewDimensions(rows, "general").charts, "balance");
  // EBIT = 18 + 2 = 20，与原口径一致
  assert.equal(series(balance, "净负债 / EBITDA")[7], 0.5);
});

test("efficiency: turnover days and cash conversion cycle", () => {
  const eff = chart(buildOverviewDimensions(EIGHT, "general").charts, "efficiency");
  // 应收 50 / 营收 TTM 400 × 365
  assert.ok(Math.abs(series(eff, "应收天数")[7]! - 45.625) < 1e-9);
  // 存货 40 / 营业成本 TTM 240 × 365
  assert.ok(Math.abs(series(eff, "存货天数")[7]! - 60.833333) < 1e-5);
  assert.ok(Math.abs(series(eff, "应付天数")[7]! - 45.625) < 1e-9);
  assert.ok(Math.abs(series(eff, "现金转换周期")[7]! - 60.833333) < 1e-5);
});

test("efficiency: companies that never report inventory count zero inventory days", () => {
  const rows = EIGHT.map((r) => {
    const { inventory: _drop, ...lines } = r.lines!;
    return { ...r, lines };
  });
  const eff = chart(buildOverviewDimensions(rows, "general").charts, "efficiency");
  assert.equal(eff.series.some((s) => s.name === "存货天数"), false, "empty series dropped");
  assert.ok(Math.abs(series(eff, "现金转换周期")[7]! - 0) < 1e-9);
});

test("cash flow: shareholder return uses absolute values and FCF coverage", () => {
  const cf = chart(buildOverviewDimensions(EIGHT, "general").charts, "cashflow");
  assert.equal(series(cf, "资本开支")[0], -5);
  assert.equal(series(cf, "分红 + 回购")[0], 5);
  // FCF TTM 40 / 回报 TTM 20
  assert.equal(series(cf, "回报覆盖率 (TTM)")[7], 2);
});

test("TTM and YoY stay empty across a gap in the quarter sequence", () => {
  const gapped = [q(0), q(1), q(3), q(4), q(5), q(6), q(7)];
  const quality = chart(buildOverviewDimensions(gapped, "general").charts, "quality");
  const cash = series(quality, "现金含量 (TTM)");
  // 下标 3 = 2024Q1，窗口 Q1,Q2,Q4,2024Q1 跨度 366 天
  assert.equal(cash[3], null);
  assert.equal(cash[5], 1.5);
});

test("bank profile swaps in credit and funding metrics", () => {
  const rows = EIGHT.map((r) => ({
    ...r,
    lines: {
      netInterestIncome: 8,
      noninterestIncome: 4,
      noninterestExpense: 6,
      provisionCreditLosses: 1,
      loansGross: 200,
      loansNet: 196,
      loanLossAllowance: -4,
      deposits: 280,
    },
  }));
  const { charts } = buildOverviewDimensions(rows, "bank");
  assert.deepEqual(
    charts.map((c) => c.title),
    ["增长", "盈利能力", "资产质量", "股东回报", "资产负债结构", "收入结构"],
  );
  assert.equal(series(chart(charts, "profitability"), "净息差（近似）")[7], 0.08);
  assert.equal(series(chart(charts, "quality"), "信用成本 (TTM)")[7], 0.02);
  assert.equal(series(chart(charts, "quality"), "拨贷比")[7], 0.02);
  assert.equal(series(chart(charts, "balance"), "贷存比")[7], 0.7);
  assert.equal(series(chart(charts, "efficiency"), "非息收入占比")[7], 0.04);
});

test("insurer profile: loss ratio and investment yield", () => {
  const rows = EIGHT.map((r) => ({
    ...r,
    lines: { premiumsEarned: 80, policyBenefits: 56, acquisitionCostAmortization: 12, netInvestmentIncome: 10, investments: 500 },
  }));
  const { charts } = buildOverviewDimensions(rows, "insurer");
  assert.ok(Math.abs(series(chart(charts, "profitability"), "赔付率")[7]! - 0.7) < 1e-9);
  assert.equal(series(chart(charts, "profitability"), "获取成本率")[7], 0.15);
  assert.equal(series(chart(charts, "quality"), "净投资收益率 (TTM)")[7], 0.08);
});

test("REIT FFO adds back depreciation and removes investment gains", () => {
  const row = q(0, { netIncome: 10, lines: { depreciationAmortization: 30, investmentGains: 5 } });
  assert.equal(ffoOf(row), 35);
  assert.equal(ffoOf(q(0, { lines: {} })), null, "no D&A → no FFO");
  const rows = EIGHT.map((r) => ({ ...r, lines: { depreciationAmortization: 30 } }));
  const perShare = computeFfoPerShareTtm(rows);
  assert.equal(perShare[2]!.ffoPerShareTtm, null);
  assert.equal(perShare[7]!.ffoPerShareTtm, 16);
  const { charts } = buildOverviewDimensions(rows, "reit");
  assert.equal(series(chart(charts, "cashflow"), "FFO 派息覆盖 (TTM)")[7], 40 / 3);
  const growth = chart(charts, "growth");
  assert.equal(growth.series.some((x) => x.name === "EPS YoY"), false, "REIT growth uses FFO, not EPS");
});

test("net debt stays empty when long-term debt is missing", () => {
  const rows = EIGHT.map((r) => ({ ...r, longTermDebt: null, lines: { ...r.lines, shortTermBorrowings: 50 } }));
  const balance = chart(buildOverviewDimensions(rows, "general").charts, "balance");
  assert.equal(balance.series.some((x) => x.name === "净负债 / EBITDA"), false);
});

test("blueprint lists every intended series even without data", () => {
  const general = dimensionBlueprint("general");
  assert.ok(general.includes("5.资产负债 / 净负债 / EBITDA"));
  assert.ok(dimensionBlueprint("bank").includes("3.资产质量 / 拨贷比"));
  assert.ok(dimensionBlueprint("reit").every((k) => !k.endsWith("/ EPS YoY")));
});

test("overview profile falls back to general on single-line misdetections", () => {
  const withLines = (lines: Record<string, number>) => EIGHT.map((r) => ({ ...r, lines: { ...r.lines, ...lines } }));
  // 粮商：误映射的未决赔款准备 + 存货
  assert.equal(chooseOverviewProfile(withLines({ claimReserves: 5 })), "general");
  // 真保险：有保费
  assert.equal(chooseOverviewProfile(withLines({ claimReserves: 5, premiumsEarned: 80 })), "insurer");
  // 燃料分销：只有应收客户款
  assert.equal(chooseOverviewProfile(withLines({ receivablesFromCustomers: 5 })), "general");
  assert.equal(chooseOverviewProfile(withLines({ receivablesFromCustomers: 5, segregatedCash: 9 })), "broker");
});

test("gross margin is derived from cost of revenue when no gross profit is reported", () => {
  const rows = EIGHT.map((r) => ({ ...r, grossMargin: null }));
  const prof = chart(buildOverviewDimensions(rows, "general").charts, "profitability");
  assert.ok(Math.abs(series(prof, "毛利率")[7]! - 0.4) < 1e-9);
  // 有营业成本的公司即使有赔款准备也不是保险
  const selfInsured = EIGHT.map((r) => ({ ...r, lines: { costOfRevenue: 60, claimReserves: 5 } }));
  assert.equal(chooseOverviewProfile(selfInsured), "general");
});

test("extreme EPS growth is hidden by default but kept in the legend", () => {
  const rows = EIGHT.map((r, i) => (i === 3 ? { ...r, eps: 0.01 } : r)).map((r) => ({ ...r, epsYoY: undefined }));
  const growth = chart(buildOverviewDimensions(rows, "general").charts, "growth");
  const eps = growth.series.find((x) => x.name === "EPS YoY");
  assert.equal(eps?.hidden, true);
  assert.equal(growth.series.find((x) => x.name === "营收 YoY")?.hidden, undefined);
});

test("annual rows: each row is a full year and YoY compares with the previous row", () => {
  const years = ["2021-12-31", "2022-12-31", "2023-12-31"].map((d, i) =>
    q(0, { period: `FY${d.slice(0, 4)}`, fiscalDate: d, revenue: 400 + i * 40, netIncome: 40, ocf: 60, revenueYoY: undefined, epsYoY: undefined }),
  );
  const d = buildOverviewDimensions(years, "general", "FY");
  const quality = chart(d.charts, "quality");
  // 年度视图不带 (TTM)，现金含量 = 60 / 40，首年即有值
  assert.equal(series(quality, "现金含量")[0], 1.5);
  assert.ok(Math.abs(series(chart(d.charts, "growth"), "营收 YoY")[1]! - 0.1) < 1e-9);
  assert.equal(series(chart(d.charts, "growth"), "营收 YoY")[0], null);
  assert.ok(!quality.note?.includes("TTM"));
});

test("slicing keeps values computed from earlier context", () => {
  const d = buildOverviewDimensions(EIGHT, "general");
  const sliced = sliceOverviewDimensions(d, 4, 7);
  assert.deepEqual(sliced.periods, d.periods.slice(4));
  // 区间首期（原下标 4）的 TTM 依赖下标 1–3，截取后仍保留
  assert.equal(series(chart(sliced.charts, "quality"), "现金含量 (TTM)")[0], 1.5);
});
