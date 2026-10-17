import assert from "node:assert/strict";
import test from "node:test";
import { parseMofFiscalPage } from "./parsePage";

test("land transfer revenue never consumes the related expenditure suffix", () => {
  const parsed = parseMofFiscalPage(`<h1>2026年1-8月财政收支情况</h1>
    <p>国有土地使用权出让收入13753亿元，同比下降28.6%。</p>
    <p>国有土地使用权出让收入相关支出21786亿元，同比下降18.5%。</p>`);
  assert.equal(parsed.values.get("land_transfer_revenue")?.get("amount")?.value, 13753);
  assert.equal(parsed.values.get("land_transfer_revenue")?.get("yoy")?.value, -28.6);
  assert.equal(parsed.values.get("land_transfer_expenditure")?.get("amount")?.value, 21786);
  const missing = parseMofFiscalPage(`<h1>2026年1-8月财政收支情况</h1>
    <p>国有土地使用权出让收入相关支出21786亿元，同比下降18.5%。</p>`);
  assert.equal(missing.values.has("land_transfer_revenue"), false);
});

test("tax revenue and stamp tax cannot borrow a different tax's suffix", () => {
  const parsed = parseMofFiscalPage(`<h1>2026年1-8月财政收支情况</h1>
    <p>税收收入100亿元，同比增长1%。非税收入20亿元，同比增长2%。</p>
    <p>印花税30亿元，同比增长3%。证券交易印花税10亿元，同比增长4%。</p>`);
  assert.equal(parsed.values.get("tax_revenue")?.get("amount")?.value, 100);
  assert.equal(parsed.values.get("stamp_tax")?.get("amount")?.value, 30);
});

test("recognises original August export refund wording and rich-text whitespace, not import taxes", () => {
  const p = parseMofFiscalPage(`<h1>2026年1-8月财政收支情况</h1>
    <p>进口货物增值税、消费税13258亿元，同比增长12.6%。</p>
    <p>出口 <span>货物退增值税、消费税</span>16472亿元，同比增长4.5%。</p>
    <p>环境保护税232亿元，同比增长18%。</p>`);
  assert.equal(p.obsDate.toISOString().slice(0, 10), "2026-08-01");
  assert.equal(p.values.get("export_tax_refund")?.get("amount")?.value, 16472);
  assert.equal(p.values.get("export_tax_refund")?.get("yoy")?.value, 4.5);
  assert.equal(p.values.get("import_vat_consumption")?.get("amount")?.value, 13258);
});

test("retains old export refund labels and does not fabricate them from other taxes", () => {
  for (const label of ["出口退税", "出口退增值税、消费税"]) {
    const p = parseMofFiscalPage(`<h1>2026年1-7月财政收支情况</h1><p>${label}14800亿元，同比增长5.2%。</p>`);
    assert.equal(p.values.get("export_tax_refund")?.get("amount")?.value, 14800);
  }
  const p = parseMofFiscalPage(`<h1>2026年1-8月财政收支情况</h1><p>进口货物增值税、消费税13258亿元，同比增长12.6%。</p>`);
  assert.equal(p.values.has("export_tax_refund"), false);
});

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
