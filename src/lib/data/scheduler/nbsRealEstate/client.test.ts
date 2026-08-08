import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseNbs70CityPriceArticle, parseNbsPropertyWorkbook } from "./client";

function propertyBook() {
  const rows = [
    ["表1 2026年1—5月份全国房地产开发和销售情况", "", ""],
    ["指标", "绝对量", "同比增长（%）"],
    ["房地产开发投资（亿元）", 30356, -16.2],
    ["  其中：住宅", 23426, -15.6],
    ["房屋施工面积（万平方米）", 548775, -12.3],
    ["  其中：住宅", 380830, -12.6],
    ["新建商品房销售额（亿元）", 29366, -13.5],
    ["商品房待售面积（万平方米）", 77182, -0.4],
    ["房地产开发企业本年到位资金（亿元）", 32756, -19],
    ["  其中：国内贷款", 4875, -28.7],
  ];
  return XLSX.utils.book_new();
}

function fullPriceTable(start: number, thirdHeader = "上年同期=100") {
  const rows: string[][] = [
    ["城市", "环比", "同比", "1-6月平均", "城市", "环比", "同比", "1-6月平均"],
    ["上月=100", "上年同月=100", thirdHeader, "", "上月=100", "上年同月=100", thirdHeader, ""],
  ];
  for (let i = 0; i < 35; i++) rows.push([`城${start + i * 2 + 1}`, "99.7", "97.9", "97.8", `城${start + i * 2 + 2}`, "99.5", "93.9", "93.8"]);
  return `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>`;
}

function testProperty() {
  const book = propertyBook();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["表1 2026年1—5月份全国房地产开发和销售情况", "", ""],
    ["指标", "绝对量", "同比增长（%）"],
    ["房地产开发投资（亿元）", 30356, -16.2],
    ["  其中：住宅", 23426, -15.6],
    ["房屋施工面积（万平方米）", 548775, -12.3],
    ["商品房待售面积（万平方米）", 77182, -0.4],
    ["房地产开发企业本年到位资金（亿元）", 32756, -19],
    ["  其中：国内贷款", 4875, -28.7],
  ]), "表1");
  const parsed = parseNbsPropertyWorkbook(book, "2026年1—5月份全国房地产市场基本情况");
  assert.equal(parsed.size, 12);
  const investment = [...parsed.values()].find((item) => item.label === "房地产：房地产开发投资累计值");
  assert.equal(investment?.unit, "亿元");
  assert.deepEqual(investment?.points[0], { obsDate: new Date(Date.UTC(2026, 4, 1)), value: 30356 });
  assert.ok([...parsed.values()].some((item) => item.label.includes("房地产开发企业本年到位资金：国内贷款同比增长")));
  assert.equal([...parsed.values()].find((item) => item.label.includes("到位资金：国内贷款累计值"))?.unit, "亿元");
  const halfYear = parseNbsPropertyWorkbook(book, "2023年上半年全国房地产市场基本情况");
  assert.equal([...halfYear.values()][0]?.points[0]?.obsDate.toISOString().slice(0, 10), "2023-06-01");
  const annualBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(annualBook, XLSX.utils.aoa_to_sheet([["表1 2023年1—12月份全国房地产开发和销售情况", "", ""], ["指标", "绝对量", "比上年增长（%）"], ["房地产开发投资（亿元）", 110913, -9.6]]), "表1");
  assert.equal([...parseNbsPropertyWorkbook(annualBook, "2023年全国房地产市场基本情况").values()][0]?.points[0]?.value, 110913);
}

function testPrice() {
  const html = `<title>2026年6月份70个大中城市商品住宅销售价格变动情况</title>${fullPriceTable(0)}${fullPriceTable(0)}`;
  const parsed = parseNbs70CityPriceArticle(html);
  assert.equal(parsed.size, 420);
  const newHome = [...parsed.values()].find((item) => item.label === "70城房价：新建商品住宅：城1：环比指数（上月=100）");
  assert.equal(newHome?.points[0]?.value, 99.7);
  assert.ok([...parsed.values()].some((item) => item.label === "70城房价：二手住宅：城70：年内平均指数（上年同期=100）"));
  const base = parseNbs70CityPriceArticle(`<title>2022年12月份70个大中城市商品住宅销售价格变动情况</title>${fullPriceTable(0, "2020年=100")}${fullPriceTable(0, "2020年=100")}`);
  assert.ok([...base.values()].some((item) => item.label === "70城房价：新建商品住宅：城1：定基指数（2020年=100）"));
}

testProperty();
testPrice();
console.log("[nbsRealEstate] parser tests passed");
