import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarQuarterLabel,
  extractQuarterlyFundamentals,
  quarterlyFlowSeries,
  scaleFactorsBackward,
  mergeExxonPredecessorFacts,
  legacyPartialRevenueForAudit,
} from "./secFundamentals";
import { computeTtm, computeValuation, type QuarterFundamentalRow } from "./ttm";

test("Hasbro 2025年起申报的Revenues是未抵销分部间收入的分部合计，季度营收取合同收入；更早同口径点仍可补历史", () => {
  const p = (start: string, end: string, val: number, filed: string) => ({ start, end, val, form: "10-Q", filed });
  const facts = { cik: 46080, facts: { "us-gaap": {
    Revenues: { units: { USD: [p("2017-01-02", "2017-04-02", 849.7, "2017-04-27"), p("2017-04-03", "2017-07-02", 972.5, "2017-07-27"),
      p("2018-01-01", "2018-04-01", 716.3, "2018-04-26"), p("2018-04-02", "2018-07-01", 904.5, "2018-07-26"),
      p("2025-06-30", "2025-09-28", 1590.1, "2025-11-05")] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [p("2018-01-01", "2018-04-01", 716.3, "2019-04-25"),
      p("2018-04-02", "2018-07-01", 904.5, "2019-07-25"), p("2025-06-30", "2025-09-28", 1387.5, "2025-11-05"),
      p("2026-06-29", "2026-09-27", 1595.3, "2026-10-29")] } },
  } } };
  const rev = (f: typeof facts) => Object.fromEntries(extractQuarterlyFundamentals(f, { maxQuarters: 40 }).map(q => [q.period, q.revenue]));
  assert.equal(rev(facts)["2025Q3"], 1387.5);
  assert.equal(rev(facts)["2026Q3"], 1595.3);
  assert.equal(rev(facts)["2017Q2"], 972.5);
  const contract = facts.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.filter(q => q.end < "2026-01-01");
  const beforeQ3 = { cik: 46080, facts: { "us-gaap": { ...facts.facts["us-gaap"], RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: contract } } } } };
  assert.equal(rev(beforeQ3)["2025Q3"], 1387.5);
  assert.equal(rev({ ...beforeQ3, cik: 999 })["2025Q3"], 1590.1);
});

test("CPT主营营收取Property revenues，不取其他收入中的管理费；其他发行人不泛用租赁标签", () => {
  const point = { start: "2025-01-01", end: "2025-03-31", val: 400, form: "10-Q", filed: "2025-05-01" };
  const facts = { cik: 906345, facts: { "us-gaap": {
    OperatingLeaseLeaseIncome: { units: { USD: [point] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [{ ...point, val: 3 }] } },
  } } };
  assert.equal(extractQuarterlyFundamentals(facts)[0]?.revenue, 400);
  assert.equal(extractQuarterlyFundamentals({ cik: 906345, facts: { "us-gaap": {
    RealEstateRevenueNet: { units: { USD: [{ ...point, start: "2016-01-01", end: "2016-03-31", filed: "2016-05-01" }] } },
  } } })[0]?.revenue, 400);
  assert.ok(legacyPartialRevenueForAudit(facts).some(p => p.val === 3));
  assert.equal(extractQuarterlyFundamentals({ ...facts, cik: 999 })[0]?.revenue, 3);
  assert.deepEqual(legacyPartialRevenueForAudit({ ...facts, cik: 999 }), []);
  assert.equal(extractQuarterlyFundamentals({ cik: 906345, facts: { "us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: facts.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax,
  } } })[0]?.revenue, undefined);
});

test("缺失营收不吞掉已披露季度净利润和现金流，也不把现金流值充作营收", () => {
  const point = { start: "2024-01-01", end: "2024-03-31", val: 10, form: "10-Q", filed: "2024-05-01" };
  const facts = { facts: { "us-gaap": {
    NetIncomeLoss: { units: { USD: [point] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [{ ...point, val: -3 }] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [{ ...point, val: 2 }] } },
  } } };
  const row = extractQuarterlyFundamentals(facts)[0]!;
  assert.equal(row.period, "2024Q1");
  assert.equal(row.revenue, null); assert.equal(row.revenueYoY, null);
  assert.equal(row.grossMargin, null); assert.equal(row.netIncome, 10);
  assert.equal(row.ocf, -3); assert.equal(row.capex, 2);
});

test("经营现金流明确总额优先，持续及终止经营只在同申报同时存在时相加", () => {
  const p = { start: "2024-01-01", end: "2024-03-31", val: 10, form: "10-Q", filed: "2024-05-01", accn: "same" };
  const facts = { facts: { "us-gaap": {
    Revenues: { units: { USD: [{ ...p, val: 100 }] } },
    NetCashProvidedByUsedInOperatingActivitiesContinuingOperations: { units: { USD: [p] } },
    CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations: { units: { USD: [{ ...p, val: -3 }] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [] as typeof p[] } },
  } } };
  assert.equal(extractQuarterlyFundamentals(facts)[0]?.ocf, 7);
  facts.facts["us-gaap"].NetCashProvidedByUsedInOperatingActivities.units.USD = [{ ...p, val: 8 }];
  assert.equal(extractQuarterlyFundamentals(facts)[0]?.ocf, 8);
});

function dur(start: string, end: string, val: number, form = "10-Q", filed = "2099-01-01") {
  return { start, end, val, form, filed };
}

function inst(end: string, val: number, form = "10-Q", filed = "2099-01-01") {
  return { end, val, form, filed };
}

test("归母净利润缺口用同期合并净利润减明确少数股东损益，原值及缺项保持", () => {
  const points = [dur("2024-01-01", "2024-03-31", 200), dur("2024-04-01", "2024-06-30", 210), dur("2024-07-01", "2024-09-30", 220)].map(p => ({ ...p, accn: "same" }));
  const facts = { facts: { "us-gaap": {
    Revenues: { units: { USD: points.map(p => ({ ...p, val: 1000 })) } },
    NetIncomeLoss: { units: { USD: [{ ...points[2]!, val: 150 }] } },
    ProfitLoss: { units: { USD: points } },
    NetIncomeLossAttributableToNoncontrollingInterest: { units: { USD: [{ ...points[0]!, val: -10 }, { ...points[2]!, val: 20 }] } },
  } } };
  assert.deepEqual(extractQuarterlyFundamentals(facts).map(r => r.netIncome), [210, null, 150]);
  facts.facts["us-gaap"].NetIncomeLossAttributableToNoncontrollingInterest.units.USD = [{ ...points[0]!, val: 10, filed: "2098-01-01" }];
  assert.equal(extractQuarterlyFundamentals(facts)[0]?.netIncome, null);
});

test("PM旧含税营收按同申报扣除消费税，须与现代净营收重叠验证，缺税不补", () => {
  const points = [dur("2016-10-01", "2016-12-31", 300), dur("2017-01-01", "2017-03-31", 310), dur("2017-04-01", "2017-06-30", 320)].map(p => ({ ...p, accn: "same" }));
  const facts = { cik: 1413329, facts: { "us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [...points.slice(1).map(p => ({ ...p, val: p.val - 200 })), { ...dur("2024-01-01", "2024-03-31", 400), accn: "new" }] } },
    SalesRevenueNet: { units: { USD: points } },
    ExciseAndSalesTaxes: { units: { USD: points.map(p => ({ ...p, val: 200 })) } },
  } } };
  assert.equal(extractQuarterlyFundamentals(facts)[0]?.revenue, 100);
  assert.equal(extractQuarterlyFundamentals({ ...facts, cik: 999 })[0]?.period, "2017Q1");
  facts.facts["us-gaap"].ExciseAndSalesTaxes.units.USD = points.slice(1).map(p => ({ ...p, val: 200 }));
  assert.equal(extractQuarterlyFundamentals(facts)[0]?.period, "2017Q1");
});

