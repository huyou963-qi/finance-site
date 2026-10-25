import test from "node:test";
import assert from "node:assert/strict";
import { excludeLegacyYahooActionBoundaries } from "./legacyYahoo";
import { trendFlags } from "./compute";

test("旧Yahoo现金分红及拆股调整变化日不进入连续价格窗口，不猜测其原因", () => {
  const rows = [
    { date: "2005-02-24", close: 90, adjClose: 44.8 },
    { date: "2005-02-25", close: 88.99, adjClose: 44.3 },
    { date: "2005-02-28", close: 44.86, adjClose: 44.67 },
    { date: "2005-03-01", close: 45, adjClose: 44.81 },
  ];
  const result = excludeLegacyYahooActionBoundaries(rows);
  assert.deepEqual(result.excludedDates, ["2005-02-28"]);
  assert.deepEqual(result.rows, [rows[0], rows[1], rows[3]]);
  assert.deepEqual(excludeLegacyYahooActionBoundaries([
    { date: "2010-01-04", close: 100, adjClose: 90 },
    { date: "2010-01-05", close: 100, adjClose: 91 },
  ]).excludedDates, ["2010-01-05"]);
});

test("共同因子的分币舍入区间有交集时保留原始报价，防止把舍入误认作公司行动", () => {
  const rows = [
    { date: "2000-02-01", close: 10, adjClose: 3.33 },
    { date: "2000-02-02", close: 11, adjClose: 3.67 },
    { date: "2000-02-03", close: 12, adjClose: 4 },
  ];
  assert.deepEqual(excludeLegacyYahooActionBoundaries(rows), { rows, excludedDates: [], verifiedCashDates: [] });
});

test("已核验现金分红只放行金额和调整变化相符的日期，混合拆股仍阻断", () => {
  const events = [{ date: "2008-12-11", previousDate: "2008-12-10", amount: 0.3, source: "https://example.com/issuer-announcement" }];
  const rows = [{ date: "2008-12-10", close: 30, adjClose: 27 }, { date: "2008-12-11", close: 29.7, adjClose: 27 }];
  assert.deepEqual(excludeLegacyYahooActionBoundaries(rows, events).verifiedCashDates, ["2008-12-11"]);
  assert.equal(excludeLegacyYahooActionBoundaries(rows, events).rows.length, 2);
  assert.equal(excludeLegacyYahooActionBoundaries(rows).rows.length, 1);
  const split = [rows[0], { ...rows[1], close: 14.85 }];
  assert.deepEqual(excludeLegacyYahooActionBoundaries(split, events).excludedDates, ["2008-12-11"]);
  assert.deepEqual(excludeLegacyYahooActionBoundaries(split, events).verifiedCashDates, []);
  assert.equal(excludeLegacyYahooActionBoundaries(rows, [{ ...events[0], amount: 3 }]).rows.length, 1);
});

test("逐行因子区间必须有共同交集，不能因每日变化小而跨越累计调整", () => {
  const result = excludeLegacyYahooActionBoundaries([
    { date: "2000-02-01", close: 100, adjClose: 50 },
    { date: "2000-02-02", close: 100, adjClose: 50.01 },
    { date: "2000-02-03", close: 100, adjClose: 50.02 },
  ]);
  assert.deepEqual(result.excludedDates, ["2000-02-03"]);
  assert.throws(() => excludeLegacyYahooActionBoundaries([
    { date: "2000-02-01", close: 100, adjClose: 50 },
    { date: "2000-02-01", close: 100, adjClose: 50 },
  ]), /旧Yahoo价格/);
});

test("真实日历索引保留公司行动缺口，50/200日均线必须重新预热", () => {
  const input = Array.from({ length: 250 }, (_, index) => ({
    index, date: new Date(Date.UTC(2000, 0, 1 + index)).toISOString().slice(0, 10),
    close: index < 150 ? 100 : 50, adjClose: 50,
  }));
  const filtered = excludeLegacyYahooActionBoundaries(input);
  assert.equal(filtered.excludedDates.length, 1);
  const flags = new Map(trendFlags(filtered.rows).map(r => [r.index, r]));
  assert.equal(flags.get(149)!.above50, false);
  assert.equal(flags.has(150), false);
  assert.equal(flags.get(199)!.above50, null);
  assert.equal(flags.get(200)!.above50, false);
  assert.equal(flags.get(249)!.above200, null);
  assert.deepEqual(excludeLegacyYahooActionBoundaries([{ date: "2000-01-01", close: 0.4, adjClose: 0.4 }]).rows, []);
});
