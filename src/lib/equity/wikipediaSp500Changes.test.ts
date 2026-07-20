import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSp500Ticker,
  parseWikipediaDate,
  parseWikipediaSp500Changes,
  rebuildMonthlyMembership,
  sliceTableById,
} from "./wikipediaSp500Changes";

test("parseWikipediaDate：英文月份日期", () => {
  assert.equal(parseWikipediaDate("June 30, 2026"), "2026-06-30");
  assert.equal(parseWikipediaDate("July 1, 1976 "), "1976-07-01");
  assert.equal(parseWikipediaDate("2026-06-30"), null);
  assert.equal(parseWikipediaDate("Juin 30, 2026"), null);
});

test("normalizeSp500Ticker：点转杠 + alias + 复用 ticker 按日期判别", () => {
  assert.equal(normalizeSp500Ticker("BRK.B"), "BRK-B");
  assert.equal(normalizeSp500Ticker("FB"), "META");
  assert.equal(normalizeSp500Ticker("June 30, 2026"), null);
  // UA 在 2016-04-08 前指 A 类股（今 UAA），此后被 C 类复用
  assert.equal(normalizeSp500Ticker("UA", "2014-05-01"), "UAA");
  assert.equal(normalizeSp500Ticker("UA", "2016-04-08"), "UA");
  assert.equal(normalizeSp500Ticker("UA"), "UA");
});

const CHANGES_HTML = `
<table class="wikitable sortable" id="constituents">
<tr><th>Symbol</th><th>Security</th><th>GICS Sector</th><th>Sub</th></tr>
<tr><td>AAA</td><td>Alpha</td><td>Industrials</td><td>X</td></tr>
</table>
<table class="wikitable sortable" id="changes">
<tr><th rowspan="2">Effective Date</th><th colspan="2">Added</th><th colspan="2">Removed</th><th rowspan="2">Reason</th></tr>
<tr><th>Ticker</th><th>Security</th><th>Ticker</th><th>Security</th></tr>
<tr><td>June 22, 2026</td><td>MRVL</td><td><a href="/wiki/M">Marvell</a></td><td>POOL</td><td>Pool Corp</td><td>Market cap change.<sup id="x"><a href="#c">[7]</a></sup></td></tr>
<tr><td>March 3, 2020</td><td>FB</td><td>Facebook</td><td></td><td></td><td>test alias</td></tr>
<tr><td>May 1, 2014</td><td>UA</td><td>Under Armour</td><td>BEAM</td><td>Beam</td><td>acquired</td></tr>
</table>`;

test("sliceTableById + parseWikipediaSp500Changes：只解析 changes 表，不吃 constituents 行", () => {
  const changes = parseWikipediaSp500Changes(CHANGES_HTML);
  assert.equal(changes.length, 3);
  assert.deepEqual(changes[0], {
    date: "2026-06-22",
    addedTicker: "MRVL",
    addedName: "Marvell",
    removedTicker: "POOL",
    removedName: "Pool Corp",
    reason: "Market cap change.",
  });
  // alias：FB → META；复用 ticker：2014 年的 UA → UAA
  assert.equal(changes[1]!.addedTicker, "META");
  assert.equal(changes[2]!.addedTicker, "UAA");
  // constituents 表切片里没有 changes 行
  const cons = sliceTableById(CHANGES_HTML, "constituents")!;
  assert.ok(!cons.includes("MRVL"));
});

test("rebuildMonthlyMembership：反向回放（撤销 add / 撤销 remove）", () => {
  // anchor 2024-07-15 当前名单 [A,B,C]；
  // 2024-06-20：加 C 移 D；2024-03-10：加 B 移 E
  const changes = [
    { date: "2024-06-20", addedTicker: "C", addedName: null, removedTicker: "D", removedName: null, reason: null },
    { date: "2024-03-10", addedTicker: "B", addedName: null, removedTicker: "E", removedName: null, reason: null },
  ];
  const { months, warnings } = rebuildMonthlyMembership(["A", "B", "C"], changes, {
    anchorDate: "2024-07-15",
    fromMonth: "2024-01",
  });
  assert.equal(warnings.length, 0);
  const byDate = new Map(months.map((m) => [m.asOfDate, m.symbols]));
  assert.deepEqual(byDate.get("2024-06-30"), ["A", "B", "C"]); // 6/20 变更已生效
  assert.deepEqual(byDate.get("2024-05-31"), ["A", "B", "D"]); // 撤销 6/20：移 C 回 D
  assert.deepEqual(byDate.get("2024-03-31"), ["A", "B", "D"]);
  assert.deepEqual(byDate.get("2024-02-29"), ["A", "D", "E"]); // 撤销 3/10：移 B 回 E
  assert.deepEqual(byDate.get("2024-01-31"), ["A", "D", "E"]);
  // anchor 未过月末的当月（2024-07-31 > anchor）不产出
  assert.ok(!byDate.has("2024-07-31"));
});

test("rebuildMonthlyMembership：晚于 anchor 的已公告变更被忽略 + 不一致告警", () => {
  const changes = [
    { date: "2024-08-01", addedTicker: "Z", addedName: null, removedTicker: null, removedName: null, reason: null },
    { date: "2024-06-20", addedTicker: "X", addedName: null, removedTicker: null, removedName: null, reason: null },
  ];
  const { months, warnings } = rebuildMonthlyMembership(["A"], changes, {
    anchorDate: "2024-07-15",
    fromMonth: "2024-05",
  });
  // 撤销 6/20 的 add X：X 不在名单 → 告警；Z（未生效）不参与
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!.message, /X/);
  const byDate = new Map(months.map((m) => [m.asOfDate, m.symbols]));
  assert.deepEqual(byDate.get("2024-05-31"), ["A"]);
});
