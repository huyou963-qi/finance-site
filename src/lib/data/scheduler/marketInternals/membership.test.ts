import { test } from "node:test";
import assert from "node:assert/strict";
import history from "./sp500History.json";
import { historicalDailyMembership, archiveTicker } from "./membership";

test("历史名单首份快照前留空，按实际生效日切换而非当前成员反推", () => {
  const change = history.changes.find((r) => r.added.length && r.removed.length)!;
  const before = new Date(`${change.date}T00:00:00Z`); before.setUTCDate(before.getUTCDate() - 1);
  const dates = ["1995-01-03", history.firstDate, before.toISOString().slice(0, 10), change.date];
  const result = historicalDailyMembership(dates, [], [], history.lastDate);
  assert.equal(result.has("1995-01-03"), false);
  assert.equal(result.get(history.firstDate)!.size, history.initial.length);
  assert.ok(!result.get(dates[2])!.has(change.added[0].replace(/\./g, "-")));
  assert.ok(result.get(change.date)!.has(change.added[0].replace(/\./g, "-")));
});

test("旧归档代码有独立命名空间，不与复用代码的新公司行情覆盖合并", () => {
  assert.equal(archiveTicker("ALTR"), "WIKI:ALTR");
  assert.equal(archiveTicker("BRK.B"), "WIKI:BRK_B");
});

test("历史快照与当前名单桥接存在无法解释的差异时拒绝发布", () => {
  assert.throws(() => historicalDailyMembership(["2026-09-01"], ["WRONG"], [], "2026-09-01"), /桥接未通过/);
});
