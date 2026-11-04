import { test } from "node:test";
import assert from "node:assert/strict";
import { statementSupplementFlows, annualStatementSnapshots, type StatementFact } from "./secStatementSupplement";

const sample = (overrides: Partial<StatementFact> = {}): StatementFact => ({
  cik: 999, tag: "NetCashProvidedByUsedInOperatingActivities", taxonomy: "us-gaap/2024", statement: "CF", label: "Net cash provided by operating activities",
  segments: "", coreg: "", unit: "USD", parenthetical: false, start: "2024-01-01", end: "2024-03-31", val: -10,
  form: "10-Q", accn: "0000000999-24-000001", filed: "2024-05-01", source: "https://www.sec.gov/files/dera/data/financial-statement-data-sets/2024q2.zip", sha256: "a".repeat(64), ...overrides,
});
const flows = (points: StatementFact[], cik = 999) => statementSupplementFlows({ cik, statementSupplement: points });

test("CPT完整年度主营营收来自其已核实的物业收入科目，拒绝管理费与过渡期", () => {
  const point = { start: "2025-01-01", end: "2025-12-31", val: 1573544000, form: "10-K", filed: "2026-02-12" };
  const facts = { cik: 906345, facts: { "us-gaap": {
    OperatingLeaseLeaseIncome: { units: { USD: [point] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [{ ...point, val: 12967000 }] } },
  } } };
  assert.equal(annualStatementSnapshots(facts)[0]?.revenue, 1573544000);
  assert.deepEqual(annualStatementSnapshots({ ...facts, cik: 999 }), []);
  assert.deepEqual(annualStatementSnapshots({ cik: 906345, facts: { "us-gaap": {
    OperatingLeaseLeaseIncome: { units: { USD: [{ ...point, start: "2025-04-01" }, { ...point, val: Infinity }, { ...point, filed: "2025-01-01" }] } },
  } } }), []);
});

test("整年直接值只接受完整财年10-K，不接9个月过渡期和10-Q累计", () => {
  const p = sample({ start: "2024-01-01", end: "2024-12-31", form: "10-K", filed: "2025-02-01", source: "https://www.sec.gov/files/dera/data/financial-statement-data-sets/2025q1.zip" });
  const rows = annualStatementSnapshots({ cik: 999, statementSupplement: [p] });
  assert.equal(rows[0]?.ocf, -10);
  assert.equal(rows[0]?.fiscalDate, "2024-12-31");
  assert.equal(annualStatementSnapshots({ cik: 999, statementSupplement: [{ ...p, start: "2024-04-01" }] }).length, 0);
  assert.equal(annualStatementSnapshots({ cik: 999, statementSupplement: [{ ...p, start: "2024-02-01" }] }).length, 0);
  assert.equal(annualStatementSnapshots({ cik: 999, statementSupplement: [{ ...p, start: "2023-12-24", end: "2024-12-28" }] }).length, 1);
  assert.equal(annualStatementSnapshots({ cik: 999, statementSupplement: [{ ...p, form: "10-Q" }] }).length, 0);
});

test("官方表补充接受真实负OCF/零值，持续经营子项标签不得改名为总额", () => {
  assert.equal(flows([sample()]).ocf[0]?.val, -10);
  assert.equal(flows([sample({ val: 0 })]).ocf[0]?.val, 0);
  assert.equal(flows([sample({ tag: "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations" })]).ocf.length, 0);
  assert.equal(flows([sample({ label: "Net cash from continuing operating activities" })]).ocf.length, 0);
  assert.equal(flows([sample({ label: "Net cash from discontinued operating activities" })]).ocf.length, 0);
});

test("元数据、币种、申报主体、来源归档和维度门禁", () => {
  for (const bad of [{ parenthetical: true as unknown as false }, { unit: "EUR" }, { cik: 123 }, { coreg: "Subsidiary" }, { source: "https://example.com/2024q2.zip" }, { sha256: "bad" }, { filed: "2024-08-01" }, { val: Infinity }, { start: "2024-99-01" }]) {
    assert.throws(() => flows([sample(bad)]));
  }
  assert.equal(flows([sample({ segments: "LegalEntity=Subsidiary;" })]).ocf.length, 0);
  const pred = sample({ cik: 1364742 });
  assert.equal(flows([pred], 2012383).ocf.length, 1);
  assert.throws(() => flows([sample({ ...pred, start: "2024-10-01", end: "2024-12-31", filed: "2025-02-01", source: "https://www.sec.gov/files/dera/data/financial-statement-data-sets/2025q1.zip" })], 2012383));
});