test("发行人旧版总营收接回历史骨架及三表，子项与不一致重叠不能补入", () => {
  for (const [cik, tag] of [[1035002, "RefiningAndMarketingRevenue"], [1045609, "RealEstateRevenueNet"], [1289490, "RealEstateRevenueNet"], [1164727, "RevenueMineralSales"]] as const) {
    const points = [dur("2016-10-01", "2016-12-31", 90), dur("2017-01-01", "2017-03-31", 100), dur("2017-04-01", "2017-06-30", 110)];
    const facts = { cik, facts: { "us-gaap": {
      Revenues: { units: { USD: points.slice(1) } },
      [tag]: { units: { USD: points } },
      NetIncomeLoss: { units: { USD: [{ ...points[0]!, val: 15 }] } },
      NetCashProvidedByUsedInOperatingActivities: { units: { USD: [{ ...points[0]!, val: 20 }] } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [{ ...points[0]!, val: 5 }] } },
    } } };
    const old = extractQuarterlyFundamentals(facts)[0]!;
    assert.equal(old.period, "2016Q4");
    assert.deepEqual([old.revenue, old.netIncome, old.ocf, old.capex], [90, 15, 20, cik === 1045609 ? null : 5]);
    assert.equal(extractQuarterlyFundamentals({ ...facts, cik: 999 })[0]?.revenue, null);
    facts.facts["us-gaap"][tag]!.units.USD = points.slice(0, 2);
    assert.equal(extractQuarterlyFundamentals(facts)[0]?.revenue, null);
    facts.facts["us-gaap"][tag]!.units.USD = points.map(p => ({ ...p, val: p.val * 3 }));
    assert.equal(extractQuarterlyFundamentals(facts)[0]?.revenue, null);
  }
});

test("Diamondback 2022起开发支出计入资本开支，不含单独列示的油气资产收购，2021及以前的钻井子项不单列", () => {
  const p = (start: string, end: string, val: number) => ({ start, end, val, form: "10-Q", filed: "2026-02-25" });
  const facts = { cik: 1539838, facts: { "us-gaap": {
    Revenues: { units: { USD: [p("2021-01-01", "2021-03-31", 800), p("2025-01-01", "2025-03-31", 1000)] } },
    PaymentsToExploreAndDevelopOilAndGasProperties: { units: { USD: [p("2021-01-01", "2021-03-31", 400), p("2025-01-01", "2025-03-31", 942)] } },
    PaymentsToAcquireOilAndGasProperty: { units: { USD: [p("2025-01-01", "2025-03-31", 750)] } },
  } } };
  const rows = Object.fromEntries(extractQuarterlyFundamentals(facts, { maxQuarters: 40 }).map(q => [q.period, q.capex]));
  assert.equal(rows["2025Q1"], 942);
  assert.equal(rows["2021Q1"], null);
  const other = extractQuarterlyFundamentals({ ...facts, cik: 999 }, { maxQuarters: 40 });
  assert.equal(other.find(q => q.period === "2025Q1")?.capex ?? null, null);
});

test("ADP/WEC/DLR总现金购置别名严格限发行人，不推广Other或开发子项到其他公司", () => {
  for (const [cik, tag] of [[8670, "PaymentsToAcquireOtherPropertyPlantAndEquipment"], [783325, "PaymentsToAcquireOtherPropertyPlantAndEquipment"], [1297996, "PaymentsToDevelopRealEstateAssets"]] as const) {
    const p = dur("2024-01-01", "2024-03-31", 25);
    const facts = { cik, facts: { "us-gaap": { Revenues: { units: { USD: [{ ...p, val: 100 }] } }, [tag]: { units: { USD: [p] } } } } };
    assert.equal(extractQuarterlyFundamentals(facts)[0]?.capex, 25);
    assert.equal(extractQuarterlyFundamentals({ ...facts, cik: 999 })[0]?.capex, null);
  }
});

test("WEC已核实的同一现金流总额使用年报减九个月累计，未知发行人仍禁止无重叠跨tag", () => {
  const q = [dur("2024-01-01", "2024-03-31", 10), dur("2024-01-01", "2024-06-30", 25), dur("2024-01-01", "2024-09-30", 45)];
  const facts = { cik: 783325, facts: { "us-gaap": { Revenues: { units: { USD: [dur("2024-10-01", "2024-12-31", 100)] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: q } },
    PaymentsToAcquireOtherPropertyPlantAndEquipment: { units: { USD: [dur("2024-01-01", "2024-12-31", 70, "10-K")] } },
  } } };
  assert.equal(extractQuarterlyFundamentals(facts).find(r => r.period === "2024Q4")?.capex, 25);
  assert.equal(extractQuarterlyFundamentals({ ...facts, cik: 999 }).find(r => r.period === "2024Q4")?.capex, null);
  const old = dur("2019-01-01", "2019-12-31", 200, "10-K");
  facts.facts["us-gaap"].PaymentsToAcquirePropertyPlantAndEquipment.units.USD.push(old);
  facts.facts["us-gaap"].PaymentsToAcquireOtherPropertyPlantAndEquipment.units.USD.push({ ...old, val: 150 });
  assert.equal(extractQuarterlyFundamentals(facts).find(r => r.period === "2024Q4")?.capex, 25);
  facts.facts["us-gaap"].PaymentsToAcquireOtherPropertyPlantAndEquipment.units.USD.push({ ...q[0]!, val: 11 });
  assert.throws(() => extractQuarterlyFundamentals(facts), /冲突/);
});

test("Verizon OtherProductive 仅在已核实 2019 年后作资本开支，旧年代其他投资不混入", () => {
  const old = dur("2015-01-01", "2015-03-31", 100);
  const overlap = [dur("2019-01-01", "2019-03-31", 110), dur("2019-04-01", "2019-06-30", 120), dur("2019-07-01", "2019-09-30", 130)];
  const recent = dur("2024-10-01", "2024-12-31", 140);
  const facts = (cik: number) => ({ cik, facts: { "us-gaap": {
    Revenues: { units: { USD: [old, ...overlap, recent].map(p => ({ ...p, val: 1000 })) } },
    PaymentsToAcquireProductiveAssets: { units: { USD: [old, ...overlap] } },
    PaymentsToAcquireOtherProductiveAssets: { units: { USD: [{ ...old, val: 2 }, ...overlap, recent] } },
  } } });
  const rows = extractQuarterlyFundamentals(facts(732712), { maxQuarters: 48 });
  assert.equal(rows.find(r => r.period === "2015Q1")?.capex, 100);
  assert.equal(rows.find(r => r.period === "2024Q4")?.capex, 140);
  assert.equal(extractQuarterlyFundamentals(facts(999), { maxQuarters: 48 }).find(r => r.period === "2024Q4")?.capex, null);
});

