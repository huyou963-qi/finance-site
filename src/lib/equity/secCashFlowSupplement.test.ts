import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNvidiaCashCapexInstance, parseIssuerCashCapexInstance, selectCashCapexFilings } from "./secCashFlowSupplement";
import { CASH_CAPEX_COMPONENTS, issuerReportedCashCapex } from "./issuerCashCapex";
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

test("非一月财年同样按真实全年区间选择10-K，不用月份猜年报", () => {
  const p = { start: "2024-01-01", end: "2024-12-31", val: 10, form: "10-K", filed: "2025-02-20", accn: "annual" };
  assert.deepEqual(selectCashCapexFilings({ cik: 715957, facts: { "us-gaap": { NetIncomeLoss: { units: { USD: [p] } } } } }, [p.end]), [{ accession: "annual", filedAt: p.filed }]);
});

test("复合现金资本开支只加同申报同期的完整现金分项，保留真零，排除未付/其他主体", () => {
  const tags = CASH_CAPEX_COMPONENTS[1393311]!;
  const body = context("fy", "", "1393311") + context("foreign", "", "999") + usd;
  const values = [239655000, 126757000, 0, 326854000];
  const xml = body + tags.map((tag, i) => `<${tag} contextRef="fy" unitRef="USD" decimals="-3">${values[i]}</${tag}>`).join("")
    + '<psa:CapitalExpendituresToMaintainRealEstateFacilitiesRemainingUnpaidAtPeriodEnd contextRef="fy" unitRef="USD">999</psa:CapitalExpendituresToMaintainRealEstateFacilitiesRemainingUnpaidAtPeriodEnd>'
    + `<${tags[0]} contextRef="foreign" unitRef="USD">999</${tags[0]}>`;
  const parsed = parseIssuerCashCapexInstance(xml, filing, 1393311);
  const facts: { cik: number; facts: Record<string, Record<string, { units: { USD: typeof parsed[string] } }>> } = { cik: 1393311, facts: {} };
  for (const [tag, points] of Object.entries(parsed)) { const [ns, name] = tag.split(":") as [string, string]; (facts.facts[ns] ??= {})[name] = { units: { USD: points } }; }
  assert.equal(issuerReportedCashCapex(facts)[0]?.val, values.reduce((a, b) => a + b, 0));
  facts.facts.psa!.CapitalExpendituresForEnergyEfficiencies!.units.USD = [];
  assert.deepEqual(issuerReportedCashCapex(facts), []);
  assert.throws(() => parseIssuerCashCapexInstance(xml, filing, 123), /未核实/);
});

test("分项不能跨申报/累计期间拼接，也不接受冲突金额", () => {
  const make = (accn: string, val = 3) => ({ start: "2024-01-01", end: "2024-03-31", accn, filed: "2024-05-01", form: "10-Q", val });
  const facts = { cik: 1047862, facts: { "us-gaap": { PaymentsForConstructionInProcess: { units: { USD: [make("one")] } } }, ed: { PaymentsNonUtilityConstructionExpenditures: { units: { USD: [make("two")] } } } } };
  assert.deepEqual(issuerReportedCashCapex(facts), []);
  facts.facts.ed.PaymentsNonUtilityConstructionExpenditures.units.USD = [make("one", 0)];
  assert.equal(issuerReportedCashCapex(facts)[0]?.val, 3);
  facts.facts.ed.PaymentsNonUtilityConstructionExpenditures.units.USD.push(make("one", 2));
  assert.throws(() => issuerReportedCashCapex(facts), /冲突/);
});

test("CMS仅允许现金流表Ongoing维度，额外子公司维度和融资租赁维度均排除", () => {
  const member = '<xbrldi:explicitMember dimension="us-gaap:PropertyPlantAndEquipmentByTypeAxis">cms:OngoingCapitalExpendituresMember</xbrldi:explicitMember>';
  const xml = context("group", member, "811156")
    + context("sub", member + '<xbrldi:explicitMember dimension="dei:LegalEntityAxis">cms:ConsumersEnergyCompanyMember</xbrldi:explicitMember>', "811156")
    + context("lease", member.replace('cms:OngoingCapitalExpendituresMember', 'cms:FinanceLeaseMember'), "811156") + usd
    + ['group', 'sub', 'lease'].map(id => `<us-gaap:PaymentsToAcquirePropertyPlantAndEquipment contextRef="${id}" unitRef="USD">30</us-gaap:PaymentsToAcquirePropertyPlantAndEquipment>`).join('');
  assert.equal(parseIssuerCashCapexInstance(xml, filing, 811156)['us-gaap:PaymentsToAcquirePropertyPlantAndEquipment']?.length, 1);
  assert.deepEqual(parseIssuerCashCapexInstance(xml, filing, 715957), {});
});
