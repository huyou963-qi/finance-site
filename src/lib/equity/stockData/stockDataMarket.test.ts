import { test } from "node:test";
import assert from "node:assert/strict";
import type { RawDailyBar } from "@/lib/equity/priceAdjustment";
import { computeTechnicalFactors } from "@/lib/quant/factorCompute";
import type { PitEquityRow } from "@/lib/quant/pitCrossSection";
import { buildColumns, columnCountAfterEdit, editColumns, expandMultiPeriod, expandToGroups } from "./columns";
import { buildSheetData, columnHeader, exportValue, formatCellValue } from "./display";
import { getIndicator, normalizeParams, publicIndicator } from "./indicatorRegistry";
import {
  createMarketResolver,
  mergeWindows,
  resolveRangeDates,
  shiftMonths,
  toTechSeries,
} from "./marketResolve";
import { planMarketData } from "./query";
import { parseColumns, StockDataRequestError } from "./request";
import { resolveRow } from "./resolve";
import { parseTemplateInput, readStoredColumns, systemTemplates } from "./templates";
import type { ColumnSpec } from "./types";

let n = 0;
const key = () => `k${++n}`;
const pub = (id: string) => publicIndicator(getIndicator(id)!);

// ---------- 多报告期与列编辑 ----------

test("multi-period expands year by year, quarters before the annual column", () => {
  const periods = expandMultiPeriod({ fromYear: 2023, toYear: 2024, slots: ["FY", "Q4"] });
  assert.deepEqual(periods, [
    { kind: "FQ", year: 2023, q: 4 }, { kind: "FY", year: 2023 },
    { kind: "FQ", year: 2024, q: 4 }, { kind: "FY", year: 2024 },
  ]);
});

test("buildColumns makes one group per indicator; indicators without a period stay a single column", () => {
  const multi = { fromYear: 2022, toYear: 2024, slots: ["FY" as const] };
  const rev = buildColumns(pub("fs.revenue"), {}, multi, key);
  assert.equal(rev.length, 3);
  assert.equal(new Set(rev.map((c) => c.groupId)).size, 1);
  assert.deepEqual(rev.map((c) => c.params.period), [2022, 2023, 2024].map((year) => ({ kind: "FY", year })));
  const close = buildColumns(pub("px.close"), {}, multi, key);
  assert.equal(close.length, 1);
  assert.equal(close[0]!.groupId, undefined);
});

test("editing one column of a group re-expands the whole group in place", () => {
  const multi = { fromYear: 2022, toYear: 2024, slots: ["FY" as const] };
  const cols: ColumnSpec[] = [
    ...buildColumns(pub("sec.name"), {}, undefined, key),
    ...buildColumns(pub("fs.revenue"), {}, multi, key),
    ...buildColumns(pub("val.pe"), {}, undefined, key),
  ];
  assert.equal(expandToGroups(cols, [cols[2]!.key]).length, 3);
  const narrower = { fromYear: 2023, toYear: 2024, slots: ["FY" as const, "Q4" as const] };
  assert.equal(columnCountAfterEdit(cols, [cols[2]!.key], narrower), 1 + 4 + 1);
  const edited = editColumns(cols, [cols[2]!.key], {}, narrower, key);
  assert.deepEqual(edited.map((c) => c.indicatorId), ["sec.name", "fs.revenue", "fs.revenue", "fs.revenue", "fs.revenue", "val.pe"]);
  assert.equal(edited[0]!.key, cols[0]!.key);
  assert.equal(edited[5]!.key, cols[4]!.key);
  // 改回单期：整组收成一列
  const single = editColumns(edited, [edited[3]!.key], { period: { kind: "latestQ" }, basis: "ttm" }, undefined, key);
  assert.equal(single.length, 3);
  assert.deepEqual(single[1]!.params, { period: { kind: "latestQ" }, basis: "ttm" });
  assert.equal(single[1]!.groupId, undefined);
});

test("editing a single column keeps its key", () => {
  const cols = buildColumns(pub("px.close"), {}, undefined, key);
  const edited = editColumns(cols, [cols[0]!.key], { adjust: "none" }, undefined, key);
  assert.equal(edited[0]!.key, cols[0]!.key);
  assert.equal(edited[0]!.params.adjust, "none");
});

// ---------- 参数校验 ----------

test("parseColumns validates as-of dates, ranges, adjust and scale", () => {
  const [c] = parseColumns([{ key: "a", indicatorId: "px.rangeReturn", params: { range: { kind: "custom", from: "2024-01-01", to: "2024-12-31" }, adjust: "none" } }]);
  assert.deepEqual(c!.params, { range: { kind: "custom", from: "2024-01-01", to: "2024-12-31" }, adjust: "none" });
  const [d] = parseColumns([{ key: "b", indicatorId: "val.marketCap", params: { scale: "b" } }]);
  assert.deepEqual(d!.params, { asOf: { kind: "latest" }, scale: "b" });
  assert.throws(() => parseColumns([{ key: "x", indicatorId: "px.close", params: { asOf: { kind: "date", date: "2024-13-40" } } }]), StockDataRequestError);
  assert.throws(() => parseColumns([{ key: "x", indicatorId: "px.rangeReturn", params: { range: { kind: "custom", from: "2024-02-01", to: "2024-01-01" } } }]), StockDataRequestError);
  assert.throws(() => parseColumns([{ key: "x", indicatorId: "px.rangeReturn", params: { range: { kind: "custom", from: "2000-01-01", to: "2024-01-01" } } }]), /10 年/);
});

