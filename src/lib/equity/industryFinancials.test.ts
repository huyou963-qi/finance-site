import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIndustryFinancialHistory, financialQuarterEnd, selectFinancialHoldingsDate, shiftFinancialQuarter,
  type FinancialSnapshot, type FinancialSecurity,
} from "./industryFinancials";

const securities: FinancialSecurity[] = [
  { symbol: "A", cik: "000001", cusip: "A", name: "Company A" },
  { symbol: "A2", cik: "1", cusip: "A2", name: "Company A class 2" },
  { symbol: "B", cik: "2", cusip: "B", name: "Company B" },
];
const holdings = [
  { symbol: "A", cusip: "A", name: "A", weight: 0.5 },
  { symbol: "A2", cusip: "A2", name: "A class 2", weight: 0.2 },
  { symbol: "B", cusip: "B", name: "B", weight: 0.3 },
];
function snapshot(symbol: string, period: string, value: number): FinancialSnapshot {
  return { symbol, period, fiscalDate: financialQuarterEnd(period), revenue: value, netIncome: value * 0.2, ocf: value * 0.3, capex: value * 0.1 };
}
function history(snapshots: FinancialSnapshot[], overrides: Partial<Parameters<typeof buildIndustryFinancialHistory>[0]> = {}) {
  return buildIndustryFinancialHistory({
    periods: ["2026Q3"], membership: "current", current: { date: "2026-10-30", holdings },
    historical: new Map(), securities, snapshots, ...overrides,
  })[0]!;
}

test("financial quarter boundaries cross years and leap days", () => {
  assert.equal(shiftFinancialQuarter("2026Q1", -1), "2025Q4");
  assert.equal(shiftFinancialQuarter("2026Q3", -7), "2024Q4");
  assert.equal(financialQuarterEnd("2024Q1"), "2024-03-31");
});

test("historical holdings do not use future or stale archives", () => {
  assert.equal(selectFinancialHoldingsDate(["2026-09-29", "2026-10-01"], "2026-09-30"), "2026-09-29");
  assert.equal(selectFinancialHoldingsDate(["2026-09-22"], "2026-09-30"), null);
  assert.equal(selectFinancialHoldingsDate(["2026-09-23"], "2026-09-30"), "2026-09-23");
});

test("issuer aggregation deduplicates share classes and combines weights", () => {
  const point = history([snapshot("A", "2026Q3", 100), snapshot("A2", "2026Q3", 100), snapshot("B", "2026Q3", 200)]).Q;
  assert.equal(point.universeCount, 2);
  assert.equal(point.revenue.value, 300);
  assert.equal(point.members[0]!.weight, 0.7);
  assert.equal(point.revenue.weightCoverage, 1);
});

test("growth uses matched companies rather than changing available totals", () => {
  const point = history([snapshot("A", "2026Q3", 200), snapshot("A", "2025Q3", 100), snapshot("B", "2026Q3", 1000)]).Q;
  assert.equal(point.revenue.value, 1200);
  assert.equal(point.revenueYoY.value, 1);
  assert.equal(point.revenueYoY.sampleCount, 1);
  assert.equal(point.revenueYoY.weightCoverage, 0.7);
});

test("margin is a ratio of paired amounts, not an average of company ratios", () => {
  const a = snapshot("A", "2026Q3", 100); a.netIncome = 50;
  const b = snapshot("B", "2026Q3", 300); b.netIncome = -10;
  const point = history([a, b]).Q;
  assert.equal(point.netMargin.value, 0.1);
  assert.equal(point.netIncome.value, 40);
});

test("cash flow lines use the same sample and missing values remain null", () => {
  const a = snapshot("A", "2026Q3", 100);
  const b = snapshot("B", "2026Q3", 200); b.capex = null;
  const point = history([a, b]).Q;
  assert.equal(point.ocf.value, 30);
  assert.equal(point.capex.value, 10);
  assert.equal(point.fcf.value, 20);
  assert.equal(point.fcf.sampleCount, 1);
  assert.equal(point.members.find(row => row.symbol === "B")!.fcf, null);
});

test("TTM requires the target quarter and all four continuous quarters", () => {
  const snapshots = ["2025Q4", "2026Q1", "2026Q2", "2026Q3"].map(period => snapshot("A", period, 100));
  assert.equal(history(snapshots).TTM.revenue.value, 400);
  assert.equal(history(snapshots.filter(row => row.period !== "2026Q1")).TTM.revenue.value, null);
  assert.equal(history(snapshots.filter(row => row.period !== "2026Q3")).TTM.revenue.value, null);
});

test("TTM growth compares two complete four-quarter windows", () => {
  const snapshots = Array.from({ length: 8 }, (_, i) => snapshot("A", shiftFinancialQuarter("2026Q3", i - 7), i < 4 ? 100 : 200));
  const point = history(snapshots).TTM;
  assert.equal(point.revenue.value, 800);
  assert.equal(point.revenueYoY.value, 1);
});

test("missing historical holdings do not fall back to current constituents", () => {
  const point = history([snapshot("A", "2026Q3", 100)], { membership: "historical" }).Q;
  assert.equal(point.holdingsDate, null);
  assert.equal(point.revenue.value, null);
  assert.equal(point.universeCount, 0);
  assert.equal(point.members.length, 0);
});

test("historical membership uses that quarter's stocks while keeping latest restated facts", () => {
  const historical = new Map([["2026Q3", { date: "2026-09-30", holdings: [holdings[2]!] }]]);
  const point = history([snapshot("A", "2026Q3", 100), snapshot("B", "2026Q3", 200)], { membership: "historical", historical }).Q;
  assert.equal(point.revenue.value, 200);
  assert.equal(point.holdingsDate, "2026-09-30");
});

test("unmapped holdings stay in denominator and cash is excluded", () => {
  const point = history([snapshot("A", "2026Q3", 100)], { current: { date: "2026-10-30", holdings: [
    holdings[0]!, { symbol: "UNKNOWN", cusip: null, name: "Unknown equity", weight: 0.4 },
    { symbol: null, cusip: null, name: "US Dollar", weight: 0.1 },
  ] } }).Q;
  assert.equal(point.universeCount, 2);
  assert.equal(point.unresolvedCount, 1);
  assert.equal(point.revenue.weightCoverage, 0.5 / 0.9);
});

test("zero is a valid cash flow and negative profit is retained", () => {
  const row = snapshot("A", "2026Q3", 100); row.netIncome = -5; row.ocf = 0; row.capex = 10;
  const point = history([row]).Q;
  assert.equal(point.fcf.value, -10);
  assert.equal(point.netMargin.value, -0.05);
});