test("EOG 合并两项 PPE additions，缺任一项留空，排除收购与未付资本开支", () => {
  const q1 = dur("2024-01-01", "2024-03-31", 10);
  const q2 = dur("2024-04-01", "2024-06-30", 12);
  const facts = { cik: 821189, facts: { "us-gaap": {
    Revenues: { units: { USD: [q1, q2].map(p => ({ ...p, val: 100 })) } },
    PaymentsToAcquireOilAndGasPropertyAndEquipment: { units: { USD: [q1, q2] } },
    PaymentsToAcquireOtherPropertyPlantAndEquipment: { units: { USD: [{ ...q1, val: 2 }] } },
    PaymentsToAcquireOilAndGasProperty: { units: { USD: [{ ...q1, val: 900 }] } },
    CapitalExpendituresIncurredButNotYetPaid: { units: { USD: [{ end: q2.end, val: 300, form: "10-Q" }] } },
  } } };
  const rows = extractQuarterlyFundamentals(facts);
  assert.equal(rows[0]?.capex, 12);
  assert.equal(rows[1]?.capex, null);
});

test("Lilly 旧年度购置科目与年报别名跨代差分，历史 tag 在后续年份不通用", () => {
  const old = [dur("2017-01-01", "2017-03-31", 10), dur("2017-01-01", "2017-06-30", 25), dur("2017-01-01", "2017-09-30", 45)];
  const bridge = [dur("2019-01-01", "2019-03-31", 10), dur("2019-01-01", "2019-06-30", 25)];
  const next = [dur("2022-01-01", "2022-03-31", 30), dur("2022-01-01", "2022-06-30", 60)];
  const facts = { cik: 59478, facts: { "us-gaap": {
    Revenues: { units: { USD: [dur("2017-10-01", "2017-12-31", 100)] } },
    PaymentsForProceedsFromProductiveAssets: { units: { USD: [...old, ...bridge] } },
    PaymentsToAcquireProductiveAssets: { units: { USD: [...bridge, ...next] } },
    PaymentsToAcquireOtherPropertyPlantAndEquipment: { units: { USD: [dur("2017-01-01", "2017-12-31", 80, "10-K"), ...next] } },
  } } };
  assert.equal(extractQuarterlyFundamentals(facts).find(r => r.period === "2017Q4")?.capex, 35);
});

test("继任 CIK 仅衔接已核实的 Exxon 同集团迁册历史且截断生效日", () => {
  const facts = (cik: number, pts: ReturnType<typeof dur>[]) => ({ cik, facts: { "us-gaap": { Revenues: { units: { USD: pts } } } } });
  const now = facts(2115436, [dur("2026-07-01", "2026-09-30", 200)]);
  const old = facts(34088, [dur("2020-01-01", "2020-03-31", 100), dur("2026-07-01", "2026-09-30", 999)]);
  const rows = extractQuarterlyFundamentals(mergeExxonPredecessorFacts(now, old), { maxQuarters: 40 });
  assert.deepEqual(rows.map(r => r.revenue), [100, 200]);
  assert.equal(mergeExxonPredecessorFacts(now, facts(123, [])), now);
});

test("Lilly 已核实总 PPE 标签跨 FY/YTD 推导 Q4，不将 OtherPPE 推广为通用总额", () => {
  const facts = (cik: number) => ({ cik, facts: { "us-gaap": {
    Revenues: { units: { USD: [dur("2020-10-01", "2020-12-31", 1000)] } },
    PaymentsToAcquireProductiveAssets: { units: { USD: [dur("2020-01-01", "2020-03-31", 10), dur("2020-01-01", "2020-06-30", 25), dur("2020-01-01", "2020-09-30", 45)] } },
    PaymentsToAcquireOtherPropertyPlantAndEquipment: { units: { USD: [dur("2020-01-01", "2020-03-31", 10), dur("2020-01-01", "2020-06-30", 25), dur("2020-01-01", "2020-12-31", 80, "10-K")] } },
  } } });
  assert.equal(extractQuarterlyFundamentals(facts(59478)).find(r => r.period === "2020Q4")?.capex, 35);
  assert.equal(extractQuarterlyFundamentals(facts(999)).find(r => r.period === "2020Q4")?.capex, null);
});

test("换 tag 补齐中间缺口与旧年代，金额须由同期重叠证明，拒绝手续费子集", () => {
  const points = [dur("2020-01-01", "2020-03-31", 100), dur("2020-04-01", "2020-06-30", 120),
    dur("2020-07-01", "2020-09-30", 130), dur("2020-10-01", "2020-12-31", 140),
    dur("2021-01-01", "2021-03-31", 150)];
  const facts = (old: typeof points) => ({ facts: { "us-gaap": {
    Revenues: { units: { USD: [points[1], points[3], points[4]] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: old.slice(0, 4) } },
  } } });
  const rows = extractQuarterlyFundamentals(facts(points));
  assert.equal(rows.length, 5);
  assert.equal(rows.find(q => q.period === "2020Q1")?.revenue, 100);
  assert.equal(rows.find(q => q.period === "2020Q3")?.revenue, 130);
  const subset = points.map(p => ({ ...p, val: p.val / 3 }));
  const unsafe = extractQuarterlyFundamentals(facts(subset));
  assert.equal(unsafe.find(q => q.period === "2020Q3"), undefined);
});

test("零售 16/17 周第四季由全年减同起点累计确认，半年不能作为长季度", () => {
  const q = quarterlyFlowSeries([
    dur("2022-08-29", "2022-11-20", 100),
    dur("2022-08-29", "2023-02-12", 220),
    dur("2022-08-29", "2023-05-07", 350),
    dur("2022-08-29", "2023-09-03", 540, "10-K", "2023-10-01"),
  ]);
  assert.equal(q.length, 4);
  assert.equal(q.at(-1)?.val, 190);
  assert.equal(q.at(-1)?.filed, "2099-01-01"); // 等参与差分的全部事实披露
  assert.equal(quarterlyFlowSeries([dur("2023-01-01", "2023-04-25", 99)]).length, 0);
});

test("calendarQuarterLabel：常规季末与 4-4-5 周历溢出", () => {
  assert.equal(calendarQuarterLabel("2025-03-31"), "2025Q1");
  assert.equal(calendarQuarterLabel("2024-12-28"), "2024Q4"); // AAPL FQ1
  assert.equal(calendarQuarterLabel("2025-01-02"), "2024Q4"); // 周历溢出归上季
  assert.equal(calendarQuarterLabel("2025-06-28"), "2025Q2");
  assert.equal(calendarQuarterLabel("2024-09-28"), "2024Q3"); // AAPL FY end
  assert.equal(calendarQuarterLabel("2025-04-05"), "2025Q1");
  assert.equal(calendarQuarterLabel("2025-07-05"), "2025Q2");
  assert.equal(calendarQuarterLabel("2026-01-04"), "2025Q4");
  assert.equal(calendarQuarterLabel("2025-04-08"), "2025Q2");
  assert.equal(calendarQuarterLabel("2025-04-05", 3), "2025Q2");
});

test("Kroger 型16周首季：Q1申报及全年锚点确认，普通四个月累计不误当季度", () => {
  const points = [
    dur("2024-02-04", "2025-02-01", 1000, "10-K"),
    { ...dur("2025-02-02", "2025-05-24", 100), fp: "Q1" },
    dur("2025-02-02", "2025-08-16", 220),
    dur("2025-02-02", "2025-11-08", 350),
    dur("2025-02-02", "2026-01-31", 500, "10-K"),
  ];
  const q = quarterlyFlowSeries(points).filter(p => p.end >= "2025-05-24");
  assert.deepEqual(q.map(p => p.val), [100, 120, 130, 150]);
  assert.equal(quarterlyFlowSeries(points.filter(p => p.end !== "2025-05-24")).some(p => p.end === "2025-05-24"), false);
  assert.equal(quarterlyFlowSeries([{ ...points[1]!, fp: "Q2" }]).length, 0);
});

