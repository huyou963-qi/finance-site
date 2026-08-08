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
