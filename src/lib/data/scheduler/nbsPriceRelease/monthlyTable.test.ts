import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseIndustrialRelease } from "../nbsIndustrial/parseRelease";
import { parseRetailRelease } from "../nbsRetail/parseRelease";
import { mergeNewReleasePoint, parseMonthlyReleaseTable } from "./monthlyTable";
import { parsePriceArticleUrl } from "./client";
import { parseGdpCumulativeRelease } from "../nbsGdp/parseRelease";

const book = (rows: unknown[][]) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "表");
  return workbook;
};
test("industrial attachment selects native monthly/cumulative growth, not product output", () => {
  const workbook = book([
    ["", "2026年9月份规模以上工业生产主要数据"], ["", "指标", "9月", "", "1—9月"],
    ["", "", "绝对量", "同比增长（%）", "绝对量", "同比增长（%）"],
    ["", "规模以上工业增加值", "…", 5.5, "…", 5.3],
    ["", "其中：国有控股企业", "…", 3.6, "…", 3.8],
    ["", "橡胶和塑料制品业", "…", 3.5, "…", 5.8],
    ["", "橡胶（万吨）", 9, 1, 80, 2],
  ]);
  const parsed = parseIndustrialRelease(workbook);
  assert.equal(parsed.get("nbs_cn_industrial_state_owned_yoy")?.value, 3.6);
  assert.equal(parsed.get("nbs_cn_industrial_rubber_plastic_cyoy")?.value, 5.8);
  assert.equal(parsed.get("nbs_cn_industrial_rubber_plastic_yoy")?.obsDate.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.throws(() => parseMonthlyReleaseTable(workbook, "RETAIL"), /title/);
});
test("retail preserves attachment precision and exact goods definition; blanks are not zero", () => {
  const workbook = book([
    ["2026年9月份社会消费品零售总额主要数据"], ["指标", "9月", "", "1—9月"],
    ["", "绝对量", "同比增长", "绝对量", "同比增长"],
    ["社会消费品零售总额", 42433, 1.1, 370001, 1.1],
    ["城镇", 36077, 0.8, 319820, 0.9], ["乡村", 6356, 2.7, 50181, 2.3],
    ["金银珠宝类", 258.1, -9.6, 2620.4, -2.4],
  ]);
  assert.equal(parseRetailRelease(workbook, {}, "nbs_cn_retail_u_current")?.value, 36077);
  assert.equal(parseRetailRelease(workbook, { displayName: "限上商品零售：金银珠宝类累计值" }, "nbs_cn_retail_goods_e43cfafd_cum")?.value, 2620.4);
  assert.equal(parseRetailRelease(workbook, { displayName: "限上商品零售：金银珠宝类同比增长" }, "nbs_cn_retail_goods_e43cfafd_cum"), undefined);
  assert.equal(parseRetailRelease(workbook, {}, "unregistered"), undefined);
});
test("release only fills a newer month; API same-month revisions win and input is sorted", () => {
  const p = (month: number, value: number) => ({ obsDate: new Date(Date.UTC(2026, month - 1, 1)), value });
  assert.deepEqual(mergeNewReleasePoint([p(8, 2), p(7, 1)], p(9, 3)).map(p => p.value), [1, 2, 3]);
  assert.equal(mergeNewReleasePoint([p(9, 4)], p(9, 3)).at(-1)?.value, 4);
  assert.equal(mergeNewReleasePoint([], p(9, 3))[0]?.value, 3);
});
test("GDP uses only explicitly published cumulative nominal and real growth columns", () => {
  const html = `<title>前三季度经济运行总体平稳 - 国家统计局</title>（2026年10月19日）<table>
    <tr><td>指标</td><td>9月</td><td></td><td>1—9月</td></tr>
    <tr><td></td><td>绝对量</td><td>同比增长</td><td>绝对量</td><td>同比增长</td></tr>
    <tr><td>一、国内生产总值（亿元）</td><td>375367</td><td>4.5</td><td>1071071</td><td>4.6</td></tr>
    <tr><td>第一产业</td><td>27472</td><td>3.6</td><td>58994</td><td>3.7</td></tr>
    <tr><td>第二产业</td><td>133349</td><td>3.4</td><td>383822</td><td>3.8</td></tr>
    <tr><td>第三产业</td><td>214546</td><td>5.2</td><td>628255</td><td>5.2</td></tr></table>`;
  const parsed = parseGdpCumulativeRelease(html);
  assert.equal(parsed.size, 6);
  assert.equal(parsed.get("nbs_cn_gdp_q_primary_reaccyoy")?.value, 3.7);
  assert.equal(parsed.get("nbs_cn_gdp_q_tertiary_nomcum")?.value, 628255);
  assert.equal(parsed.get("nbs_cn_gdp_q_primary_nomcum")?.obsDate.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.throws(() => parseGdpCumulativeRelease(html.replace("58994", "…")), /累计列/);
  assert.throws(() => parseGdpCumulativeRelease(html.replace("1—9月", "1—8月")), /缺少/);
});
test("release discovery distinguishes the official headline from interpretation articles", () => {
  const html = '<a href="analysis.html">统计师解读9月份工业生产</a><a href="industry.html">2026年9月份规模以上工业增加值增长5.5%</a><a href="retail.html">2026年1—9月份社会消费品零售总额增长1.1%</a><a href="gdp.html">前三季度经济运行总体平稳</a>';
  assert.ok(parsePriceArticleUrl(html, "INDUSTRIAL").endsWith("industry.html"));
  assert.ok(parsePriceArticleUrl(html, "RETAIL").endsWith("retail.html"));
  assert.ok(parsePriceArticleUrl(html, "GDP").endsWith("gdp.html"));
});
