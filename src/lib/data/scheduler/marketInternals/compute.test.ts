import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFrenchDaily, publishBreadth, replacementThrough, trendFlags } from "./compute";

test("每日因子保留百分数；不接受月频表，忽略年度表及缺失哨兵", () => {
  const rows = parseFrenchDaily("notes\n,SMB,Mom\n19950103,1.25,-99.99\n19950104,-999,\n\n1995,4,5", ["SMB", "Mom"]);
  assert.deepEqual([...rows], [["1995-01-03", { SMB: 1.25, Mom: null }], ["1995-01-04", { SMB: null, Mom: null }]]);
  assert.throws(() => parseFrenchDaily(",SMB\n199501,1", ["SMB"]));
  assert.throws(() => parseFrenchDaily(",SMB\n19950230,1", ["SMB"]));
  assert.throws(() => parseFrenchDaily(",SMB\n19950103,bad", ["SMB"]));
  assert.throws(() => parseFrenchDaily(",SMB\n19950103,1\n19950103,2", ["SMB"]));
});

test("均线严格预热，不跨缺失交易日，使用当日价格且无未来数据", () => {
  const rows = Array.from({ length: 201 }, (_, index) => ({ index, close: index + 1 }));
  const flags = trendFlags(rows);
  assert.equal(flags[48].above50, null);
  assert.equal(flags[49].above50, true);
  assert.equal(flags[198].above200, null);
  assert.equal(flags[199].above200, true);
  assert.deepEqual(trendFlags(rows.slice(0, 50)).at(-1), flags[49]);
  assert.equal(trendFlags([...rows.slice(0, 199), rows[200]]).at(-1)!.above200, null);
  assert.equal(trendFlags(rows.map((r) => ({ ...r, close: 5 })))[199].above200, false);
  assert.equal(trendFlags(rows.map((r) => ({ ...r, close: 0.1 })))[199].above200, false);
});

test("95%覆盖门槛与名单规模检查；缺失不当下跌", () => {
  assert.equal(publishBreadth(400, 450, 500), null);
  assert.equal(publishBreadth(0, 0, 0), null);
  assert.ok(Math.abs(publishBreadth(400, 475, 500)! - 100 * 400 / 475) < 1e-6);
  assert.equal(publishBreadth(100, 100, 100), null);
});

test("7月快照回填不能清理10月观测；未取得行情时不能清理", () => {
  assert.equal(replacementThrough("2026-07-19", "2026-10-14"), "2026-07-19");
  assert.equal(replacementThrough("2026-10-16", "2026-10-14"), "2026-10-14");
  assert.equal(replacementThrough("2026-10-16", null), null);
});


test("纽约收盘缓冲后纳入当天，冬夏令时均不提前使用盘中日线", async () => {
  const { closedDailyUpperBound } = await import("./compute");
  for (const [time, expected] of [["2026-10-23T21:59:00Z", "2026-10-23"], ["2026-10-23T22:00:00Z", "2026-10-24"], ["2026-12-01T22:59:00Z", "2026-12-01"], ["2026-12-01T23:00:00Z", "2026-12-02"]]) {
    assert.equal(closedDailyUpperBound(new Date(time)).toISOString().slice(0, 10), expected);
  }
});
