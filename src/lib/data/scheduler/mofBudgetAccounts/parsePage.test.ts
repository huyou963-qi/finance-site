import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOF_BUDGET_ACCOUNTS_SERIES } from "./catalog";
import { findBudgetTableLinks, parseBudgetTable, valueForSeries } from "./parsePage";
const fixture = (file: string) => readFileSync(new URL(`./fixtures/${file}-2025.html`, import.meta.url), "utf8");
const series = (key: string) => { const item = MOF_BUDGET_ACCOUNTS_SERIES.find(x => x.key === key); assert.ok(item); return item; };
test("catalog codes unique and fit database identifiers", () => {
  assert.equal(new Set(MOF_BUDGET_ACCOUNTS_SERIES.map(x => x.code)).size, MOF_BUDGET_ACCOUNTS_SERIES.length);
  assert.ok(MOF_BUDGET_ACCOUNTS_SERIES.every(x => x.code.length <= 64));
});
test("official index identifies all fifteen scope/account tables", () => {
  assert.equal(findBudgetTableLinks(fixture("index"), "https://yss.mof.gov.cn/2025zyjs/", 2025).length, 15);
  assert.throws(() => findBudgetTableLinks(fixture("index").replace(/2025年全国社会保险基金支出决算表/g, "新版未知表"), "https://yss.mof.gov.cn/2025zyjs/", 2025), /目录不完整/);
});
test("2019 three-page archive combines to fifteen tables", () => {
  const html = ["index-2019", "index-2019-page1", "index-2019-page2"].map(file => readFileSync(new URL(`./fixtures/${file}.html`, import.meta.url), "utf8")).join("");
  assert.equal(findBudgetTableLinks(html, "https://yss.mof.gov.cn/2019qgczjs/", 2019).length, 15);
});
test("2018 subtotal heading and separate maternity insurance retained", () => {
  const html = readFileSync(new URL("./fixtures/social-2018.html", import.meta.url), "utf8");
  const rows = parseBudgetTable(html, 2018, "national", "social_revenue");
  assert.equal(valueForSeries(rows, series("national_social_revenue")), 79002.58);
  assert.equal(valueForSeries(rows, series("national_social_maternity_revenue")), 778.05);
});
test("capital actual column is not budget or achievement ratio", () => {
  const rows = parseBudgetTable(fixture("capital"), 2025, "national", "capital_revenue");
  assert.equal(valueForSeries(rows, series("national_capital_revenue")), 8546.39);
  assert.equal(valueForSeries(rows, series("national_capital_profit")), 6088.06);
});
test("capital expenditure includes original transfer-out and carry-out", () => {
  const rows = parseBudgetTable(fixture("capital-expenditure"), 2025, "national", "capital_expenditure");
  assert.equal(valueForSeries(rows, series("national_capital_transfer_out")), 5652.83);
  assert.equal(valueForSeries(rows, series("national_capital_carry_out")), 351.14);
});
test("2018 numbered capital subtotal is distinguished from its same-name child", () => {
  const html = readFileSync(new URL("./fixtures/capital-expenditure-2018.html", import.meta.url), "utf8");
  const rows = parseBudgetTable(html, 2018, "national", "capital_expenditure");
  assert.equal(valueForSeries(rows, series("national_capital_other_expenditure")), 423.51);
});
test("subsidy rows match fund parent; total follows national total heading", () => {
  const rows = parseBudgetTable(fixture("social"), 2025, "national", "social_revenue");
  assert.equal(valueForSeries(rows, series("national_social_revenue")), 127849.52);
  assert.equal(valueForSeries(rows, series("national_social_subsidy")), 28671.07);
  assert.equal(valueForSeries(rows, series("national_social_enterprise_pension_subsidy")), 8729.31);
  assert.equal(valueForSeries(rows, series("national_social_resident_pension_premium")), 3443.15);
});
test("central subtotal excludes national pooling transfers", () => {
  const rows = parseBudgetTable(fixture("central-social"), 2025, "central", "social_revenue");
  assert.equal(valueForSeries(rows, series("central_social_revenue")), 391.86);
});
test("2020 national financing transfer is separate from insurance revenue", () => {
  const html = readFileSync(new URL("./fixtures/social-revenue-2020.html", import.meta.url), "utf8");
  const rows = parseBudgetTable(html, 2020, "national", "social_revenue");
  assert.equal(valueForSeries(rows, series("national_social_revenue")), 75863.50);
  assert.equal(valueForSeries(rows, series("national_social_transfer_in")), 500);
  assert.equal(valueForSeries(rows, series("national_social_revenue_total")), 76363.50);
});
test("2021 official duplicate total typo separated at pooling section", () => {
  const html = readFileSync(new URL("./fixtures/central-social-expenditure-2021.html", import.meta.url), "utf8");
  const rows = parseBudgetTable(html, 2021, "central", "social_expenditure");
  assert.equal(valueForSeries(rows, series("central_social_expenditure")), 1308.47);
  assert.equal(valueForSeries(rows, series("central_social_expenditure_total")), 10602.99);
});
test("2022 original upper-level subsidy complements pooling receipts", () => {
  const html = readFileSync(new URL("./fixtures/local-social-revenue-2022.html", import.meta.url), "utf8");
  const rows = parseBudgetTable(html, 2022, "local", "social_revenue");
  assert.equal(valueForSeries(rows, series("local_social_upper_subsidy")), 82);
  assert.equal(valueForSeries(rows, series("local_social_revenue_total")), 104620.99);
});
test("negative fund annual balance preserved", () => {
  const rows = parseBudgetTable(fixture("balance"), 2025, "national", "social_balance");
  assert.equal(valueForSeries(rows, series("national_social_unemployment_balance")), -90.60);
  assert.equal(valueForSeries(rows, series("national_social_accumulated_balance")), 162093.96);
});
test("wrong scope, missing column and missing unit fail closed", () => {
  assert.throws(() => parseBudgetTable(fixture("capital"), 2025, "local", "capital_revenue"), /标题/);
  assert.throws(() => parseBudgetTable(fixture("capital").replace(/决算数/g, "错误数"), 2025, "national", "capital_revenue"), /决算数列/);
  assert.throws(() => parseBudgetTable(fixture("capital").replace(/亿元/g, "万元"), 2025, "national", "capital_revenue"), /亿元/);
});