test("完整公用事业营业收入作骨架，EQR租赁收入只对已核实发行人映射", () => {
  const p = dur("2025-01-01", "2025-03-31", 100);
  const gaap = { RegulatedAndUnregulatedOperatingRevenue: { units: { USD: [p] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [{ ...p, val: 30 }] } } };
  const utility = extractQuarterlyFundamentals({ facts: { "us-gaap": gaap } });
  assert.equal(utility[0]?.revenue, 100);
  assert.equal(utility[0]?.ocf, 30);
  const lease = { facts: { "us-gaap": { OperatingLeaseLeaseIncome: { units: { USD: [p] } } } } };
  assert.equal(extractQuarterlyFundamentals({ cik: 906107, ...lease })[0]?.revenue, 100);
  assert.equal(extractQuarterlyFundamentals({ cik: 936340, ...lease }).length, 0);
});

test("EQR保留旧总收入，排除2019租赁子项，补齐2020换科目断档", () => {
  const p = dur("2019-01-01", "2019-03-31", 100);
  const bridge = [dur("2021-01-01", "2021-03-31", 110), dur("2021-04-01", "2021-06-30", 120)];
  const gap = dur("2020-04-01", "2020-06-30", 90);
  const facts = { cik: 906107, facts: { "us-gaap": {
    Revenues: { units: { USD: [p] } },
    OperatingLeaseLeaseIncome: { units: { USD: [{ ...p, val: 60 }, ...bridge] } },
    OperatingLeasesIncomeStatementLeaseRevenue: { units: { USD: [p, gap, ...bridge] } },
  } } };
  const rows = extractQuarterlyFundamentals(facts, { maxQuarters: 48 });
  assert.equal(rows.find(r => r.period === "2019Q1")?.revenue, 100);
  assert.equal(rows.find(r => r.period === "2020Q2")?.revenue, 90);
});

test("TTM拒绝重复财季与中间断档，不能只看首末总跨度", () => {
  const quarter = (fiscalDate: string) => ({ period: "2025Q1", fiscalDate, revenue: 1, netIncome: 1, eps: null,
    ocf: 1, capex: 1, dividendsPaid: null, buybackPaid: null, totalAssets: null, totalLiabilities: null,
    equity: null, longTermDebt: null, cash: null, sharesOutstanding: null });
  assert.equal(computeTtm(["2025-03-31", "2025-03-31", "2025-09-30", "2025-12-31"].map(quarter)), null);
  assert.notEqual(computeTtm(["2025-02-01", "2025-05-24", "2025-08-16", "2025-11-08"].map(quarter)), null);
});

test("quarterlyFlowSeries：日历财年，直取 Q1–Q3 + 差分推导 Q4", () => {
  const pts = [
    dur("2024-01-01", "2024-03-31", 100),
    dur("2024-01-01", "2024-06-30", 210), // YTD6
    dur("2024-04-01", "2024-06-30", 110),
    dur("2024-01-01", "2024-09-30", 330), // YTD9
    dur("2024-07-01", "2024-09-30", 120),
    dur("2024-01-01", "2024-12-31", 470, "10-K"), // FY
  ];
  const q = quarterlyFlowSeries(pts);
  assert.equal(q.length, 4);
  assert.deepEqual(
    q.map((x) => [x.end, x.val, x.derived]),
    [
      ["2024-03-31", 100, false],
      ["2024-06-30", 110, false],
      ["2024-09-30", 120, false],
      ["2024-12-31", 140, true], // 470 − 330
    ],
  );
});

test("quarterlyFlowSeries：现金流仅 YTD 累计披露时全部由差分推导", () => {
  const pts = [
    dur("2024-01-01", "2024-03-31", 50),
    dur("2024-01-01", "2024-06-30", 120),
    dur("2024-01-01", "2024-09-30", 200),
    dur("2024-01-01", "2024-12-31", 300, "10-K"),
  ];
  const q = quarterlyFlowSeries(pts);
  assert.deepEqual(
    q.map((x) => [x.end, x.val]),
    [
      ["2024-03-31", 50],
      ["2024-06-30", 70],
      ["2024-09-30", 80],
      ["2024-12-31", 100],
    ],
  );
});

test("quarterlyFlowSeries：财年错位（AAPL 型，FY 止于 9 月底）", () => {
  const pts = [
    // FY2024：2023-10-01 → 2024-09-28
    dur("2023-10-01", "2023-12-30", 1195), // FQ1
    dur("2023-10-01", "2024-03-30", 2103), // YTD6
    dur("2023-12-31", "2024-03-30", 908), // FQ2
    dur("2023-10-01", "2024-06-29", 2960), // YTD9
    dur("2024-03-31", "2024-06-29", 857), // FQ3
    dur("2023-10-01", "2024-09-28", 3910, "10-K"), // FY
  ];
  const q = quarterlyFlowSeries(pts);
  const q4 = q.find((x) => x.end === "2024-09-28");
  assert.ok(q4);
  assert.equal(q4!.val, 950); // 3910 − 2960
  assert.equal(q4!.derived, true);
  assert.equal(calendarQuarterLabel(q4!.end), "2024Q3");
});

test("quarterlyFlowSeries：重述同期取最新 filed", () => {
  const pts = [
    dur("2024-01-01", "2024-03-31", 100, "10-Q", "2024-05-01"),
    dur("2024-01-01", "2024-03-31", 105, "10-Q", "2024-08-01"), // 重述
  ];
  const q = quarterlyFlowSeries(pts);
  assert.equal(q.length, 1);
  assert.equal(q[0]!.val, 105);
});

test("quarterlyFlowSeries：PIT filed —— 值取最新重述、首披露日取最早 filed", () => {
  const pts = [
    dur("2024-01-01", "2024-03-31", 100, "10-Q", "2024-05-01"),
    dur("2024-01-01", "2024-03-31", 105, "10-Q", "2024-08-01"), // 重述（值生效，首披露日不变）
  ];
  const q = quarterlyFlowSeries(pts);
  assert.equal(q[0]!.val, 105);
  assert.equal(q[0]!.filed, "2024-05-01");
});

test("quarterlyFlowSeries：差分派生季的 filed = 参与各点首次 filed 的 max（10-K filed 日）", () => {
  const pts = [
    dur("2024-01-01", "2024-03-31", 100, "10-Q", "2024-05-01"),
    dur("2024-01-01", "2024-06-30", 210, "10-Q", "2024-08-01"),
    dur("2024-04-01", "2024-06-30", 110, "10-Q", "2024-08-01"),
    dur("2024-01-01", "2024-09-30", 330, "10-Q", "2024-11-01"),
    dur("2024-07-01", "2024-09-30", 120, "10-Q", "2024-11-01"),
    dur("2024-01-01", "2024-12-31", 470, "10-K", "2025-02-15"), // FY
  ];
  const q = quarterlyFlowSeries(pts);
  const byEnd = new Map(q.map((x) => [x.end, x]));
  assert.equal(byEnd.get("2024-03-31")!.filed, "2024-05-01");
  assert.equal(byEnd.get("2024-09-30")!.filed, "2024-11-01");
  // Q4 = FY(2025-02-15) − YTD9(2024-11-01) → 2025-02-15
  const q4 = byEnd.get("2024-12-31")!;
  assert.equal(q4.derived, true);
  assert.equal(q4.filed, "2025-02-15");
});

