import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseNbsPpiWorkbook } from "./parseWorkbook";
function priceFixture(extra: unknown[][] = []) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["2026年9月工业生产者价格主要数据"], [null, "环比涨跌幅（%）", "同比涨跌幅（%）", "1—9月同比"],
    ["一、工业生产者出厂价格", 1.2, 5, 2.3], ["生产资料", 1.4, 6.5, 3.3], ["生活资料", .1, -.1, -1],
    ["二、工业生产者购进价格", 1.2, 6.9, 3.6], ["农副产品类", .1, -.4, -1.6],
    ["三、主要行业出厂价格"], ["农副食品加工业", .5, -.9, -1.4],
    ["酒、饮料和精制茶制造业", -.1, -5.3, -3.6], ...extra,
  ]), "Sheet1");
  return wb;
}
test("PPI latest month, MoM/YoY and explicit beverage alias; never YTD/input prices", () => {
  const p = parseNbsPpiWorkbook(priceFixture());
  assert.equal(p.sourceLatestObsDate.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(p.pointsByInstrument.get("nbs_cn_ppi_headline_yoy")?.[0]?.value, 5);
  assert.equal(p.pointsByInstrument.get("nbs_cn_ppi_agri_food_yoy")?.[0]?.value, -.9);
  assert.equal(p.pointsByInstrument.get("nbs_cn_ppi_agri_food_index")?.[0]?.value, 99.1);
  assert.equal(p.pointsByInstrument.get("nbs_cn_ppi_beverage_mom")?.[0]?.value, -.1);
  assert.equal(p.pointsByInstrument.get("nbs_cn_ppi_beverage_yoy")?.[0]?.value, -5.3);
  assert.ok(!p.pointsByInstrument.has("nbs_cn_ppi_leather_mom"));
});
test("PPI blank/duplicate/malformed rows fail instead of fabricated zero", () => {
  assert.throws(() => parseNbsPpiWorkbook(priceFixture([["纺织业", null, 1, 3]])), /空值/);
  assert.throws(() => parseNbsPpiWorkbook(priceFixture([["农副食品加工业", 1, 2, 3]])), /重复行/);
  const wb = priceFixture(); wb.Sheets.Sheet1!.B2.v = "同比涨跌幅";
  assert.throws(() => parseNbsPpiWorkbook(wb), /表头/);
});
