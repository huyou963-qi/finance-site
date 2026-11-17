import { test } from "node:test";
import assert from "node:assert/strict";
import type { QuarterSnapshotRow } from "@/lib/equity/equityFundamentalsStore";
import { STATEMENT_LINES } from "@/lib/equity/statementTemplate";
import { buildIndicatorTree, columnParamLabel, getIndicator, INDICATORS, normalizeParams } from "./indicatorRegistry";
import { normalizeUsTicker, parseColumns, parseSymbols, StockDataRequestError } from "./request";
import { earliestYearNeeded, quarterPositions, resolveRow, type SymbolInput } from "./resolve";
import { aggregateFiscalYears } from "@/lib/equity/fundamentalRatios";
import { buildCsv, formatCellValue, sortRows } from "./display";
import { applyResultFilters } from "./resultFilter";
import { computeGroupStats } from "./groupStats";
import { computeTechnicalPoint } from "./technicalResolve";
import { buildHistoryColumns } from "./seriesQuery";
import { systemTemplates } from "./templates";
import { MAX_COLUMNS, MAX_SYMBOLS, type ColumnSpec, type StockDataRow } from "./types";

// ---------- 指标目录 ----------

test("indicator ids are unique and cover every statement line", () => {
  assert.equal(new Set(INDICATORS.map((d) => d.id)).size, INDICATORS.length);
  for (const line of STATEMENT_LINES) assert.ok(getIndicator(`fs.${line.code}`), line.code);
});

test("indicator tree keeps registration order", () => {
  const tree = buildIndicatorTree(INDICATORS);
  assert.deepEqual(tree.children.map((c) => c.label), ["证券信息", "财务报表", "财务指标", "估值指标", "行情指标", "趋势与风险", "技术指标", "内部人"]);
  assert.deepEqual(tree.children[1]!.children.map((c) => c.label), ["利润表", "资产负债表", "现金流量表"]);
  assert.ok(getIndicator("ratio.ocfToNetIncome"));
  assert.ok(getIndicator("ratio.accrualsToAssets"));
  assert.ok(getIndicator("growth.revenueAccel"));
  assert.ok(getIndicator("tech.rsi14"));
  assert.equal(getIndicator("tech.rsi14")!.unit, "number");
  assert.ok(getIndicator("insider.netBuyRatio"));
  assert.ok(getIndicator("ratio.currentRatio"));
  assert.ok(getIndicator("ratio.interestCoverage"));
  assert.ok(getIndicator("fs.grossMargin"));
  assert.ok(getIndicator("fs.opMargin"));
  assert.ok(getIndicator("fs.ebitda"));
});

test("system templates cover valuation / quality / growth / technical presets", () => {
  const templates = systemTemplates(() => "k");
  const byId = new Map(templates.map((t) => [t.id, t]));
  for (const id of ["sys:valuation", "sys:quality", "sys:growth", "sys:trend", "sys:technical", "sys:income3y"]) {
    assert.ok(byId.get(id)?.columns.length, id);
  }
  assert.ok(byId.get("sys:quality")!.columns.some((c) => c.indicatorId === "fs.grossMargin"));
  assert.ok(byId.get("sys:technical")!.columns.some((c) => c.indicatorId === "tech.rsi14"));
  assert.ok(byId.get("sys:income3y")!.columns.some((c) => c.indicatorId === "fs.ebitda"));
});

test("normalizeParams adds defaults and drops params an indicator does not take", () => {
  const revenue = getIndicator("fs.revenue")!;
  assert.deepEqual(normalizeParams(revenue, {}), { period: { kind: "latestFY" } });
  assert.deepEqual(normalizeParams(revenue, { period: { kind: "latestQ" } }), { period: { kind: "latestQ" }, basis: "single" });
  const assets = getIndicator("fs.totalAssets")!;
  assert.deepEqual(normalizeParams(assets, { period: { kind: "latestQ" }, basis: "ttm" }), { period: { kind: "latestQ" } });
  assert.deepEqual(normalizeParams(getIndicator("sec.name")!, { period: { kind: "latestQ" } }), {});
  assert.equal(columnParamLabel({ period: { kind: "FQ", year: 2025, q: 3 }, basis: "ttm" }), "FY2025 Q3 · TTM");
});

// ---------- 请求校验 ----------

test("parseSymbols normalizes, dedupes and sets aside non-US codes", () => {
  const r = parseSymbols(["aapl", "AAPL", "brk.b", "NASDAQ:msft", "600519.SH", "00700", ""]);
  assert.deepEqual(r.symbols, ["AAPL", "BRK-B", "MSFT"]);
  assert.deepEqual(r.ignored, ["600519.SH", "00700"]);
  assert.equal(normalizeUsTicker("300033.SZ"), null);
});

