import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseNbsCpiWorkbook } from "./parseWorkbook";

function fixture(removeCore = false) {
  const rows: unknown[][] = [
    ["2026年6月份居民消费价格主要数据", "", "", ""],
    ["", "环比涨跌幅", "同比涨跌幅", ""],
    ["居民消费价格", -0.3, 1.0, ""], ["其中：食品", -0.4, -1.6, ""],
    ["其中：非食品", -0.3, 1.5, ""], ["其中：消费品", -0.6, 1.1, ""], ["其中：服务", 0, 0.8, ""],
    ["一、食品烟酒及在外餐饮", -0.3, -0.8, ""], ["二、衣着", -0.1, 1.4, ""], ["三、居住", 0, -0.3, ""],
    ["四、生活用品及服务", -0.2, 1.3, ""], ["五、交通通信", -1.3, 4.1, ""], ["六、教育文化娱乐", 0, 1.4, ""],
    ["七、医疗保健", 0.2, 2.3, ""], ["八、其他用品及服务", -2.7, 6.6, ""],
    ...(removeCore ? [] : [["其中：不包括食品和能源", -0.1, 1.0, ""]]),
  ];
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "CPI"); return book;
}
test("parses CPI index, yoy and mom", () => {
  const parsed = parseNbsCpiWorkbook(fixture());
  assert.equal(parsed.pointsByInstrument.size, 39);
  assert.equal(parsed.pointsByInstrument.get("nbs_cn_cpi_headline_index")?.[0]?.value, 101);
  assert.equal(parsed.pointsByInstrument.get("nbs_cn_cpi_headline_mom")?.[0]?.value, -0.3);
});
test("throws when a required component disappears", () => assert.throws(() => parseNbsCpiWorkbook(fixture(true)), /不包括食品和能源/));
