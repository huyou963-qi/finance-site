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
import { readFileSync } from "node:fs";
function fixture(month: string) { return readFileSync(new URL(`./fixtures/${month}.html`, import.meta.url), "utf8"); }
test("official 2022 refund-adjusted revenue uses nominal amount and natural growth", () => {
  const parsed = parseMofFiscalPage(fixture("2022-04"));
  for (const [key, amount, rate] of [["general_revenue",74293,-4.8],["general_revenue_central",34571,-5.7],["general_revenue_local",39722,-3.9],["tax_revenue",62319,-7.6],["vat",17676,-28.9]] as const) {
    assert.equal(parsed.values.get(key)?.get("amount")?.value,amount,key);
    assert.equal(parsed.values.get(key)?.get("yoy")?.value,rate,key);
  }
});
test("official old reports retain cumulative amounts after budget completion and absolute-change clauses", () => {
  const parsed = parseMofFiscalPage(fixture("2015-04"));
  assert.equal(parsed.values.get("general_expenditure")?.get("amount")?.value,45350);
  assert.equal(parsed.values.get("general_expenditure")?.get("yoy")?.value,13.8);
  const feb = parseMofFiscalPage(fixture("2017-02"));
  assert.equal(feb.values.get("general_expenditure")?.get("amount")?.value,24860);
  assert.equal(feb.values.get("general_expenditure")?.get("yoy")?.value,17.4);
  assert.equal(feb.values.get("fund_revenue")?.get("amount")?.value,7364);
  assert.equal(feb.values.get("fund_expenditure")?.get("yoy")?.value,23.6);
});
test("old government-fund wording and multiples are parsed without inventing monthly points", () => {
  const parsed = parseMofFiscalPage(fixture("2016-04"));
  assert.equal(parsed.values.get("fund_revenue")?.get("amount")?.value,11846);
  assert.equal(parsed.values.get("fund_expenditure")?.get("amount")?.value,8921);
  assert.equal(parsed.values.get("fund_expenditure_local")?.get("amount")?.value,8682);
  const multiple = parseMofFiscalPage(`<h1>2022年4月财政收支情况</h1><p>中央政府性基金预算本级支出956亿元，比上年同期增长3.6倍。</p>`);
  assert.equal(multiple.values.get("fund_expenditure_central")?.get("yoy")?.value,360);
});
test("official latest export refund and land-transfer components match source", () => {
  const p = parseMofFiscalPage(fixture("2026-08"));
  assert.equal(p.values.size,44);
  assert.equal(p.values.get("export_tax_refund")?.get("amount")?.value,16472);
  assert.equal(p.values.get("land_transfer_revenue")?.get("amount")?.value,13753);
});
test("amount-only report does not borrow an adjacent component's growth or adjusted growth", () => {
  const p = parseMofFiscalPage(`<h1>2022年4月财政收支情况</h1><p>全国一般公共预算收入100亿元，扣除留抵退税因素后增长5%。全国一般公共预算支出200亿元，同比增长3%。</p>`);
  assert.equal(p.values.get("general_revenue")?.get("amount")?.value,100);
  assert.equal(p.values.get("general_revenue")?.has("yoy"),false);
  assert.throws(() => parseMofFiscalPage("<h1>2026年财政收支情况</h1><p>网页改版无数据</p>"), /未解析到/);
});
test("tax total aliases cannot consume the residual other-tax category", () => {
  const parsed = parseMofFiscalPage(`<h1>2022年4月财政收支情况</h1><p>车船税、船舶吨税、烟叶税等其他各项税收收入合计405亿元，比上年同期增长4.5%。</p><p>非税收入11974亿元，比上年同期增长13.4%。</p>`);
  assert.equal(parsed.values.has("tax_revenue"),false);
});
test("official 2016 tax total allows revenue-included label and selects cumulative rather than current month or residual taxes", () => {
  const p = parseMofFiscalPage(fixture("2016-03"));
  assert.equal(p.values.get("tax_revenue")?.get("amount")?.value,32954);
  assert.equal(p.values.get("tax_revenue")?.get("yoy")?.value,7.8);
  assert.equal(p.values.get("general_revenue")?.get("amount")?.value,38896);
  const april = parseMofFiscalPage(fixture("2016-04"));
  // April publishes 13782 for April only; its YTD paragraph omits tax total.
  assert.equal(april.values.has("tax_revenue"),false);
  assert.equal(april.values.has("vat"),false);
  assert.equal(april.values.get("general_revenue")?.get("amount")?.value,54419);
});
test("tax total allows 其中 prefix but rejects non-tax and all residual aliases", () => {
  for (const prefix of ["其中", "全国一般公共预算收入中的", "全国", ""]) {
    const p = parseMofFiscalPage(`<h1>2016年3月财政收支情况</h1><p>1-3月累计，${prefix}税收收入32954亿元，同比增长7.8%。</p><p>烟叶税等税收收入199亿元，同比增长9.7%。非税收入5942亿元，同比增长1%。其他各项税收收入合计405亿元，同比增长4%。</p>`);
    assert.equal(p.values.get("tax_revenue")?.get("amount")?.value,32954,prefix);
  }
});
test("official 2018 release changes monthly to cumulative inside one paragraph", () => {
  const p=parseMofFiscalPage(fixture("2018-11"));
  assert.equal(p.values.get("tax_revenue")?.get("amount")?.value,149001);
  assert.equal(p.values.get("tax_revenue")?.get("yoy")?.value,9.5);
  assert.equal(p.values.get("general_revenue")?.get("amount")?.value,172333);
  assert.equal(p.monthlyOnly.has("tax_revenue"),false);
});
test("official sector corporate-tax examples cannot replace national corporate-tax total", () => {
  const p=parseMofFiscalPage(fixture("2015-03"));
  assert.equal(p.values.get("corporate_income_tax")?.get("amount")?.value,6098);
  assert.equal(p.values.get("corporate_income_tax")?.get("yoy")?.value,7.7);
});
test("official near-flat growth is kept precisely and explicit unchanged means zero", () => {
  const p=parseMofFiscalPage(fixture("2025-08"));
  assert.equal(p.values.get("tax_revenue")?.get("yoy")?.value,0.02);
  const flat=parseMofFiscalPage(fixture("2016-02"));
  assert.equal(flat.values.get("land_transfer_revenue")?.get("yoy")?.value,0);
});
test("forensic rejected aliases preserve exact source labels and their own values", () => {
  const p=parseMofFiscalPage(fixture("2016-04"));
  const otherTax=p.wrongComponents.find(item=>item.component==='tax_revenue' && item.sourceLabel.includes('烟叶税等'));
  assert.equal(otherTax?.measures.get('amount')?.value,69);
  assert.equal(otherTax?.measures.get('yoy')?.value,10.3);
  const realEstate=p.wrongComponents.find(item=>item.component==='corporate_income_tax' && item.sourceLabel==='房地产企业所得税');
  assert.equal(realEstate?.measures.get('amount')?.value,321);
  assert.equal(realEstate?.measures.get('yoy')?.value,47.2);
  const financial=p.wrongComponents.find(item=>item.component==='corporate_income_tax' && item.sourceLabel==='金融业企业所得税');
  assert.equal(financial?.measures.get('amount')?.value,941);
  assert.equal(financial?.measures.get('yoy')?.value,-7.5);
  assert.equal(financial?.sourcePeriod,'monthly');
  const local=parseMofFiscalPage(fixture('2015-04')).wrongComponents.find(item=>item.component==='nontax_revenue' && item.sourceLabel==='地方非税收入');
  assert.equal(local?.measures.get('amount')?.value,1398);
  assert.equal(local?.measures.get('yoy')?.value,19.2);
});