test("parseSymbols and parseColumns enforce the 50 × 50 limit", () => {
  const many = Array.from({ length: MAX_SYMBOLS + 1 }, (_, i) => `A${i}`);
  assert.throws(() => parseSymbols(many), StockDataRequestError);
  const cols = Array.from({ length: MAX_COLUMNS + 1 }, (_, i) => ({ key: `c${i}`, indicatorId: "fs.revenue", params: {} }));
  assert.throws(() => parseColumns(cols), StockDataRequestError);
});

test("parseColumns rejects unknown indicators, duplicate keys and bad periods", () => {
  assert.throws(() => parseColumns([{ key: "a", indicatorId: "nope", params: {} }]), /未知指标/);
  assert.throws(() => parseColumns([{ key: "a", indicatorId: "fs.revenue" }, { key: "a", indicatorId: "fs.eps" }]), /重复/);
  assert.throws(() => parseColumns([{ key: "a", indicatorId: "fs.revenue", params: { period: { kind: "FQ", year: 2025, q: 5 } } }]), /季度/);
  const [c] = parseColumns([{ key: "a", indicatorId: "fs.revenue", params: { period: { kind: "FQ", year: 2025, q: 2 }, basis: "ttm" } }]);
  assert.deepEqual(c!.params, { period: { kind: "FQ", year: 2025, q: 2 }, basis: "ttm" });
});

// ---------- 取数 ----------

/** 9 月财年末的公司（类似 AAPL）：FQ1 截止 12 月 */
function quarter(fiscalDate: string, fq: number, over: Partial<QuarterSnapshotRow> = {}): QuarterSnapshotRow {
  return {
    period: `${fiscalDate.slice(0, 4)}Q${Math.ceil(Number(fiscalDate.slice(5, 7)) / 3)}`,
    fiscalDate,
    fiscalQuarter: fq,
    firstReportedAt: null,
    revenue: 100,
    revenueYoY: 0.1,
    eps: 1,
    epsYoY: 0.2,
    grossMargin: 0.4,
    opMargin: 0.2,
    netIncome: 10,
    ocf: 20,
    capex: 5,
    dividendsPaid: 2,
    buybackPaid: 3,
    totalAssets: 1000,
    totalLiabilities: 600,
    equity: 400,
    longTermDebt: 100,
    cash: 50,
    sharesOutstanding: 10,
    lines: { costOfRevenue: 60 },
    ...over,
  };
}

const QUARTERS: QuarterSnapshotRow[] = [
  quarter("2023-12-30", 1), quarter("2024-03-30", 2), quarter("2024-06-29", 3), quarter("2024-09-28", 4),
  quarter("2024-12-28", 1), quarter("2025-03-29", 2), quarter("2025-06-28", 3), quarter("2025-09-27", 4, { revenue: 130, totalAssets: 1200 }),
  quarter("2025-12-27", 1, { revenue: 140, firstReportedAt: "2026-01-30" }),
];

const SECURITY = { name: "Test Co", exchange: "Nasdaq", gicsSector: "Information Technology", gicsIndustryGroup: null, gicsIndustry: null, gicsSubIndustry: null, marketCap: 3e12, website: null };

function col(key: string, indicatorId: string, params: ColumnSpec["params"] = {}): ColumnSpec {
  return { key, indicatorId, params };
}

test("quarters map to the fiscal year that contains them", () => {
  const pos = quarterPositions(QUARTERS, aggregateFiscalYears(QUARTERS));
  assert.deepEqual(pos[0], { year: 2024, q: 1 });
  assert.deepEqual(pos[7], { year: 2025, q: 4 });
  // 最新一个完整财年之后的季度属于下一财年
  assert.deepEqual(pos[8], { year: 2026, q: 1 });
});

