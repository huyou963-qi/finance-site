import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVerifiedLegacySplits, type LegacyYahooPriceRow } from "./legacyYahooSplits";
import { excludeLegacyYahooActionBoundaries } from "./legacyYahoo";
import { trendFlags } from "./compute";

const price = (date: string, close: number, adjClose: number): LegacyYahooPriceRow => ({ date, open: close, high: close, low: close, close, adjClose, volume: 100 });
const split = { date: "2008-05-27", previousDate: "2008-05-23", ratio: 2, source: "https://example.com/exchange-split-notice" };

test("公告拆股仅统一原始OHLC尺度，保留Adj Close、成交量与源数据", () => {
  const rows = [price("2008-05-23", 100, 50), price("2008-05-27", 51, 51)];
  const result = normalizeVerifiedLegacySplits(rows, [split]);
  assert.deepEqual(result.rows, [price("2008-05-23", 50, 50), rows[1]]);
  assert.equal(rows[0].close, 100);
  assert.deepEqual(excludeLegacyYahooActionBoundaries(result.rows).excludedDates, []);
  assert.deepEqual(normalizeVerifiedLegacySplits(rows, []).rows, rows);
});

test("比例不符、混合现金/拆股、缺少相邻原始报价及低精度拆股均失败", () => {
  const rows = [price("2008-05-23", 100, 50), price("2008-05-27", 51, 51)];
  assert.throws(() => normalizeVerifiedLegacySplits(rows, [{ ...split, ratio: 3 }]), /不符/);
  assert.throws(() => normalizeVerifiedLegacySplits([rows[0], price("2008-05-27", 49, 50)], [split]), /不符/);
  assert.throws(() => normalizeVerifiedLegacySplits(rows, [{ ...split, previousDate: "2008-05-22" }]), /相邻/);
  assert.throws(() => normalizeVerifiedLegacySplits(rows.slice(1), [split]), /相邻/);
  assert.throws(() => normalizeVerifiedLegacySplits([price("2008-05-23", 1, 0.5), price("2008-05-27", 0.5, 0.5)], [split]), /相邻/);
  assert.throws(() => normalizeVerifiedLegacySplits(rows, [split, split]), /重复/);
});

test("多次拆股正确累计，现金金额与上一交易日价格使用相同尺度，未知边界仍阻断", () => {
  const rows = [price("2008-05-20", 100, 25), price("2008-05-21", 96, 25), price("2008-05-23", 96, 25), price("2008-05-27", 48, 25), price("2008-06-02", 24, 25), price("2008-06-03", 24, 26)];
  const cash = [{ date: "2008-05-21", previousDate: "2008-05-20", amount: 4, source: "https://example.com/cash" }];
  const second = { ...split, date: "2008-06-02", previousDate: "2008-05-27" };
  const result = normalizeVerifiedLegacySplits(rows, [split, second], cash);
  assert.equal(result.rows[0].close, 25);
  assert.equal(result.cashDividends[0].amount, 1);
  assert.deepEqual(excludeLegacyYahooActionBoundaries(result.rows, result.cashDividends).verifiedCashDates, ["2008-05-21"]);
  assert.deepEqual(excludeLegacyYahooActionBoundaries(result.rows, result.cashDividends).excludedDates, ["2008-06-03"]);
  assert.throws(() => normalizeVerifiedLegacySplits(rows, [split], [{ ...cash[0], date: split.date }]), /清单/);
});

test("经过核验的拆股可恢复严格200日窗口，而不制造假趋势", () => {
  const rows = Array.from({ length: 220 }, (_, index) => price(new Date(Date.UTC(2000, 0, index + 1)).toISOString().slice(0, 10), index < 150 ? 100 : 50, 50));
  const result = normalizeVerifiedLegacySplits(rows, [{ ...split, date: rows[150].date, previousDate: rows[149].date }]);
  const filtered = excludeLegacyYahooActionBoundaries(result.rows);
  const flags = trendFlags(filtered.rows.map((row, index) => ({ ...row, index })));
  assert.equal(flags[199].above200, false);
  assert.equal(flags[199].above50, false);
  assert.equal(filtered.excludedDates.length, 0);
});