test("quarterlyFlowSeries：仅 YTD 披露的差分链 filed 逐级传播", () => {
  const pts = [
    dur("2024-01-01", "2024-03-31", 50, "10-Q", "2024-05-01"),
    dur("2024-01-01", "2024-06-30", 120, "10-Q", "2024-08-01"),
    dur("2024-01-01", "2024-09-30", 200, "10-Q", "2024-11-01"),
    dur("2024-01-01", "2024-12-31", 300, "10-K", "2025-02-15"),
  ];
  const q = quarterlyFlowSeries(pts);
  assert.deepEqual(
    q.map((x) => [x.end, x.val, x.filed]),
    [
      ["2024-03-31", 50, "2024-05-01"],
      ["2024-06-30", 70, "2024-08-01"], // YTD6 − Q1，两点都披露后可算
      ["2024-09-30", 80, "2024-11-01"],
      ["2024-12-31", 100, "2025-02-15"],
    ],
  );
});

function usd(points: object[]) {
  return { units: { USD: points } };
}

test("extractQuarterlyFundamentals：三表对齐 + 金融公司营收概念择优（JPM 型）", () => {
  const facts = {
    facts: {
      "us-gaap": {
        // 手续费收入（部分口径）——不应被选中
        RevenueFromContractWithCustomerExcludingAssessedTax: usd([
          dur("2024-01-01", "2024-03-31", 20),
          dur("2024-04-01", "2024-06-30", 21),
          dur("2024-07-01", "2024-09-30", 22),
          dur("2024-01-01", "2024-12-31", 85, "10-K"),
        ]),
        // 总收入（金融公司口径）——年度值更大，应被选中
        Revenues: usd([
          dur("2024-01-01", "2024-03-31", 100),
          dur("2024-04-01", "2024-06-30", 110),
          dur("2024-07-01", "2024-09-30", 120),
          dur("2024-01-01", "2024-09-30", 330),
          dur("2024-01-01", "2024-12-31", 470, "10-K"),
        ]),
        NetIncomeLoss: usd([
          dur("2024-01-01", "2024-03-31", 30),
          dur("2024-04-01", "2024-06-30", 33),
          dur("2024-07-01", "2024-09-30", 36),
          dur("2024-01-01", "2024-09-30", 99),
          dur("2024-01-01", "2024-12-31", 140, "10-K"),
        ]),
        // 无 GrossProfit（银行不披露毛利）→ grossMargin 应为 null
        Assets: usd([
          inst("2024-03-31", 4000),
          inst("2024-06-30", 4100),
          inst("2024-09-30", 4200),
          inst("2024-12-31", 4300, "10-K"),
        ]),
        StockholdersEquity: usd([
          inst("2024-03-31", 300),
          inst("2024-06-30", 310),
          inst("2024-09-30", 320),
          inst("2024-12-31", 330, "10-K"),
        ]),
      },
    },
  };

  const rows = extractQuarterlyFundamentals(facts);
  assert.equal(rows.length, 4);
  const q4 = rows[rows.length - 1]!;
  assert.equal(q4.period, "2024Q4");
  assert.equal(q4.revenue, 140); // 470 − 330（总收入口径，而非手续费）
  assert.equal(q4.netIncome, 41); // 140 − 99
  assert.equal(q4.grossMargin, null);
  assert.equal(q4.totalAssets, 4300);
  // Liabilities 概念缺失时由 Assets − Equity 推导
  assert.equal(q4.totalLiabilities, 4300 - 330);
});

