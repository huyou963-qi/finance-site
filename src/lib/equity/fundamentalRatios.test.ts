import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateFiscalYears, computeQuarterRatios } from "./fundamentalRatios";
import { computeValuationHistory } from "./valuationHistory";
import type { QuarterFundamentalRow } from "./ttm";

function q(
  period: string,
  fiscalDate: string,
  over: Partial<QuarterFundamentalRow> = {},
): QuarterFundamentalRow {
  return {
    period,
    fiscalDate,
    revenue: 100,
    netIncome: 10,
    eps: 1,
    ocf: 20,
    capex: 5,
    dividendsPaid: 4,
    totalAssets: 400,
    totalLiabilities: 250,
    equity: 150,
    longTermDebt: 80,
    cash: 30,
    sharesOutstanding: 10,
    ...over,
  };
}

const EIGHT_QUARTERS = [
  q("2023Q1", "2023-03-31", { equity: 140, totalAssets: 380 }),
  q("2023Q2", "2023-06-30"),
  q("2023Q3", "2023-09-30"),
  q("2023Q4", "2023-12-31"),
  q("2024Q1", "2024-03-31", { equity: 160, totalAssets: 420, sharesOutstanding: 9.5 }),
  q("2024Q2", "2024-06-30"),
  q("2024Q3", "2024-09-30"),
  q("2024Q4", "2024-12-31", { equity: 170, totalAssets: 440 }),
];

test("computeQuarterRatios：TTM ROE 用平均权益，杜邦三分解可乘回 ROE", () => {
  const ratios = computeQuarterRatios(EIGHT_QUARTERS);
  const last = ratios[ratios.length - 1]!;
  // TTM NI = 40；平均权益 = (期末 170 + 上年同期末 150)/2 = 160
  assert.ok(Math.abs(last.roeTtm! - 40 / 160) < 1e-9);
  // 杜邦：净利率 × 周转 × 杠杆 = ROE
  const dupont = last.netMarginTtm! * last.assetTurnoverTtm! * last.equityMultiplier!;
  assert.ok(Math.abs(dupont - last.roeTtm!) < 1e-9);
  // 资产负债率（期末）
  assert.ok(Math.abs(last.debtRatio! - 250 / 440) < 1e-9);
  // 净债务 = 80 − 30
  assert.equal(last.netDebt, 50);
  // 派息率 = 16/40
  assert.ok(Math.abs(last.payoutRatioTtm! - 0.4) < 1e-9);
  // 回购率 = (9.5 − 10)/9.5 → 负（增发）；2024Q1 相对 2023Q1 = (10−9.5)/10
  const q1 = ratios.find((r) => r.period === "2024Q1")!;
  assert.ok(Math.abs(q1.buybackRate! - 0.05) < 1e-9);
  // 前 3 季 TTM 指标为 null
  assert.equal(ratios[0]!.roeTtm, null);
  assert.equal(ratios[2]!.epsTtm, null);
  assert.equal(ratios[3]!.epsTtm, 4);
});

test("aggregateFiscalYears：4 季一组求和/期末，YoY 跨组", () => {
  const quarters = EIGHT_QUARTERS.map((r, i) => ({
    ...r,
    revenue: 100 + i * 10, // 2023: 100..130 (sum 460)；2024: 140..170 (sum 620)
    grossMargin: 0.5,
    opMargin: 0.3,
  }));
  const fy = aggregateFiscalYears(quarters);
  assert.equal(fy.length, 2);
  assert.equal(fy[0]!.period, "FY2023");
  assert.equal(fy[0]!.revenue, 460);
  assert.equal(fy[1]!.revenue, 620);
  assert.ok(Math.abs(fy[1]!.revenueYoY! - (620 / 460 - 1)) < 1e-9);
  // 时点值取末季
  assert.equal(fy[1]!.equity, 170);
  // 加权毛利率仍是 0.5
  assert.ok(Math.abs(fy[1]!.grossMargin! - 0.5) < 1e-9);
  assert.equal(fy[1]!.eps, 4);
});

test("aggregateFiscalYears：有 FQ4 锚定时按真实财年分组（NVDA 型，最新季是次财年 Q1）", () => {
  // 财年止于 1 月底：FQ4 落在日历 Q1
  const rows = [
    { ...q("2024Q2", "2024-04-28"), fiscalQuarter: 1, revenue: 100 },
    { ...q("2024Q3", "2024-07-28"), fiscalQuarter: 2, revenue: 110 },
    { ...q("2024Q4", "2024-10-27"), fiscalQuarter: 3, revenue: 120 },
    { ...q("2025Q1", "2025-01-26"), fiscalQuarter: 4, revenue: 130 },
    { ...q("2025Q2", "2025-04-27"), fiscalQuarter: 1, revenue: 140 }, // 次财年 Q1，不应成组
  ];
  const fy = aggregateFiscalYears(rows);
  assert.equal(fy.length, 1);
  assert.equal(fy[0]!.period, "FY2025"); // 财年末 2025-01 → 公司命名 FY2025
  assert.equal(fy[0]!.revenue, 460);
});

test("aggregateFiscalYears：断档的更早组被丢弃", () => {
  const rows = [
    q("2021Q4", "2021-12-31"),
    // 缺 2022 三个季度 → 2022 组断档
    q("2022Q4", "2022-12-31"),
    q("2023Q1", "2023-03-31"),
    q("2023Q2", "2023-06-30"),
    q("2023Q3", "2023-09-30"),
    q("2023Q4", "2023-12-31"),
  ];
  const fy = aggregateFiscalYears(rows);
  assert.equal(fy.length, 1);
  assert.equal(fy[0]!.period, "FY2023");
});

test("computeValuationHistory：财报滞后 40 天生效 + 分位", () => {
  const day = 86_400;
  const t0 = Math.floor(Date.parse("2024-01-01T00:00:00Z") / 1000);
  // 400 个交易日，价格 100 → 179.5 线性上行
  const closes = Array.from({ length: 400 }, (_, i) => ({
    time: t0 + i * day,
    close: 100 + i * 0.2,
  }));
  const quarters = [
    { fiscalDate: "2023-12-31", epsTtm: 10, bvps: 50 },
    { fiscalDate: "2024-06-30", epsTtm: 12.5, bvps: 55 },
  ];
  const vh = computeValuationHistory(closes, quarters, 5);
  assert.ok(vh.points.length > 50);
  // 2024-06-30 + 40 天 ≈ 2024-08-09 之前 PE 用 eps=10
  const early = vh.points.find((p) => p.t < t0 + 100 * day)!;
  assert.ok(Math.abs(early.pe! - closes.find((c) => c.time === early.t)!.close / 10) < 1e-9);
  // 末端 PE 用 eps=12.5
  const lastClose = closes[closes.length - 1]!.close;
  assert.ok(Math.abs(vh.peCurrent! - lastClose / 12.5) < 1e-9);
  assert.ok(vh.pePercentile != null && vh.pePercentile > 0.3 && vh.pePercentile <= 1);
  assert.ok(vh.peMin! < vh.peMax!);
  assert.ok(Math.abs(vh.pbCurrent! - lastClose / 55) < 1e-9);
});
