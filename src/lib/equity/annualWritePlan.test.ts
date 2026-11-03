import { test } from "node:test";
import assert from "node:assert/strict";
import { planAnnualWrite } from "./annualWritePlan";

test("年报按实际日期独立存储，同年两窗口不覆盖，缺项保留已验证值，重复输入零写入", () => {
  const row = { fiscalDate: "2016-05-31", sourceFiledAt: "2016-08-01", revenue: 100, netIncome: null, ocf: 10, capex: 2 };
  assert.equal(planAnnualWrite(row, null)?.period, "FY2016-05-31");
  assert.equal(planAnnualWrite({ ...row, fiscalDate: "2016-12-31" }, null)?.period, "FY2016-12-31");
  const old = { periodType: "FY12", fiscalDate: row.fiscalDate, asOf: row.fiscalDate, revenue: 100, netIncome: 20, ocf: 10, capex: 2 };
  assert.equal(planAnnualWrite(row, old), null);
  assert.equal(planAnnualWrite({ ...row, revenue: 110 }, old)?.netIncome, 20);
  assert.equal(planAnnualWrite({ ...row, capex: 0 }, old)?.capex, 0);
  assert.throws(() => planAnnualWrite(row, { ...old, periodType: "FY" }), /冲突/);
  assert.throws(() => planAnnualWrite(row, { ...old, fiscalDate: "2016-12-31" }), /冲突/);
});
