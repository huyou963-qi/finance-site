import test from "node:test";
import assert from "node:assert/strict";
import { parseMofFiscalPage } from "./parsePage";
const html = "<h2>2026年1-5月财政收支情况</h2>1-5月，全国一般公共预算收入100465亿元，同比增长4%。1-5月，全国政府性基金预算收入12518亿元，同比下降19.2%。";
test("财政部月报解析累计金额和同比", () => { const r = parseMofFiscalPage(html); assert.equal(r.obsDate.toISOString().slice(0, 10), "2026-05-01"); assert.equal(r.values.get("general_revenue")?.get("amount")?.value, 100465); assert.equal(r.values.get("fund_revenue")?.get("yoy")?.value, -19.2); });
test("财政部月报无日期时中止", () => assert.throws(() => parseMofFiscalPage("全国一般公共预算收入100亿元，同比增长1%")));
