import assert from "node:assert/strict";
import test from "node:test";
import { parsePbcMonetaryPage } from "./parsePbcMonetaryPage";

test("parses PBC financial statistics balances, yoy and cumulative flow", () => {
  const values = parsePbcMonetaryPage(`<title>2024年7月金融统计数据报告</title><p>7月末，广义货币(M2)余额303.31万亿元,同比增长6.3%。狭义货币(M1)余额63.23万亿元,同比下降6.6%。流通中货币(M0)余额11.88万亿元,同比增长12%。前七个月人民币贷款增加13.53万亿元。其中，住户贷款增加1.25万亿元，企（事）业单位贷款增加11.13万亿元。</p>`);
  assert.equal(values.get("m2_amount")?.value, 3_033_100);
  assert.equal(values.get("m1_yoy")?.value, -6.6);
  assert.equal(values.get("rmb_loan_cumulative")?.value, 135_300);
  assert.equal(values.get("corporate_loan_cumulative")?.value, 111_300);
  assert.equal(values.get("m2_amount")?.obsDate.toISOString().slice(0, 10), "2024-07-01");
});

test("fails loudly when no official indicator can be identified", () => {
  assert.throws(() => parsePbcMonetaryPage("<title>2024年7月公告</title><p>无统计内容</p>"));
});

test("parses legacy PBC phrasing with whitespace and 各项贷款", () => {
  const values = parsePbcMonetaryPage(`<title>2010年一季度金融统计数据报告</title>
    <p>3 月末，广义货币供应量 (M2) 余额为 65 万亿元，同比增长 22.5%。
    金融机构人民币各项贷款余额 43.2 万亿元，同比增长 20%。
    一季度人民币各项贷款增加 2.6 万亿元。</p>`);
  assert.equal(values.get("m2_amount")?.value, 650_000);
  assert.equal(values.get("m2_yoy")?.value, 22.5);
  assert.equal(values.get("rmb_loan_amount")?.value, 432_000);
  assert.equal(values.get("rmb_loan_cumulative")?.value, 26_000);
  assert.equal(values.get("m2_amount")?.obsDate.toISOString().slice(0, 10), "2010-03-01");
});

test("parses text extracted from an official PDF attachment", () => {
  const values = parsePbcMonetaryPage(`<title>2011年5月金融统计数据报告</title>
    <p>5月末，广义货币(M2)余额76.34万亿元,同比增长15.1%。
    狭义货币(M1)余额26.93万亿元,同比增长12.7%。
    流通中货币(M0)余额4.46万亿元,同比增长14.4%。
    前五个月人民币贷款增加3.58万亿元。</p>`);
  assert.equal(values.get("m2_amount")?.value, 763_400);
  assert.equal(values.get("rmb_loan_cumulative")?.value, 35_800);
  assert.equal(values.get("m2_amount")?.obsDate.toISOString().slice(0, 10), "2011-05-01");
});