test("parseColumns keeps group metadata and drops malformed multi rules", () => {
  const [a, b] = parseColumns([
    { key: "a", indicatorId: "fs.revenue", groupId: "g1", multi: { fromYear: 2022, toYear: 2024, slots: ["FY"] }, params: { period: { kind: "FY", year: 2022 } } },
    { key: "b", indicatorId: "fs.revenue", groupId: "g1", multi: { fromYear: 2025, toYear: 2022, slots: ["FY"] }, params: { period: { kind: "FY", year: 2023 } } },
  ]);
  assert.deepEqual(a!.multi, { fromYear: 2022, toYear: 2024, slots: ["FY"] });
  assert.equal(b!.groupId, "g1");
  assert.equal(b!.multi, undefined);
});

// ---------- 区间与窗口 ----------

test("preset ranges end today and start the day after N months back", () => {
  assert.equal(shiftMonths("2026-03-31", -1), "2026-02-28");
  assert.deepEqual(resolveRangeDates({ kind: "preset", preset: "1y" }, "2026-11-10"), { from: "2025-11-11", to: "2026-11-10" });
  assert.deepEqual(resolveRangeDates({ kind: "preset", preset: "ytd" }, "2026-11-10"), { from: "2026-01-01", to: "2026-11-10" });
});

test("mergeWindows joins overlapping or nearby windows", () => {
  assert.deepEqual(
    mergeWindows([{ from: "2026-01-01", to: "2026-02-01" }, { from: "2020-01-01", to: "2020-03-01" }, { from: "2026-02-10", to: "2026-05-01" }]),
    [{ from: "2020-01-01", to: "2020-03-01" }, { from: "2026-01-01", to: "2026-05-01" }],
  );
});

test("planMarketData skips statement columns and asks for point-in-time data where needed", () => {
  const plan = planMarketData([
    { key: "a", indicatorId: "fs.revenue", params: {} },
    { key: "b", indicatorId: "val.pe", params: { asOf: { kind: "date", date: "2024-06-28" } } },
    { key: "c", indicatorId: "px.rangeTurnover", params: { range: { kind: "custom", from: "2024-01-01", to: "2024-03-31" } } },
    { key: "d", indicatorId: "trend.beta252d", params: {} },
  ], "2026-11-10");
  assert.ok(plan);
  assert.deepEqual(plan.pitDates.sort(), ["2024-03-31", "2024-06-28"]);
  assert.equal(plan.needsBenchmark, true);
  assert.equal(planMarketData([{ key: "a", indicatorId: "fs.revenue", params: {} }], "2026-11-10"), null);
});

// ---------- 行情、趋势、估值取值 ----------

const DAY = 86_400;
const t0 = Date.parse("2024-01-01T00:00:00Z") / 1000;
/** 连续 400 个自然日（含周末，简化）：close 每天 +1，adjClose = close × 0.9（模拟分红因子） */
function bars(days = 400): RawDailyBar[] {
  return Array.from({ length: days }, (_, i) => ({ time: t0 + i * DAY, open: 100 + i, high: 100 + i, low: 100 + i, close: 100 + i, adjClose: (100 + i) * 0.9, volume: 1000 }));
}
const iso = (i: number) => new Date((t0 + i * DAY) * 1000).toISOString().slice(0, 10);

test("close: forward uses adjusted price, none undoes later splits", () => {
  const m = createMarketResolver({ bars: bars(), splits: [{ exDate: iso(300), ratio: 2 }], pitByDate: new Map(), isFund: false }, { today: iso(399), benchmark: null });
  const fwd = m.priceCell("close", { asOf: { kind: "date", date: iso(10) }, adjust: "forward" });
  assert.equal(fwd.s, "ok");
  assert.ok(Math.abs((fwd.v as number) - 110 * 0.9) < 1e-9);
  const raw = m.priceCell("close", { asOf: { kind: "date", date: iso(10) }, adjust: "none" });
  assert.equal(raw.v, 220);
  assert.equal(raw.p, iso(10));
  // 截止日在最后一根之后超过 7 天：无行情
  assert.equal(m.priceCell("close", { asOf: { kind: "date", date: iso(420) } }).s, "noPrice");
});