test("地产现金支出须完整同期组成，不含收购、未付额、子公司和跨申报拼接", () => {
  const part = (tag: string, val: number, extra: Partial<StatementFact> = {}) => sample({ cik: 1045609, tag, val, label: "Real estate development", ...extra });
  const a = part("PaymentForPropertyImprovements", 10), b = part("PaymentsToDevelopRealEstateAssets", 20), c = part("PaymentsForLeasingCostsCommissionsAndTenantImprovements", 3);
  assert.equal(flows([a, b, c, part("PaymentsToAcquireRealEstate", 999)], 1045609).capex[0]?.val, 33);
  assert.equal(flows([a, b], 1045609).capex.length, 0);
  assert.equal(flows([a, b, { ...c, accn: "0000000999-24-000002" }], 1045609).capex.length, 0);
  assert.equal(flows([a, b, { ...c, label: "Accrued capital expenditures" }], 1045609).capex.length, 0);
  assert.equal(flows([a, b, { ...c, segments: "LegalEntity=LP;" }], 1045609).capex.length, 0);
  assert.throws(() => flows([a, b, c, { ...c, val: 4 }], 1045609), /冲突/);
});

test("通用现金PPE补充仅接受明确现金购置/资本开支行，拒绝净额、融资和局部改造", () => {
  const p = sample({ tag: "PaymentsToAcquirePropertyPlantAndEquipment", label: "Purchases of property and equipment", val: 10 });
  assert.equal(flows([p]).capex[0]?.val, 10);
  for (const label of ["Purchases of property and equipment, net", "Financed capital expenditures", "Property improvements", "Proceeds from property sales", "Noncash property additions"]) assert.equal(flows([{ ...p, label }]).capex.length, 0);
});

test("DOC和ESS资本开支要求所有必要组成，开发标签的同值别名不重复累加", () => {
  const p = (cik: number, tag: string, val: number) => sample({ cik, tag, val, label: "Development and capital improvements" });
  const doc = [p(765880, "PaymentsForLeasingCostsCommissionsAndTenantImprovements", 3), p(765880, "PaymentsToDevelopRealEstateAssets", 20)];
  assert.equal(flows(doc, 765880).capex[0]?.val, 23);
  assert.equal(flows(doc.slice(1), 765880).capex.length, 0);
  const ess = [p(920522, "RevenueGeneratingCapitalExpenditures", 10), p(920522, "RedevelopmentExpenditures", 5), p(920522, "PaymentsToDevelopRealEstateAssets", 20), p(920522, "PaymentsToAcquireCommercialRealEstate", 20)];
  assert.equal(flows(ess, 920522).capex[0]?.val, 35);
  assert.equal(flows(ess.slice(1), 920522).capex.length, 0);
  assert.equal(flows([...ess, p(920522, "PaymentsToAcquireRealEstate", 1000)], 920522).capex[0]?.val, 35);
});

test("持续与终止经营现金流只在两项明确且同申报同期间时合成总额", () => {
  const a = sample({ tag: "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations", label: "Cash provided by operating activities", val: 10 });
  const b = sample({ tag: "CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations", label: "Cash from discontinued operating activities", val: -3 });
  assert.equal(flows([a, b]).ocf[0]?.val, 7);
  assert.equal(flows([a]).ocf.length, 0);
  assert.equal(flows([a, { ...b, val: 0 }]).ocf[0]?.val, 10);
  assert.equal(flows([a, { ...b, accn: "0000000999-24-000002" }]).ocf.length, 0);
});

test("AEP不混资产收购；ETR旧PPE不替代明确的建设资本支出", () => {
  const p = (cik: number, tag: string, val: number) => sample({ cik, tag, val, label: "Construction expenditures" });
  assert.equal(flows([p(4904, "PaymentsForConstructionInProcess", 20), p(4904, "PaymentsToAcquirePropertyPlantAndEquipment", 3)], 4904).capex[0]?.val, 20);
  const old = (tag: string, val: number) => ({ ...p(65984, tag, val), start: "2016-01-01", end: "2016-03-31", filed: "2016-05-01", source: "https://www.sec.gov/files/dera/data/financial-statement-data-sets/2016q2.zip" });
  assert.equal(flows([old("PaymentsForCapitalImprovements", 20), old("PaymentsToAcquirePropertyPlantAndEquipment", 3)], 65984).capex[0]?.val, 20);
});

test("PSA按披露时期使用现金支付组成，缺前期支付额不把应计建设额当现金", () => {
  const p = (tag: string, val: number) => sample({ cik: 1393311, tag, val, label: "Cash capital expenditures", start: "2019-01-01", end: "2019-03-31", filed: "2019-05-01", source: "https://www.sec.gov/files/dera/data/financial-statement-data-sets/2019q2.zip" });
  const parts = [p("PaymentsForCapitalImprovementsCostsIncurredDuringPeriod", 10), p("PaymentsForCapitalImprovementsCostsIncurredInPreviousPeriods", 2), p("PaymentsForConstructionInProcessCostsIncurredDuringPeriod", 20), p("PaymentsForConstructionInProcessCostsIncurredInPreviousPeriods", 3)];
  assert.equal(flows(parts, 1393311).capex[0]?.val, 35);
  assert.equal(flows(parts.slice(1), 1393311).capex.length, 0);
  assert.equal(flows([...parts, p("ConstructionInProgressExpendituresIncurredButNotYetPaid", 999)], 1393311).capex[0]?.val, 35);
  const early = (tag: string, val: number) => ({ ...p(tag, val), start: "2015-01-01", end: "2015-03-31", filed: "2015-05-01", source: "https://www.sec.gov/files/dera/data/financial-statement-data-sets/2015q2.zip" });
  assert.equal(flows([early("PaymentsForCapitalImprovements", 10), early("PaymentsForConstructionInProcess", 20), early("CapitalExpendituresToMaintainRealEstateFacilites", 999)], 1393311).capex[0]?.val, 30);
});

