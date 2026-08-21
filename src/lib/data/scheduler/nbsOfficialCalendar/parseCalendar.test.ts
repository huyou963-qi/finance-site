import assert from "node:assert/strict";
import test from "node:test";
import {
  nextNbsOfficialReleaseForPackage,
  parseNbsOfficialCalendarPage,
} from "./parseCalendar";

const HTML = `
<h1>2026年国家统计局主要统计信息发布日程表</h1>
<table>
  <tr><th>序号</th><th>内容</th><th>1月</th><th>2月</th><th>3月</th><th>4月</th><th>5月</th><th>6月</th><th>7月</th><th>8月</th><th>9月</th><th>10月</th><th>11月</th><th>12月</th></tr>
  <tr><td rowspan="2">1</td><td rowspan="2">国民经济运行情况</td><td>19/一</td><td rowspan="2">……</td><td>16/一</td><td>16/四</td><td>18/一</td><td>16/二</td><td>15/三</td><td>17/一</td><td>15/二</td><td>19/一</td><td>16/一</td><td>15/二</td></tr>
  <tr><td>10:00</td><td>10:00</td><td>10:00</td><td>10:00</td><td>10:00</td><td>15:00</td><td>10:00</td><td>10:00</td><td>10:00</td><td>10:00</td><td>10:00</td></tr>
  <tr><td rowspan="2">4</td><td rowspan="2">采购经理指数月度报告</td><td>31/六</td><td rowspan="2">……</td><td>4/三<sup>注5</sup> 31/二</td><td>30/四</td><td>31/日</td><td>30/二</td><td>31/五</td><td>31/一</td><td>30/三</td><td>31/六</td><td>30/一</td><td>31/四</td></tr>
  <tr><td>9:30</td><td>9:30 9:30</td><td>9:30</td><td>9:30</td><td>9:30</td><td>9:30</td><td>9:30</td><td>9:30</td><td>9:30</td><td>9:30</td><td>9:30</td></tr>
  <tr><td rowspan="2">5</td><td rowspan="2">居民消费价格指数月度报告</td><td>9/五</td><td>11/三</td><td>9/一</td><td>10/五</td><td>11/一</td><td>10/三</td><td>9/四</td><td>9/日</td><td>9/三</td><td>14/三</td><td>9/一</td><td>9/三</td></tr>
  <tr>${"<td>9:30</td>".repeat(12)}</tr>
</table>`;

test("parses official NBS Beijing dates, rowspans, and two PMI releases in March", () => {
  const releases = parseNbsOfficialCalendarPage(HTML);
  const pmi = releases.filter((release) => release.title === "采购经理指数月度报告");
  assert.equal(pmi.length, 12);
  assert.deepEqual(
    pmi.filter((release) => release.releaseMonth === 3).map((release) => release.releaseDay),
    [4, 31],
  );
  const julyMacro = releases.find(
    (release) => release.title === "国民经济运行情况" && release.releaseMonth === 7,
  );
  assert.equal(julyMacro?.releaseAt.toISOString(), "2026-07-15T07:00:00.000Z");
});

test("maps GDP only to quarterly/annual macro releases", () => {
  const releases = parseNbsOfficialCalendarPage(HTML);
  const next = nextNbsOfficialReleaseForPackage(
    releases,
    "cn.nbs.gdp",
    new Date("2026-08-21T00:00:00.000Z"),
  );
  assert.equal(next?.releaseAt.toISOString(), "2026-10-19T02:00:00.000Z");
});