test("range return uses the close before the range; amount and turnover sum the range", () => {
  const pit = { quarters: [{}], sharesCurrent: 100_000 } as unknown as PitEquityRow;
  const m = createMarketResolver({ bars: bars(), splits: [], pitByDate: new Map([[iso(20), pit]]), isFund: false }, { today: iso(399), benchmark: null });
  const range = { kind: "custom" as const, from: iso(11), to: iso(20) };
  const ret = m.priceCell("rangeReturn", { range, adjust: "forward" });
  assert.ok(Math.abs((ret.v as number) - (120 / 110 - 1)) < 1e-12);
  assert.equal(ret.p, `${iso(11)} 至 ${iso(20)}`);
  const amount = m.priceCell("rangeAmount", { range });
  assert.equal(amount.v, Array.from({ length: 10 }, (_, k) => (111 + k) * 1000).reduce((a, b) => a + b, 0));
  assert.equal(m.priceCell("rangeTurnover", { range }).v, 10_000 / 100_000);
});

test("trend cells come straight from computeTechnicalFactors", () => {
  const b = bars();
  const m = createMarketResolver({ bars: b, splits: [], pitByDate: new Map(), isFund: false }, { today: iso(399), benchmark: null });
  const expected = computeTechnicalFactors(toTechSeries(b), t0 + 399 * DAY, null)!.values;
  assert.equal(m.trend("ret12m", { asOf: { kind: "latest" } }).v, expected.ret12m);
  assert.equal(m.trend("vol60d", { asOf: { kind: "latest" } }).v, expected.vol60d);
  // 没有基准就没有 Beta
  assert.equal(m.trend("beta252d", { asOf: { kind: "latest" } }).s, "noValue");
});

test("valuation: funds are not applicable, missing fundamentals are uncovered", () => {
  const fund = createMarketResolver({ bars: bars(), splits: [], pitByDate: new Map(), isFund: true }, { today: iso(399), benchmark: null });
  assert.equal(fund.valuation("pe", {}).s, "notApplicable");
  assert.equal(fund.priceCell("close", {}).s, "ok");
  const bare = createMarketResolver({ bars: bars(), splits: [], pitByDate: new Map(), isFund: false }, { today: iso(399), benchmark: null });
  assert.equal(bare.valuation("pe", {}).s, "uncovered");
});

test("resolveRow sends market columns to the market resolver even for funds", () => {
  const m = createMarketResolver({ bars: bars(), splits: [], pitByDate: new Map(), isFund: true }, { today: iso(399), benchmark: null });
  const row = resolveRow(
    { symbol: "SPY", isFund: true, security: { name: "SPY", exchange: null, gicsSector: null, gicsIndustryGroup: null, gicsIndustry: null, gicsSubIndustry: null, marketCap: null, website: null }, quarters: [] },
    [{ key: "a", indicatorId: "px.close", params: normalizeParams(pub("px.close"), {}) }, { key: "b", indicatorId: "fs.revenue", params: {} }],
    m,
  );
  assert.equal(row.cells.a!.s, "ok");
  assert.equal(row.cells.b!.s, "notApplicable");
});

// ---------- 显示单位与导出 ----------

test("scale changes display, header unit and exported values", () => {
  const col: ColumnSpec = { key: "a", indicatorId: "fs.revenue", params: { period: { kind: "latestFY" }, scale: "m" } };
  assert.equal(formatCellValue("money", { v: 391_035_000_000, s: "ok" }, "m").text, "391,035");
  assert.equal(columnHeader(col).unit, "百万美元");
  assert.equal(exportValue(col, { v: 391_035_000_000, s: "ok" }, true), 391_035);
  const pct: ColumnSpec = { key: "b", indicatorId: "fs.grossMargin", params: {} };
  assert.equal(exportValue(pct, { v: 0.4621, s: "ok" }, true), 46.21);
  assert.equal(exportValue(pct, { v: 0.4621, s: "ok" }, false), 0.4621);
  const sheet = buildSheetData([{ symbol: "AAPL", name: "Apple", cells: { a: { v: 1e9, s: "ok" }, b: { v: null, s: "noPrice" } } }], [col, pct]);
  assert.deepEqual(sheet.pctColumns, [3]);
  assert.deepEqual(sheet.aoa[1], ["AAPL", "Apple", 1000, "无行情"]);
});

// ---------- 模板 ----------

test("system templates only use registered indicators and stay within limits", () => {
  for (const t of systemTemplates(key)) {
    assert.ok(t.columns.length > 0 && t.columns.length <= 50, t.name);
    assert.doesNotThrow(() => parseColumns(t.columns), t.name);
  }
});

test("template input requires a name and validates columns; stored columns drop retired indicators", () => {
  assert.throws(() => parseTemplateInput({ name: " ", columns: [] }), /名称/);
  const t = parseTemplateInput({ name: "我的", columns: [{ key: "a", indicatorId: "val.pe", params: {} }], symbols: ["aapl", "BRK.B"] });
  assert.deepEqual(t.symbols, ["AAPL", "BRK-B"]);
  assert.deepEqual(readStoredColumns([{ key: "a", indicatorId: "gone.metric", params: {} }, { key: "b", indicatorId: "val.pe", params: {} }]).map((c) => c.key), ["b"]);
});