test("resolveRow picks fiscal years, quarters and TTM windows", () => {
  const input: SymbolInput = { symbol: "TEST", isFund: false, security: SECURITY, quarters: QUARTERS };
  const row = resolveRow(input, [
    col("fy", "fs.revenue", { period: { kind: "latestFY" } }),
    col("fy24", "fs.revenue", { period: { kind: "FY", year: 2024 } }),
    col("q", "fs.revenue", { period: { kind: "latestQ" }, basis: "single" }),
    col("ttm", "fs.revenue", { period: { kind: "latestQ" }, basis: "ttm" }),
    col("assets", "fs.totalAssets", { period: { kind: "FY", year: 2025 } }),
    col("capex", "fs.capex", { period: { kind: "latestFY" } }),
    col("cost", "fs.costOfRevenue", { period: { kind: "FQ", year: 2025, q: 4 } }),
    col("missing", "fs.inventory", { period: { kind: "latestFY" } }),
    col("old", "fs.revenue", { period: { kind: "FY", year: 2010 } }),
    col("sector", "sec.gicsSector"),
    col("reported", "sec.latestReportedAt"),
    col("growth", "growth.revenueYoY", { period: { kind: "latestFY" } }),
    col("debt", "ratio.debtRatio", { period: { kind: "latestFY" } }),
    col("cash", "ratio.ocfToNetIncome", { period: { kind: "latestFY" } }),
    col("accrual", "ratio.accrualsToAssets", { period: { kind: "latestFY" } }),
    col("accel", "growth.revenueAccel", { period: { kind: "latestFY" } }),
    col("gm", "fs.grossMargin", { period: { kind: "latestQ" } }),
  ]);
  const c = row.cells;
  assert.deepEqual(c.fy, { v: 430, s: "ok", p: "FY2025", d: "2025-09-27" });
  assert.equal(c.fy24!.v, 400);
  assert.deepEqual(c.q, { v: 140, s: "ok", p: "FY2026 Q1", d: "2025-12-27" });
  assert.equal(c.ttm!.v, 470);
  assert.equal(c.assets!.v, 1200);
  assert.equal(c.capex!.v, -20, "资本开支是现金流出，按负数显示");
  assert.equal(c.cost!.v, 60);
  assert.deepEqual(c.missing, { v: null, s: "na", p: "FY2025", d: "2025-09-27" });
  assert.deepEqual(c.old, { v: null, s: "noPeriod" });
  assert.equal(c.sector!.v, "信息技术");
  assert.equal(c.reported!.v, "2026-01-30");
  assert.ok(Math.abs((c.growth!.v as number) - (430 / 400 - 1)) < 1e-12);
  assert.equal(c.debt!.v, 0.5);
  // FY2025 末季 index=7：TTM OCF=80，TTM NI=40 → 2；应计=(40-80)/avgAssets
  assert.equal(c.cash!.v, 2);
  assert.ok(typeof c.accrual!.v === "number");
  // FY2025 YoY − FY2024 YoY；FY2024 无前一年 → FY 加速度 null
  assert.equal(c.accel!.s, "na");
  assert.equal(c.gm!.v, 0.4);
});

test("currentRatio and interestCoverage read statement lines", () => {
  const withLines = QUARTERS.map((q, i) => ({
    ...q,
    lines: {
      ...q.lines,
      currentAssets: 200,
      currentLiabilities: 100,
      operatingIncome: 25,
      interestExpense: 5,
      ...(i === QUARTERS.length - 1 ? { currentAssets: 300, currentLiabilities: 100 } : {}),
    },
  }));
  const input: SymbolInput = { symbol: "TEST", isFund: false, security: SECURITY, quarters: withLines };
  const row = resolveRow(input, [
    col("cr", "ratio.currentRatio", { period: { kind: "latestQ" } }),
    col("ic", "ratio.interestCoverage", { period: { kind: "latestQ" } }),
  ]);
  assert.equal(row.cells.cr!.v, 3);
  assert.equal(row.cells.ic!.v, 5); // TTM OI 100 / TTM |IE| 20
});

test("uncovered stocks and funds get explicit statuses instead of blanks", () => {
  const cols = [col("rev", "fs.revenue"), col("name", "sec.name"), col("profile", "sec.statementProfile")];
  const uncovered = resolveRow({ symbol: "NEW", isFund: false, security: { ...SECURITY, name: "New Co" }, quarters: [] }, cols);
  assert.equal(uncovered.cells.rev!.s, "uncovered");
  assert.equal(uncovered.cells.profile!.s, "uncovered");
  assert.deepEqual(uncovered.cells.name, { v: "New Co", s: "ok" });
  const fund = resolveRow({ symbol: "SPY", isFund: true, security: { ...SECURITY, name: "SPDR" }, quarters: [] }, cols);
  assert.equal(fund.cells.rev!.s, "notApplicable");
  assert.equal(fund.cells.profile!.s, "notApplicable");
});

test("earliestYearNeeded reaches back far enough for TTM and YoY", () => {
  assert.equal(earliestYearNeeded([col("a", "fs.revenue")], 2026), 2022);
  assert.equal(earliestYearNeeded([col("a", "fs.revenue", { period: { kind: "FY", year: 2018 } })], 2026), 2015);
});