test("extractQuarterlyFundamentals：换 tag 公司取序列末端更新的营收概念（JPM Revenues→RevenuesNetOfInterestExpense）", () => {
  const facts = {
    facts: {
      "us-gaap": {
        // 老 tag：量级大但 2014 年后停用
        Revenues: usd([
          dur("2014-01-01", "2014-03-31", 250),
          dur("2014-04-01", "2014-06-30", 250),
          dur("2014-07-01", "2014-09-30", 250),
          dur("2014-01-01", "2014-09-30", 750),
          dur("2014-01-01", "2014-12-31", 1000, "10-K"),
        ]),
        // 现行 tag：一直更新
        RevenuesNetOfInterestExpense: usd([
          dur("2024-01-01", "2024-03-31", 200),
          dur("2024-04-01", "2024-06-30", 210),
          dur("2024-07-01", "2024-09-30", 220),
          dur("2024-01-01", "2024-09-30", 630),
          dur("2024-01-01", "2024-12-31", 860, "10-K"),
        ]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  const last = rows[rows.length - 1]!;
  assert.equal(last.period, "2024Q4");
  assert.equal(last.revenue, 230); // 860 − 630，来自现行 tag
});

test("extractQuarterlyFundamentals：银行无总营收 tag 时合成 净利息收入+非利息收入（RF/TFC 型）", () => {
  const facts = {
    facts: {
      "us-gaap": {
        InterestIncomeExpenseNet: usd([
          dur("2024-01-01", "2024-03-31", 1200),
          dur("2024-04-01", "2024-06-30", 1250),
          dur("2024-07-01", "2024-09-30", 1300),
          dur("2024-01-01", "2024-12-31", 5100, "10-K"),
          dur("2024-01-01", "2024-09-30", 3750),
        ]),
        NoninterestIncome: usd([
          dur("2024-01-01", "2024-03-31", 500),
          dur("2024-04-01", "2024-06-30", 520),
          dur("2024-07-01", "2024-09-30", 540),
          dur("2024-01-01", "2024-12-31", 2120, "10-K"),
          dur("2024-01-01", "2024-09-30", 1560),
        ]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  assert.equal(rows.length, 4);
  assert.equal(rows[0]!.revenue, 1700); // 1200+500
  assert.equal(rows[3]!.revenue, 1910); // Q4：(5100−3750)+(2120−1560)
});

test("extractQuarterlyFundamentals：营收 YoY 按同比季度对齐", () => {
  const mk = (y: number, v1: number, v2: number, v3: number, fy: number) => [
    dur(`${y}-01-01`, `${y}-03-31`, v1),
    dur(`${y}-04-01`, `${y}-06-30`, v2),
    dur(`${y}-07-01`, `${y}-09-30`, v3),
    dur(`${y}-01-01`, `${y}-09-30`, v1 + v2 + v3),
    dur(`${y}-01-01`, `${y}-12-31`, fy, "10-K"),
  ];
  const facts = {
    facts: {
      "us-gaap": {
        Revenues: usd([...mk(2023, 100, 100, 100, 400), ...mk(2024, 110, 120, 130, 500)]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  const q1_2024 = rows.find((r) => r.period === "2024Q1");
  assert.ok(q1_2024);
  assert.ok(Math.abs(q1_2024!.revenueYoY! - 0.1) < 1e-9);
  const q4_2024 = rows.find((r) => r.period === "2024Q4");
  // Q4 推导值 140 vs 上年推导 100 → +40%
  assert.ok(Math.abs(q4_2024!.revenueYoY! - 0.4) < 1e-9);
});

test("scaleFactorsBackward：混杂拆前/拆后口径的股本序列归一（DECK 6:1 型）", () => {
  // 单位百万股；153.6 已重述为拆后口径，25.x 仍是拆前口径
  const raw = [26.1, 25.8, 25.6, 153.6, 25.4, 152.0, 151.8, 150.2, 148.5, 146.1, 142.3, 140.0];
  const factors = scaleFactorsBackward(raw);
  const norm = raw.map((v, i) => v * factors[i]!);
  for (let i = 0; i < norm.length - 1; i++) {
    const ratio = norm[i]! / norm[i + 1]!;
    assert.ok(ratio > 0.9 && ratio < 1.15, `index ${i} ratio=${ratio}`);
  }
  assert.equal(factors[0], 6);
  assert.equal(factors[3], 1); // 已重述的点不动
  assert.equal(factors[11], 1);
});

test("scaleFactorsBackward：并股（反向拆股 1:8 型）", () => {
  // 旧口径股本大 8 倍
  const raw = [8000, 8080, 1010, 1000];
  const factors = scaleFactorsBackward(raw);
  assert.equal(factors[0], 1 / 8);
  assert.equal(factors[1], 1 / 8);
  assert.equal(factors[2], 1);
});

test("extractQuarterlyFundamentals：拆股后 EPS 统一到最新口径并重算 YoY", () => {
  // 2024-09 发生 6:1 拆股；2024Q2 的 EPS/净利来自拆前财报（EPS 大 6 倍），
  // 2023 各季已被后续财报重述为拆后口径
  const mkYear = (y: number, epsArr: number[], niArr: number[]) => ({
    eps: [
      dur(`${y}-01-01`, `${y}-03-31`, epsArr[0]!),
      dur(`${y}-04-01`, `${y}-06-30`, epsArr[1]!),
      dur(`${y}-07-01`, `${y}-09-30`, epsArr[2]!),
      dur(`${y}-01-01`, `${y}-09-30`, epsArr[0]! + epsArr[1]! + epsArr[2]!),
      dur(`${y}-01-01`, `${y}-12-31`, epsArr[3]!, "10-K"),
    ],
    ni: [
      dur(`${y}-01-01`, `${y}-03-31`, niArr[0]!),
      dur(`${y}-04-01`, `${y}-06-30`, niArr[1]!),
      dur(`${y}-07-01`, `${y}-09-30`, niArr[2]!),
      dur(`${y}-01-01`, `${y}-09-30`, niArr[0]! + niArr[1]! + niArr[2]!),
      dur(`${y}-01-01`, `${y}-12-31`, niArr[3]!, "10-K"),
    ],
  });
  // 净利单位百万，股本 600（拆后口径）；拆后应有 EPS = NI/600。
  // 2023 各点已被后续财报重述为拆后口径
  const y2023 = mkYear(2023, [1.0, 1.1, 1.2, 4.8], [600, 660, 720, 2880]);
  // 2024：Q1、Q2 直取点来自拆前财报（股本 100 → EPS 大 6 倍）且未被重述；
  // Q3 的 10-Q 在拆股后发布 → Q3 直取点与 YTD9 均为拆后口径；FY 10-K 拆后。
  // 每个 XBRL 点内部口径一致（真实数据的形态）。
  const y2024 = {
    eps: [
      dur("2024-01-01", "2024-03-31", 6.6), // 拆前
      dur("2024-04-01", "2024-06-30", 7.2), // 拆前
      dur("2024-07-01", "2024-09-30", 1.3), // 拆后
      dur("2024-01-01", "2024-09-30", 3.6), // YTD9 拆后：1.1+1.2+1.3
      dur("2024-01-01", "2024-12-31", 5.5, "10-K"), // FY 拆后 → Q4 推导 1.9
    ],
    ni: [
      dur("2024-01-01", "2024-03-31", 660),
      dur("2024-04-01", "2024-06-30", 720),
      dur("2024-07-01", "2024-09-30", 780),
      dur("2024-01-01", "2024-09-30", 2160),
      dur("2024-01-01", "2024-12-31", 3300, "10-K"),
    ],
  };
  const facts = {
    facts: {
      "us-gaap": {
        Revenues: usd([...mkYear(2023, [0, 0, 0, 0], [0, 0, 0, 0]).ni.map((p, i) => ({ ...p, val: 1000 + i })), ...mkYear(2024, [0, 0, 0, 0], [0, 0, 0, 0]).ni.map((p, i) => ({ ...p, val: 1100 + i }))]),
        EarningsPerShareDiluted: { units: { "USD/shares": [...y2023.eps, ...y2024.eps] } },
        NetIncomeLoss: usd([...y2023.ni, ...y2024.ni]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  const q1 = rows.find((r) => r.period === "2024Q1");
  const q2 = rows.find((r) => r.period === "2024Q2");
  assert.ok(q1 && q2);
  assert.ok(Math.abs(q1!.eps! - 1.1) < 1e-9, `q1 eps=${q1!.eps}`); // 6.6/6
  assert.ok(Math.abs(q2!.eps! - 1.2) < 1e-9, `q2 eps=${q2!.eps}`); // 7.2/6
  // YoY 用归一后口径：1.1/1.0 − 1 = 10%
  assert.ok(Math.abs(q1!.epsYoY! - 0.1) < 1e-9, `q1 epsYoY=${q1!.epsYoY}`);
});

test("extractQuarterlyFundamentals：推导 EPS 被跨口径重述污染时用 净利/股本 交叉校验替换（NVDA FY2023Q4 型）", () => {
  const shares = (val: number) => [
    inst("2024-03-31", val),
    inst("2024-06-30", val),
    inst("2024-09-30", val),
    inst("2024-12-31", val, "10-K"),
  ];
  const facts = {
    facts: {
      "us-gaap": {
        Revenues: usd([
          dur("2024-01-01", "2024-03-31", 1000),
          dur("2024-04-01", "2024-06-30", 1000),
          dur("2024-07-01", "2024-09-30", 1000),
          dur("2024-01-01", "2024-09-30", 3000),
          dur("2024-01-01", "2024-12-31", 4000, "10-K"),
        ]),
        NetIncomeLoss: usd([
          dur("2024-01-01", "2024-03-31", 600),
          dur("2024-04-01", "2024-06-30", 660),
          dur("2024-07-01", "2024-09-30", 720),
          dur("2024-01-01", "2024-09-30", 1980),
          dur("2024-01-01", "2024-12-31", 2880, "10-K"),
        ]),
        EarningsPerShareDiluted: {
          units: {
            "USD/shares": [
              dur("2024-01-01", "2024-03-31", 1.0),
              dur("2024-04-01", "2024-06-30", 1.1),
              dur("2024-07-01", "2024-09-30", 1.2),
              dur("2024-01-01", "2024-09-30", 3.3), // YTD9 旧口径
              dur("2024-01-01", "2024-12-31", 0.46, "10-K"), // FY 被重述成新口径 → 推导 Q4 = −2.84 垃圾
            ],
          },
        },
        CommonStockSharesOutstanding: { units: { shares: shares(600) } },
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  const q4 = rows.find((r) => r.period === "2024Q4")!;
  // 交叉校验后 EPS = Q4 净利 900 / 股本 600 = 1.5（而非 0.46 − 3.3 = −2.84）
  assert.ok(Math.abs(q4.eps! - 1.5) < 1e-9, `q4 eps=${q4.eps}`);
  // 未被污染的直取季不动
  assert.equal(rows.find((r) => r.period === "2024Q1")!.eps, 1.0);
});

test("extractQuarterlyFundamentals：行级 firstReportedAt = 各字段来源点首次 filed 的 max", () => {
  const filedQ = ["2024-05-01", "2024-08-01", "2024-11-01", "2025-02-15"];
  const facts = {
    facts: {
      "us-gaap": {
        Revenues: usd([
          dur("2024-01-01", "2024-03-31", 100, "10-Q", filedQ[0]),
          dur("2024-04-01", "2024-06-30", 110, "10-Q", filedQ[1]),
          dur("2024-07-01", "2024-09-30", 120, "10-Q", filedQ[2]),
          dur("2024-01-01", "2024-09-30", 330, "10-Q", filedQ[2]),
          dur("2024-01-01", "2024-12-31", 470, "10-K", filedQ[3]),
        ]),
        // 资产负债表点在同一份 10-Q/10-K 披露；后续重述不推迟首披露日
        Assets: usd([
          inst("2024-03-31", 4000, "10-Q", filedQ[0]),
          inst("2024-03-31", 4005, "10-Q", "2024-08-01"), // 重述
          inst("2024-06-30", 4100, "10-Q", filedQ[1]),
          inst("2024-09-30", 4200, "10-Q", filedQ[2]),
          inst("2024-12-31", 4300, "10-K", filedQ[3]),
        ]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  assert.equal(rows.length, 4);
  assert.equal(rows[0]!.firstReportedAt, "2024-05-01"); // Q1：10-Q filed 日（重述不影响）
  assert.equal(rows[0]!.totalAssets, 4005); // 值仍取最新重述
  assert.equal(rows[2]!.firstReportedAt, "2024-11-01");
  assert.equal(rows[3]!.firstReportedAt, "2025-02-15"); // Q4 差分派生 → 10-K filed 日
});

test("extractQuarterlyFundamentals：营收骨架换 tag 时首披露日跨候选合并（GOOGL 型）", () => {
  const facts = {
    facts: {
      "us-gaap": {
        // 旧 tag：2024 年当期披露，2025 起停用
        Revenues: usd([
          dur("2024-01-01", "2024-03-31", 100, "10-Q", "2024-04-25"),
          dur("2024-04-01", "2024-06-30", 110, "10-Q", "2024-07-24"),
        ]),
        // 新 tag：2025 年启用，2024 各季只出现在对比列（首披露晚一年）
        RevenueFromContractWithCustomerExcludingAssessedTax: usd([
          dur("2024-01-01", "2024-03-31", 100, "10-Q", "2025-04-25"),
          dur("2024-04-01", "2024-06-30", 110, "10-Q", "2025-07-24"),
          dur("2025-01-01", "2025-03-31", 120, "10-Q", "2025-04-25"),
          dur("2025-04-01", "2025-06-30", 130, "10-Q", "2025-07-24"),
        ]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  const q2_2024 = rows.find((r) => r.period === "2024Q2")!;
  // 值来自新 tag（序列更新），首披露日合并旧 tag 的当期披露
  assert.equal(q2_2024.revenue, 110);
  assert.equal(q2_2024.firstReportedAt, "2024-07-24");
  const q2_2025 = rows.find((r) => r.period === "2025Q2")!;
  assert.equal(q2_2025.firstReportedAt, "2025-07-24");
});

test("extractQuarterlyFundamentals：换 tag 的对比列来源（首披露晚一年）不拖后行级 firstReportedAt", () => {
  const facts = {
    facts: {
      "us-gaap": {
        Revenues: usd([
          dur("2024-01-01", "2024-03-31", 100, "10-Q", "2024-05-01"),
          dur("2024-04-01", "2024-06-30", 110, "10-Q", "2024-08-01"),
        ]),
        // 新 tag 2025 年才启用：2024Q1 的事实只出现在 2025Q1 10-Q 的对比列
        NetCashProvidedByUsedInOperatingActivities: usd([
          dur("2024-01-01", "2024-03-31", 50, "10-Q", "2025-05-01"),
          dur("2024-04-01", "2024-06-30", 55, "10-Q", "2025-08-01"),
        ]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  assert.equal(rows[0]!.ocf, 50); // 值照用
  assert.equal(rows[0]!.firstReportedAt, "2024-05-01"); // 但不 gate 首披露日
  assert.equal(rows[1]!.firstReportedAt, "2024-08-01");
});

function qRow(partial: Partial<QuarterFundamentalRow> & { period: string; fiscalDate: string }): QuarterFundamentalRow {
  return {
    revenue: null,
    netIncome: null,
    eps: null,
    ocf: null,
    capex: null,
    dividendsPaid: null,
    buybackPaid: null,
    totalAssets: null,
    totalLiabilities: null,
    equity: null,
    longTermDebt: null,
    cash: null,
    sharesOutstanding: null,
    ...partial,
  };
}

test("computeTtm：连续 4 季求和；断档返回 null", () => {
  const quarters = [
    qRow({ period: "2024Q1", fiscalDate: "2024-03-31", revenue: 100, netIncome: 10, ocf: 20, capex: 5 }),
    qRow({ period: "2024Q2", fiscalDate: "2024-06-30", revenue: 110, netIncome: 11, ocf: 21, capex: 5 }),
    qRow({ period: "2024Q3", fiscalDate: "2024-09-30", revenue: 120, netIncome: 12, ocf: 22, capex: 5 }),
    qRow({ period: "2024Q4", fiscalDate: "2024-12-31", revenue: 130, netIncome: 13, ocf: 23, capex: 5 }),
  ];
  const ttm = computeTtm(quarters);
  assert.ok(ttm);
  assert.equal(ttm!.revenue, 460);
  assert.equal(ttm!.netIncome, 46);
  assert.equal(ttm!.fcf, 86 - 20);

  // 缺 2024Q2 → 首尾跨度超限 → null
  const gappy = quarters.filter((q) => q.period !== "2024Q2");
  gappy.unshift(qRow({ period: "2023Q3", fiscalDate: "2023-09-30", revenue: 90 }));
  assert.equal(computeTtm(gappy), null);
});

test("computeValuation：现价×股本 → 市值与倍数；股本缺失退回主档市值", () => {
  const latest = qRow({
    period: "2024Q4",
    fiscalDate: "2024-12-31",
    equity: 500,
    longTermDebt: 200,
    cash: 100,
    sharesOutstanding: 10,
  });
  const ttm = computeTtm([
    qRow({ period: "2024Q1", fiscalDate: "2024-03-31", revenue: 100, netIncome: 10, ocf: 20, capex: 5, dividendsPaid: 2 }),
    qRow({ period: "2024Q2", fiscalDate: "2024-06-30", revenue: 100, netIncome: 10, ocf: 20, capex: 5, dividendsPaid: 2 }),
    qRow({ period: "2024Q3", fiscalDate: "2024-09-30", revenue: 100, netIncome: 10, ocf: 20, capex: 5, dividendsPaid: 2 }),
    { ...latest, revenue: 100, netIncome: 10, ocf: 20, capex: 5, dividendsPaid: 2 },
  ]);
  const v = computeValuation(ttm, latest, 100);
  assert.equal(v.marketCap, 1000);
  assert.equal(v.marketCapSource, "shares");
  assert.equal(v.peTtm, 1000 / 40);
  assert.equal(v.pb, 2);
  assert.equal(v.psTtm, 2.5);
  assert.equal(v.ev, 1000 + 200 - 100);
  assert.ok(Math.abs(v.fcfYield! - 60 / 1000) < 1e-9);
  assert.ok(Math.abs(v.dividendYield! - 8 / 1000) < 1e-9);

  const noShares = { ...latest, sharesOutstanding: null };
  const v2 = computeValuation(ttm, noShares, 100, 888);
  assert.equal(v2.marketCap, 888);
  assert.equal(v2.marketCapSource, "profile");
});

// ── P0 深历史回填（2010 起）暴露的两类问题 ────────────────────────────────────

test("scaleFactorsBackward：两次拆股复合（AAPL 7:1 × 4:1 = 28）", () => {
  // 中段被脏点/口径交替打断时，一步内要跨过两次拆股——单因子表里没有 28
  const raw = [900, 910, 25_480, 25_000, 24_500];
  const factors = scaleFactorsBackward(raw);
  assert.equal(factors[0], 28);
  assert.equal(factors[1], 28);
  assert.equal(factors[2], 1);
});

test("scaleFactorsBackward：脏点判 null 且不毒化更早历史（AAPL 2014-03 型）", () => {
  // 索引 2 是 4 个数量级偏离的脏值：旧实现会把它当新参考，
  // 导致其之前（索引 0/1）的拆前口径整段留在错误刻度
  const raw = [900, 910, 0.86, 5990, 5870, 5820];
  const factors = scaleFactorsBackward(raw);
  assert.equal(factors[2], null, "脏点应判 null 供调用方丢弃");
  assert.equal(factors[0], 7, "脏点之前仍按 7:1 归一，参考未被毒化");
  assert.equal(factors[1], 7);
  assert.equal(factors[3], 1);
});

test("scaleFactorsBackward：非整数比的大额增发接受为新参考（不判脏、不换算）", () => {
  // 1.4 倍增发：落在 1 与 2 的容差带之间，任何拆股因子都解释不了，且 <20 倍
  // → 保持原值并以其为新参考（整数倍增发与「反向拆股重述」在数据上不可区分，
  // 仍会被当拆股，属既有口径）
  const raw = [1000, 1020, 1430, 1440];
  const factors = scaleFactorsBackward(raw);
  assert.equal(factors[2], 1);
  assert.equal(factors[0], 1);
  assert.equal(factors[1], 1);
});

test("extractQuarterlyFundamentals：换 tag 时代拼接（口径一致才接，深历史的关键）", () => {
  // 新 tag 只覆盖 2023 起，旧 tag 覆盖 2022–2023（重叠 4 季且值一致）→ 应接出 8 季
  const newTag: ReturnType<typeof dur>[] = [];
  const oldTag: ReturnType<typeof dur>[] = [];
  const q = (y: number, i: number): [string, string] =>
    [
      [`${y}-01-01`, `${y}-03-31`],
      [`${y}-04-01`, `${y}-06-30`],
      [`${y}-07-01`, `${y}-09-30`],
      [`${y}-10-01`, `${y}-12-31`],
    ][i] as [string, string];
  for (const y of [2022, 2023]) {
    for (let i = 0; i < 4; i++) {
      const [s, e] = q(y, i);
      // 旧 tag 到 2023Q2 为止（换 tag 当年并行披露两季 → 重叠期），新 tag 覆盖 2023 全年
      if (y === 2022 || i < 2) oldTag.push(dur(s, e, 100 + i, "10-Q", `${y}-12-31`));
      if (y === 2023) newTag.push(dur(s, e, 100 + i, "10-Q", `${y}-12-31`));
    }
  }
  const facts = {
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: newTag } },
        SalesRevenueNet: { units: { USD: oldTag } },
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts, { maxQuarters: 40 });
  assert.equal(rows.length, 8, "旧 tag 时代应被接到前面");
  assert.equal(rows[0]!.period, "2022Q1");

  // 口径不一致（旧 tag 只有主口径的 30%，如手续费收入 vs 总收入）→ 不接，
  // 只留新 tag 时代（宁缺勿错：接缝会造出假 YoY 与假估值）
  const factsMismatch = {
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: newTag } },
        SalesRevenueNet: {
          units: { USD: oldTag.map((p) => ({ ...p, val: p.val * 0.3 })) },
        },
      },
    },
  };
  const rows2 = extractQuarterlyFundamentals(factsMismatch, { maxQuarters: 40 });
  assert.equal(rows2.length, 4);
  assert.equal(rows2[0]!.period, "2023Q1");
});

test("extractQuarterlyFundamentals：银行合成营收作常备拼接来源（非仅空值兜底）", () => {
  // 银行没有单一总营收 tag：现行 tag 只覆盖 2018 起，深历史在净利息收入 + 非利息收入两支里。
  // 旧实现只在「主候选为空」时才合成 → WFC 这类主候选非空的银行被卡在 2018。
  const q = (y: number, i: number): [string, string] =>
    [
      [`${y}-01-01`, `${y}-03-31`],
      [`${y}-04-01`, `${y}-06-30`],
      [`${y}-07-01`, `${y}-09-30`],
      [`${y}-10-01`, `${y}-12-31`],
    ][i] as [string, string];
  const modern: ReturnType<typeof dur>[] = [];
  const nii: ReturnType<typeof dur>[] = [];
  const nonInt: ReturnType<typeof dur>[] = [];
  for (const y of [2016, 2017, 2018]) {
    for (let i = 0; i < 4; i++) {
      const [s, e] = q(y, i);
      nii.push(dur(s, e, 60, "10-Q", `${y}-12-31`));
      nonInt.push(dur(s, e, 40, "10-Q", `${y}-12-31`));
      if (y === 2018) modern.push(dur(s, e, 100, "10-Q", `${y}-12-31`));
    }
  }
  const facts = {
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: modern } },
        InterestIncomeExpenseNet: { units: { USD: nii } },
        NoninterestIncome: { units: { USD: nonInt } },
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts, { maxQuarters: 40 });
  assert.equal(rows.length, 12, "应拼回 2016–2018 共 12 季");
  assert.equal(rows[0]!.period, "2016Q1");
  assert.equal(rows[0]!.revenue, 100, "合成营收 = 净利息 60 + 非利息 40");
});

test("eraSplice：只用接缝处的连续重叠估比值（远端垃圾点不参与）", () => {
  // 旧 tag 在接缝后 3 季与主序列 99% 吻合，更晚只剩年度点差分出的垃圾季（值仅 28%）。
  // 若把远端垃圾一起计入中位数，会把这条本可拼接的旧序列否掉。
  const q = (y: number, i: number): [string, string] =>
    [
      [`${y}-01-01`, `${y}-03-31`],
      [`${y}-04-01`, `${y}-06-30`],
      [`${y}-07-01`, `${y}-09-30`],
      [`${y}-10-01`, `${y}-12-31`],
    ][i] as [string, string];
  const modern: ReturnType<typeof dur>[] = [];
  const legacy: ReturnType<typeof dur>[] = [];
  for (const y of [2020, 2021, 2022]) {
    for (let i = 0; i < 4; i++) {
      const [s, e] = q(y, i);
      if (y >= 2021) modern.push(dur(s, e, 100, "10-Q", `${y}-12-31`));
      if (y <= 2020) legacy.push(dur(s, e, 100, "10-Q", `${y}-12-31`));
      if (y === 2021) legacy.push(dur(s, e, 100, "10-Q", `${y}-12-31`)); // 接缝处连续重叠
      if (y === 2022 && i === 1) legacy.push(dur(s, e, 28, "10-Q", `${y}-12-31`)); // 远端垃圾点
    }
  }
  const facts = {
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: modern } },
        SalesRevenueNet: { units: { USD: legacy } },
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts, { maxQuarters: 40 });
  assert.equal(rows.length, 12);
  assert.equal(rows[0]!.period, "2020Q1");
});


test("换标签历史保留财报原金额，不按重叠比例缩放，也不接明显不同口径", () => {
  const point = (year: number, val: number) => dur(`${year}-01-01`, `${year}-03-31`, val, "10-Q", `${year}-05-01`);
  const modern = [point(2022, 100), point(2023, 100), point(2024, 100), point(2025, 100)];
  const rows = (oldValue: number) => extractQuarterlyFundamentals({ facts: { "us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: modern } },
    SalesRevenueNet: { units: { USD: [point(2021, 70), point(2022, oldValue), point(2023, oldValue)] } },
  } } }, { maxQuarters: 40 });
  assert.equal(rows(99).find(r => r.period === "2021Q1")?.revenue, 70);
  assert.equal(rows(95).find(r => r.period === "2021Q1"), undefined);
});