test("FANG和DTE历史组成随报表变化，不能将旧钻井/公用事业单项当全部现金资本开支", () => {
  const p = (cik: number, tag: string, val: number) => sample({ cik, tag, val, label: "Capital expenditures", start: "2016-01-01", end: "2016-03-31", filed: "2016-05-01", source: "https://www.sec.gov/files/dera/data/financial-statement-data-sets/2016q2.zip" });
  const fang = [p(1539838, "PaymentsToExploreAndDevelopOilAndGasProperties", 10), p(1539838, "PaymentstoExploreandDevelopOilandGasPropertiesRelatedParty", 1), p(1539838, "PaymentsToAcquireOilAndGasEquipment", 3), p(1539838, "PaymentsToAcquireOtherProductiveAssets", 2)];
  assert.equal(flows(fang, 1539838).capex[0]?.val, 16);
  assert.equal(flows(fang.slice(1), 1539838).capex.length, 0);
  const dte = [p(936340, "PlantAndEquipmentExpendituresUtility", 10), p(936340, "PlantAndEquipmentExpendituresNonUtility", 3)];
  assert.equal(flows(dte, 936340).capex[0]?.val, 13);
  assert.equal(flows(dte.slice(1), 936340).capex.length, 0);
  assert.equal(flows([sample({ cik: 1539838, tag: "PaymentsToExploreAndDevelopOilAndGasProperties", val: 20, label: "Drilling, completions, infrastructure and midstream additions to oil and natural gas properties" })], 1539838).capex[0]?.val, 20);
});

test("新增总资本开支别名限发行人；VICI净应付款调整不是资产处置净额", () => {
  for (const [cik, tag] of [[1783879, "PaymentsToAcquireOtherProductiveAssets"], [1140536, "PaymentsToAcquireFixedAssetsAndSoftwareForInternalUse"], [24741, "PaymentsForProceedsFromProductiveAssets"], [882835, "PaymentsToAcquireOtherProductiveAssets"], [879169, "PaymentsToAcquireOtherProductiveAssets"], [827054, "PaymentsToAcquireOtherPropertyPlantAndEquipment"], [10456, "PaymentsToAcquireOtherProductiveAssets"]] as const) {
    const p = sample({ cik, tag, val: 20, label: "Capital expenditures" });
    assert.equal(flows([p], cik).capex[0]?.val, 20);
    assert.equal(flows([{ ...p, cik: 999 }]).capex.length, 0);
  }
  const p = sample({ cik: 1705696, tag: "PaymentsForProceedsFromOtherInvestingActivities", val: 20, label: "Acquisition of property and equipment, net of change in related payables", start: "2018-01-01", end: "2018-03-31", filed: "2018-05-01", source: "https://www.sec.gov/files/dera/data/financial-statement-data-sets/2018q2.zip" });
  assert.equal(flows([p], 1705696).capex[0]?.val, 20);
  assert.equal(flows([{ ...p, label: "Other investing activities, net" }], 1705696).capex.length, 0);
  assert.equal(flows([sample({ cik: 1035002, tag: "PaymentsToAcquirePropertyPlantAndEquipment", val: 20, label: "Capital expenditures" })], 1035002).capex.length, 0);
});

test("URI租赁与非租赁设备、Vertiv软件、自用地产项目不能只保留一个子项", () => {
  const p = (cik: number, tag: string, val: number, label = "Capital expenditures") => sample({ cik, tag, val, label });
  const uri = [p(1067701, "PaymentsToAcquirePropertySubjectToOrAvailableForOperatingLease", 20), p(1067701, "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets", 3)];
  assert.equal(flows(uri, 1067701).capex[0]?.val, 23);
  assert.equal(flows(uri.slice(1), 1067701).capex.length, 0);
  const vrt = [p(1674101, "PaymentsToAcquirePropertyPlantAndEquipment", 10), p(1674101, "PaymentsForSoftware", 2)];
  assert.equal(flows(vrt, 1674101).capex[0]?.val, 12);
  assert.equal(flows(vrt.slice(0, 1), 1674101).capex.length, 0);
  const wday = [p(1327811, "PaymentsToAcquireOtherProductiveAssets", 10, "Capital expenditures, excluding owned real estate projects"), p(1327811, "PaymentsToAcquireAndDevelopRealEstate", 5, "Owned real estate projects")];
  assert.equal(flows(wday, 1327811).capex[0]?.val, 15);
  assert.equal(flows(wday.slice(0, 1), 1327811).capex.length, 0);
  assert.equal(flows([p(1327811, "PaymentsToAcquirePropertyPlantAndEquipment", 18)], 1327811).capex[0]?.val, 18);
});