// ---------- 显示与导出 ----------


test("cells show statuses as words and values in compact form", () => {
  assert.deepEqual(formatCellValue("money", { v: 4.3e11, s: "ok" }), { text: "430.00B", muted: false });
  assert.deepEqual(formatCellValue("pct", { v: 0.1234, s: "ok" }), { text: "12.34%", muted: false });
  assert.deepEqual(formatCellValue("number", { v: 57.18, s: "ok" }), { text: "57.18", muted: false });
  assert.deepEqual(formatCellValue("money", { v: null, s: "uncovered" }), { text: "未覆盖", muted: true });
});

const ROWS: StockDataRow[] = [
  { symbol: "B", name: "乙", cells: { r: { v: 2, s: "ok" } } },
  { symbol: "A", name: "甲", cells: { r: { v: null, s: "na" } } },
  { symbol: "C", name: "丙", cells: { r: { v: 5, s: "ok" } } },
];

test("sorting keeps empty cells last in both directions", () => {
  assert.deepEqual(sortRows(ROWS, { key: "r", dir: "desc" }).map((r) => r.symbol), ["C", "B", "A"]);
  assert.deepEqual(sortRows(ROWS, { key: "r", dir: "asc" }).map((r) => r.symbol), ["B", "C", "A"]);
  assert.deepEqual(sortRows(ROWS, { key: "$symbol", dir: "asc" }).map((r) => r.symbol), ["A", "B", "C"]);
});

test("CSV exports raw numbers, percent as percent, and status words", () => {
  const csv = buildCsv(
    [{ symbol: "AAPL", name: "Apple, Inc.", cells: { m: { v: 0.25, s: "ok" }, r: { v: 4.3e11, s: "ok" }, x: { v: null, s: "na" } } }],
    [
      { key: "m", indicatorId: "fs.grossMargin", params: { period: { kind: "latestFY" } } },
      { key: "r", indicatorId: "fs.revenue", params: { period: { kind: "latestFY" } } },
      { key: "x", indicatorId: "fs.inventory", params: { period: { kind: "latestFY" } } },
    ],
  );
  const [head, row] = csv.replace("﻿", "").trim().split("\r\n");
  assert.equal(head, "代码,名称,毛利率 [最新年报] (%),营业收入 [最新年报] (美元),存货 [最新年报] (美元)");
  assert.equal(row, 'AAPL,"Apple, Inc.",25,430000000000,未披露');
});

test("result filters keep AND semantics and skip non-ok cells", () => {
  const filtered = applyResultFilters(ROWS, [{ columnKey: "r", op: "gte", value: "2" }]);
  assert.deepEqual(filtered.map((r) => r.symbol), ["B", "C"]);
  assert.deepEqual(applyResultFilters(ROWS, [{ columnKey: "$symbol", op: "contains", value: "a" }]).map((r) => r.symbol), ["A"]);
});

test("GICS group stats report mean and median", () => {
  const stats = computeGroupStats(
    [
      { symbol: "A", name: "a", cells: { g: { v: "科技", s: "ok" }, v: { v: 10, s: "ok" } } },
      { symbol: "B", name: "b", cells: { g: { v: "科技", s: "ok" }, v: { v: 20, s: "ok" } } },
      { symbol: "C", name: "c", cells: { g: { v: "金融", s: "ok" }, v: { v: 5, s: "ok" } } },
    ],
    "g",
    "v",
  );
  assert.equal(stats.find((s) => s.group === "科技")?.mean, 15);
  assert.equal(stats.find((s) => s.group === "科技")?.median, 15);
  assert.equal(stats.find((s) => s.group === "金融")?.count, 1);
});

test("technical point computes SMA / RSI / MACD at series end", () => {
  const closes = Array.from({ length: 80 }, (_, i) => 100 + i * 0.5);
  const p = computeTechnicalPoint(closes);
  assert.ok(p.sma20 != null && Math.abs(p.sma20 - closes.slice(-20).reduce((a, b) => a + b, 0) / 20) < 1e-9);
  assert.ok(p.rsi14 != null && p.rsi14 > 50);
  assert.ok(p.macdDif != null);
});

test("history columns expand FY years for statement indicators", () => {
  const cols = buildHistoryColumns("fs.revenue", { years: 3, asOfToday: "2026-11-17" });
  assert.ok(cols);
  assert.equal(cols!.length, 4);
  assert.equal(cols![0]!.params.period?.kind, "FY");
});
