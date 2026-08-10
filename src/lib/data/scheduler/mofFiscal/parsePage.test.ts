import assert from "node:assert/strict";
import test from "node:test";
import { parseMofFiscalPage } from "./parsePage";

test("prefers cumulative fiscal expenditure over the current-month paragraph", () => {
  const parsed = parseMofFiscalPage(`
    <h1>2017年4月财政收支情况</h1>
    <p>4月份，全国一般公共预算支出13636亿元，同比增长3.8%。</p>
    <p>1-4月累计，全国一般公共预算支出59553亿元，同比增长16.3%。</p>
    <p>1-4月累计，全国政府性基金预算支出12821亿元，同比下降2.3%。</p>
  `);
  assert.equal(parsed.obsDate.toISOString().slice(0, 10), "2017-04-01");
  assert.equal(parsed.values.get("general_expenditure")?.get("amount")?.value, 59553);
  assert.equal(parsed.values.get("general_expenditure")?.get("yoy")?.value, 16.3);
  assert.equal(parsed.values.get("fund_expenditure")?.get("amount")?.value, 12821);
  assert.equal(parsed.values.get("fund_expenditure")?.get("yoy")?.value, -2.3);
});
