import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNvidiaCashCapexInstance, selectCashCapexFilings } from "./secCashFlowSupplement";
const filing = { accession: "0001045810-21-000010", form: "10-K", filedAt: "2021-02-26" };
const context = (id: string, extra = "", cik = "1045810", start = "2020-01-27", end = "2021-01-31") => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">${cik}</xbrli:identifier>${extra}</xbrli:entity><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>`;
const usd = '<xbrli:unit id="USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>';
const point = (id: string, val = "1128000000", unit = "USD", extra = "") => `<nvda:PurchasesOfPropertyAndEquipmentAndIntangibleAssets contextRef="${id}" unitRef="${unit}" decimals="-6" ${extra}>${val}</nvda:PurchasesOfPropertyAndEquipmentAndIntangibleAssets>`;

test("申报现金购置保留完整美元数值及原accn/filed，decimals不是倍数", () => {
  const out = parseNvidiaCashCapexInstance(context("fy") + usd + point("fy"), filing);
  assert.deepEqual(out, [{ start: "2020-01-27", end: "2021-01-31", val: 1128000000, form: "10-K", filed: "2021-02-26", accn: filing.accession }]);
  assert.equal(parseNvidiaCashCapexInstance(context("fy") + usd + point("fy", "0"), filing)[0]?.val, 0);
});

test("排除其他主体、分部、未来期间、瞬时应付款及非美元/复合单位", () => {
  const xml = context("foreign", "", "123") + context("segment", '<xbrli:segment><xbrldi:explicitMember dimension="ProductAxis">GPU</xbrldi:explicitMember></xbrli:segment>')
    + context("future", "", "1045810", "2027-01-01", "2027-12-31")
    + '<context id="instant"><entity><identifier>1045810</identifier></entity><period><instant>2021-01-31</instant></period></context>'
    + context("ok") + usd + '<unit id="CNY"><measure>iso4217:CNY</measure></unit><unit id="mixed"><measure>iso4217:USD</measure><measure>shares</measure></unit>'
    + point("foreign") + point("segment") + point("future") + point("instant") + point("ok", "10", "CNY") + point("ok", "10", "mixed")
    + point("ok", "10", "USD", 'xsi:nil="true"') + point("ok", "-10");
  assert.deepEqual(parseNvidiaCashCapexInstance(xml, filing), []);
  assert.throws(() => parseNvidiaCashCapexInstance(xml, { ...filing, form: "8-K" }), /10-K/);
});

test("同区间重复事实只计一次；冲突金额拒绝而不任意挑选", () => {
  const xml = context("a") + context("b") + usd;
  assert.equal(parseNvidiaCashCapexInstance(xml + point("a") + point("b"), filing).length, 1);
  assert.throws(() => parseNvidiaCashCapexInstance(xml + point("a", "1") + point("b", "2"), filing), /冲突/);
});

test("申报选择仅针对已核实发行人，用标准事实accn覆盖缺口，最多八份", () => {
  const points = Array.from({ length: 12 }, (_, i) => ({ start: `${2010 + i}-02-01`, end: `${2011 + i}-01-31`, val: 1,
    form: "10-K", filed: `${2011 + i}-03-01`, accn: `0001045810-${String(11 + i)}-000010` }));
  const facts = { cik: 1045810, facts: { "us-gaap": { NetIncomeLoss: { units: { USD: points } } } } };
  assert.equal(selectCashCapexFilings(facts, points.map(p => p.end)).length, 8);
  assert.deepEqual(selectCashCapexFilings({ ...facts, cik: 123 }, points.map(p => p.end)), []);
});
