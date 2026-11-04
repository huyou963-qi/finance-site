import type { SecFactPoint } from "./secFundamentals";
import { SEC_PREDECESSORS } from "./secPredecessors";
import { CASH_CAPEX_COMPONENTS } from "./issuerCashCapex";
import { reportedDurationDifference, reportedDurationSum } from "./secReportedFlows";

export type StatementFact = SecFactPoint & {
  cik: number; tag: string; taxonomy: string; statement: "IS" | "CF"; label: string;
  segments: string; coreg: string; unit: string; source: string; sha256: string; parenthetical: false;
};
type Field = "revenue" | "netIncome" | "ocf" | "capex";
type Flows = Record<Field, SecFactPoint[]>;
const DAY = 86400000;
const isoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** 每个角色必须有明确现金额；同角色的替代标签只接受同申报同期同值。 */
export const STATEMENT_CAPEX_ROLES: Readonly<Record<number, readonly (readonly string[])[]>> = {
  4904: [["PaymentsForConstructionInProcess"]],
  65984: [["PaymentsForCapitalImprovements", "PaymentsToAcquirePropertyPlantAndEquipment"]],
  1000697: [["PaymentsForProceedsFromProductiveAssets", "PaymentsToAcquireProductiveAssets"]],
  1973266: [["PaymentsToAcquirePropertyPlantAndEquipmentAndOther"]],
  1539838: [["PaymentsToExploreAndDevelopOilAndGasProperties"]],
  936340: [["PaymentsToAcquirePropertyPlantAndEquipment"]],
  1783879: [["PaymentsToAcquireOtherProductiveAssets", "PaymentsToAcquirePropertyPlantAndEquipment"]],
  1140536: [["PaymentsToAcquireFixedAssetsAndSoftwareForInternalUse", "PaymentsToAcquireProductiveAssets"]],
  24741: [["PaymentsForProceedsFromProductiveAssets", "PaymentsForCapitalImprovements", "PaymentsToAcquireProductiveAssets"]],
  882835: [["PaymentsToAcquireOtherProductiveAssets", "PaymentsToAcquireProductiveAssets"]],
  879169: [["PaymentsToAcquireOtherProductiveAssets", "PaymentsToAcquireProductiveAssets"]],
  827054: [["PaymentsToAcquireOtherPropertyPlantAndEquipment", "PaymentsToAcquirePropertyPlantAndEquipment"]],
  10456: [["PaymentsToAcquireOtherProductiveAssets", "PaymentsToAcquireProductiveAssets"]],
  1744489: [["PaymentsToAcquirePropertyPlantAndEquipment"]],
  1067701: [["PaymentsToAcquirePropertySubjectToOrAvailableForOperatingLease", "PaymentsToAcquireOtherPropertyPlantAndEquipment"], ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets"]],
  1674101: [["PaymentsToAcquirePropertyPlantAndEquipment"], ["PaymentsForSoftware"]],
  1327811: [["PaymentsToAcquireProductiveAssets", "PaymentsToAcquireOtherProductiveAssets"], ["PaymentsToAcquireAndDevelopRealEstate", "PaymentsToAcquireRealEstate"]],
  1393311: [["CapitalExpendituresToMaintainRealEstateFacilities"], ["CapitalExpendituresForPropertyEnhancements"], ["CapitalExpendituresForEnergyEfficiencies"], ["PaymentsToDevelopRealEstateAssets"]],
  1705696: [["PaymentsToAcquireOtherPropertyPlantAndEquipment", "PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForProceedsFromOtherInvestingActivities"]],
  1751788: [["PaymentsToAcquireMachineryAndEquipment", "PaymentsToAcquireProductiveAssets"]],
  1841666: [["PaymentsToExploreAndDevelopOilAndGasProperties"]],
  6769: [["PaymentsToExploreAndDevelopOilAndGasProperties"]],
  740260: [["UsGaap_PaymentsToAcquireAndDevelopRealEstate", "PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireOtherProductiveAssets"], ["PaymentsToDevelopRealEstateAssets", "PaymentForDevelopmentProjectExpenditures"]],
  34903: [["CapitalExpendituresOther", "PaymentsForCapitalImprovements"], ["CapitalExpendituresDevelopmentRedevelopment"]],
  910606: [["PaymentsToDevelopRealEstateAssets"]],
  879101: [["PaymentsForImprovementsToOperatingRealEstate", "PaymentsForCapitalImprovements"], ["PaymentsToDevelopRealEstateAssets"]],
  906345: [["PaymentsToDevelopRealEstateAssets"], ["PaymentsToAcquireOtherPropertyPlantAndEquipment"]],
  765880: [["PaymentsForLeasingCostsCommissionsAndTenantImprovements"], ["PaymentsToDevelopRealEstateAssets"]],
  920522: [["RevenueGeneratingCapitalExpenditures"], ["RedevelopmentExpenditures"], ["PaymentsToDevelopRealEstateAssets", "PaymentsToAcquireCommercialRealEstate"]],
  1045609: [["PaymentForPropertyImprovements", "PaymentsForCapitalImprovements", "PaymentsToAcquirePropertyPlantAndEquipment"], ["PaymentsToDevelopRealEstateAssets", "PaymentsToAcquireAndDevelopRealEstate"], ["PaymentsForLeasingCostsCommissionsAndTenantImprovements"]],
  906107: [["PaymentsForCapitalExpendituresToRealEstate", "PaymentsForCapitalImprovements"], ["NonRealEstateCapitalAdditions", "PaymentsToAcquireProductiveAssets", "PaymentsToAcquireOtherCapitalAssets"], ["PaymentsToDevelopRealEstateAssets"]],
};

const PSA_CASH_ROLES = [
  { from: "1900-01-01", through: "2018-12-31", roles: [["PaymentsForCapitalImprovements"], ["PaymentsForConstructionInProcess"]] },
  { from: "2019-01-01", through: "2021-12-31", roles: [["PaymentsForCapitalImprovementsCostsIncurredDuringPeriod"], ["PaymentsForCapitalImprovementsCostsIncurredInPreviousPeriods"], ["PaymentsForConstructionInProcessCostsIncurredDuringPeriod"], ["PaymentsForConstructionInProcessCostsIncurredInPreviousPeriods"]] },
  { from: "2019-01-01", through: "2021-12-31", roles: [["CapitalExpendituresToMaintainRealEstateFacilities"], ["DevelopmentAndExpansionOfRealEstateFacilities"]] },
] as const;
const FANG_CASH_ROLES = [
  { from: "1900-01-01", through: "2017-12-31", roles: [["PaymentsToExploreAndDevelopOilAndGasProperties"], ["PaymentstoExploreandDevelopOilandGasPropertiesRelatedParty"], ["PaymentsToAcquireOilAndGasEquipment"], ["PaymentsToAcquireOtherProductiveAssets"]] },
  { from: "2018-01-01", through: "2018-12-31", roles: [["PaymentsToExploreAndDevelopOilAndGasProperties"], ["PaymentstoExploreandDevelopOilandGasPropertiesRelatedParty"], ["Paymentstoaddoilandnaturalgaspropertiesinfrastructure"], ["PaymentsToAcquireOilAndGasEquipment"], ["PaymentsToAcquireOtherProductiveAssets"]] },
  { from: "2019-01-01", through: "2020-12-31", roles: [["PaymentsToExploreAndDevelopOilAndGasProperties"], ["Paymentstoaddoilandnaturalgaspropertiesinfrastructure"], ["PaymentsToAcquireOilAndGasEquipment"], ["PaymentsToAcquireOtherProductiveAssets"]] },
  { from: "2021-01-01", through: "2021-12-31", roles: [["PaymentsToExploreAndDevelopOilAndGasProperties"], ["PaymentsToAcquireOilAndGasEquipment"]] },
] as const;
export const STATEMENT_EXTRA_CAPEX_TAGS = {
  1393311: [...new Set(PSA_CASH_ROLES.flatMap(r => r.roles.flatMap(tags => [...tags])))],
  936340: ["PlantAndEquipmentExpendituresUtility", "PlantAndEquipmentExpendituresNonUtility"],
  1539838: [...new Set(FANG_CASH_ROLES.flatMap(r => r.roles.flatMap(tags => [...tags])))],
  1327811: ["PaymentsToAcquirePropertyPlantAndEquipment"],
};

/** 本地SEC官方批量表补充：输入仍是不可信数据，严格限制来源、主体、区间、维度和字段。 */
export function statementSupplementFlows(facts: unknown): Flows {
  const root = facts as { cik?: number; statementSupplement?: unknown };
  const out: Flows = { revenue: [], netIncome: [], ocf: [], capex: [] };
  if (!root?.statementSupplement) return out;
  if (!Array.isArray(root.statementSupplement) || root.statementSupplement.length > 8000) throw new Error("财报补充超出单公司8000点上限");
  const cik = Number(root.cik);
  const specific = STATEMENT_CAPEX_ROLES[cik] ?? CASH_CAPEX_COMPONENTS[cik]?.map(tag => [tag.split(":")[1]!]);
  const configured = specific ?? [["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements"]];
  const groups = new Map<string, { sample: StatementFact; expected: number; roles: Map<number, number | null> }>();
  const seen = new Map<string, number>();
  const presentations = new Set<string>();
  const chosen = new Map<string, { point: SecFactPoint; priority: number }>();
  const profit: SecFactPoint[] = [], minority: SecFactPoint[] = [], pmGross: SecFactPoint[] = [], pmTax: SecFactPoint[] = [];
  const continuingCash: SecFactPoint[] = [], discontinuedCash: SecFactPoint[] = [];
  const select = (field: "revenue" | "netIncome" | "ocf", key: string, point: SecFactPoint, priority: number) => {
    const id = `${field}|${key}`, old = chosen.get(id);
    if (!old || priority < old.priority) chosen.set(id, { point, priority });
    else if (priority === old.priority && old.point.val !== point.val) throw new Error("同申报同字段总额歧义");
  };
  for (const value of root.statementSupplement) {
    const p = value as StatementFact;
    if (!p || !isoDate(p.start) || !isoDate(p.end) || !isoDate(p.filed) || p.end > p.filed
      || typeof p.val !== "number" || !Number.isFinite(p.val) || Math.abs(p.val) > Number.MAX_SAFE_INTEGER
      || !/^10-[KQ](?:\/A)?$/.test(p.form ?? "") || !/^\d{10}-\d{2}-\d{6}$/.test(p.accn ?? "")
      || !/^https:\/\/www\.sec\.gov\/files\/dera\/data\/financial-statement-data-sets\/\d{4}q[1-4]\.zip$/.test(p.source ?? "")
      || !/^[a-f0-9]{64}$/.test(p.sha256 ?? "") || !/^(?:us-gaap\/\d{4}|\d{10}-\d{2}-\d{6})$/.test(p.taxonomy ?? "")
      || p.parenthetical !== false || !["IS", "CF"].includes(p.statement) || p.unit !== "USD" || p.coreg !== ""
      || typeof p.segments !== "string" || p.segments.length > 1000 || typeof p.label !== "string" || p.label.length > 500
      || typeof p.tag !== "string" || !/^[A-Za-z][\w.-]{0,199}$/.test(p.tag)) throw new Error("财报补充事实元数据无效");
    const days = (Date.parse(p.end) - Date.parse(p.start)) / DAY;
    if (days < 69 || days > 380) throw new Error("财报补充期间无效");
    const archive = p.source.match(/\/(\d{4})q([1-4])\.zip$/)!;
    if (p.filed.slice(0, 4) !== archive[1] || Math.ceil(Number(p.filed.slice(5, 7)) / 3) !== Number(archive[2])) throw new Error("申报日不属于来源归档季度");
    if (p.cik !== cik && !SEC_PREDECESSORS.some(r => r.current === cik && r.predecessor === p.cik && p.end! < r.before)) throw new Error("财报补充主体不是已核实的当前或前身集团");
    const cms = cik === 811156 && p.tag === "PaymentsToAcquirePropertyPlantAndEquipment"
      && p.segments === "PropertyPlantAndEquipmentByType=OngoingCapitalExpenditures;";
    const apaRevenue = [1841666, 6769].includes(cik) && p.tag === "Revenues" && p.segments === "ProductOrService=OilAndGas;";
    if (p.segments && !cms && !apaRevenue) continue;
    const key = `${p.accn}|${p.filed}|${p.start}|${p.end}`;
    const id = `${key}|${p.tag}|${p.segments}`;
    if (seen.has(id) && seen.get(id) !== p.val) throw new Error("同申报补充事实冲突");
    seen.set(id, p.val);
    const presentation = `${id}|${p.statement}|${p.label}`;
    if (presentations.has(presentation)) continue;
    presentations.add(presentation);
    const point: SecFactPoint = { start: p.start, end: p.end, val: p.val, accn: p.accn, filed: p.filed, form: p.form, fp: p.fp, fy: p.fy };
    if (p.statement === "IS") {
      const revenueTags = ["RevenuesNetOfInterestExpense", "RevenueFromContractWithCustomerExcludingAssessedTax", "RegulatedAndUnregulatedOperatingRevenue", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"];
      const issuerRevenue: Record<number, readonly string[]> = {
        2012383: ["RevenuesExcludingInterestAndDividends"], 1364742: ["RevenuesExcludingInterestAndDividends"],
        1045609: ["RealEstateRevenueNet"], 1289490: ["RealEstateRevenueNet"],
        1164727: ["RevenueMineralSales"], 1035002: ["RefiningAndMarketingRevenue"],
      };
      const revenuePriority = issuerRevenue[cik]?.includes(p.tag) ? 6 : revenueTags.indexOf(p.tag);
      if (apaRevenue && /^total revenues$/i.test(p.label.trim())) select("revenue", key, point, 0);
      const pmOldGross = cik === 1413329 && p.end < "2018-01-01" && ["SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"].includes(p.tag);
      if (cik === 1413329 && p.end < "2018-01-01" && !p.segments && p.taxonomy.startsWith("us-gaap/")) {
        if (p.tag === "SalesRevenueNet") pmGross.push(point);
        if (p.tag === "ExciseAndSalesTaxes") pmTax.push(point);
      }
      if (!pmOldGross && !p.segments && p.taxonomy.startsWith("us-gaap/") && revenuePriority >= 0
        && /^(?:total (?:net )?revenues?|net (?:sales|revenues?|operating revenues)|operating revenues|revenues?|sales)$/i.test(p.label.trim())) select("revenue", key, point, revenuePriority);
      if (p.tag === "NetIncomeLoss" && p.taxonomy.startsWith("us-gaap/") && !p.segments) select("netIncome", key, point, 0);
      if (p.tag === "ProfitLoss" && p.taxonomy.startsWith("us-gaap/") && !p.segments) profit.push(point);
      if (p.tag === "NetIncomeLossAttributableToNoncontrollingInterest" && p.taxonomy.startsWith("us-gaap/") && !p.segments) minority.push(point);
      continue;
    }
    if (p.taxonomy.startsWith("us-gaap/") && p.tag === "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations") continuingCash.push(point);
    if (p.taxonomy.startsWith("us-gaap/") && p.tag === "CashProvidedByUsedInOperatingActivitiesDiscontinuedOperations") discontinuedCash.push(point);
    if (p.taxonomy.startsWith("us-gaap/") && p.tag === "NetCashProvidedByUsedInOperatingActivities"
      && (/^(?:net )?cash\b.*operating activities(?:,? total)?$/i.test(p.label.trim()) || /^(?:net )?cash\b.*\boperations$/i.test(p.label.trim()))
      && !/continuing|discontinued|subsidiar|noncontrolling|joint venture/i.test(p.label)) select("ocf", key, point, 0);
    // Valero现金流分列母体与VIE，Capital investments又含递延检修成本。
    // 不能以旧未分区PPE行冒充全集团，也不把不同维护口径的总投资接成资本开支。
    if (cik === 1035002) continue;
    const viciCashPayables = cik === 1705696 && p.end < "2019-01-01"
      && ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForProceedsFromOtherInvestingActivities"].includes(p.tag)
      && /^acquisition of property and equipment, net of change in related payables$/i.test(p.label.trim());
    if (p.val < 0 || (!viciCashPayables && /accrued|unpaid|non.?cash|proceeds|gain|loss|remaining|payable|allowance|fair value/i.test(p.label))) continue;
    // Entergy旧PPE是资产收购，不能与同表Construction/capital expenditures互作别名。
    if (cik === 65984 && p.tag === "PaymentsToAcquirePropertyPlantAndEquipment" && p.end < "2022-01-01") continue;
    if (cik === 1705696 && ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForProceedsFromOtherInvestingActivities"].includes(p.tag)
      && (p.end >= "2019-01-01" || !/^acquisition of property and equipment, net of change in related payables$/i.test(p.label.trim()))) continue;
    // FANG旧版仅为钻完井子项；2022起该行明确合并基础设施和中游新增资产。
    if (cik === 1539838 && p.start >= "2022-01-01" && (!/drilling/i.test(p.label) || !/infrastructure.*midstream/i.test(p.label))) continue;
    if (!specific && (!p.taxonomy.startsWith("us-gaap/") || /\bnet\b|incentive|financ|principal|interest|business/i.test(p.label)
      || !/^(?:capital expenditures|(?:purchases|additions|payments|acquisitions)(?: of| for| to)? (?:property|plant|equipment|leasehold))/i.test(p.label.trim()))) continue;
    const historicalRoles: readonly (readonly (readonly string[])[])[] = cik === 1393311
      ? PSA_CASH_ROLES.filter(r => p.start! >= r.from && p.start! <= r.through).map(r => r.roles)
      : cik === 1539838 ? FANG_CASH_ROLES.filter(r => p.start! >= r.from && p.start! <= r.through).map(r => r.roles)
      : cik === 936340 && p.start < "2022-01-01" ? [[["PlantAndEquipmentExpendituresUtility"], ["PlantAndEquipmentExpendituresNonUtility"]]] : [];
    const roleSets: readonly (readonly (readonly string[])[])[] = cik === 1327811 && p.tag === "PaymentsToAcquirePropertyPlantAndEquipment" && /^capital expenditures$/i.test(p.label.trim())
      ? [[["PaymentsToAcquirePropertyPlantAndEquipment"]]] : historicalRoles.length ? historicalRoles : [configured];
    for (let formula = 0; formula < roleSets.length; formula++) {
      const periodRoles = roleSets[formula]!;
      const groupKey = `${key}|${periodRoles.map(tags => tags.join(",")).join(";")}`;
      for (let role = 0; role < periodRoles.length; role++) {
      if (!periodRoles[role]!.includes(p.tag)) continue;
      const group = groups.get(groupKey) ?? { sample: p, expected: periodRoles.length, roles: new Map<number, number | null>() };
      const old = group.roles.get(role);
      group.roles.set(role, old === null || (old != null && old !== p.val) ? null : p.val);
      groups.set(groupKey, group);
      }
    }
  }
  for (const p of reportedDurationDifference(pmGross, pmTax)) select("revenue", `${p.accn}|${p.filed}|${p.start}|${p.end}`, p, -1);
  for (const p of reportedDurationDifference(profit, minority)) select("netIncome", `${p.accn}|${p.filed}|${p.start}|${p.end}`, p, 1);
  for (const p of reportedDurationSum(continuingCash, discontinuedCash)) select("ocf", `${p.accn}|${p.filed}|${p.start}|${p.end}`, p, 1);
  for (const [id, value] of chosen) out[id.split("|")[0] as "revenue" | "netIncome" | "ocf"].push(value.point);
  const completeCapex = new Map<string, SecFactPoint>();
  for (const { sample, expected, roles } of groups.values()) {
    if (roles.size !== expected || [...roles.values()].some(v => v == null)) continue;
    const total = [...roles.values()].reduce<number>((sum, v) => sum + v!, 0);
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) throw new Error("资本开支合计超出精度范围");
    const key = `${sample.accn}|${sample.filed}|${sample.start}|${sample.end}`;
    if (completeCapex.has(key) && completeCapex.get(key)!.val !== total) throw new Error("同申报资本开支完整现金支付口径冲突");
    completeCapex.set(key, { start: sample.start, end: sample.end, val: total,
      accn: sample.accn, filed: sample.filed, form: sample.form, fp: sample.fp, fy: sample.fy });
  }
  out.capex = [...completeCapex.values()];
  return out;
}

/** 完整12个月或52/53周财年；不接收11个月过渡期或累计季度。 */
export function annualStatementSnapshots(facts: unknown) {
  const flows = statementSupplementFlows(facts);
  const root = facts as { cik?: number; facts?: { "us-gaap"?: Record<string, { units?: { USD?: SecFactPoint[] } }> } };
  if (Number(root.cik) === 906345) {
    flows.revenue = ["OperatingLeaseLeaseIncome", "OperatingLeasesIncomeStatementLeaseRevenue", "RealEstateRevenueNet"]
      .flatMap(tag => root.facts?.["us-gaap"]?.[tag]?.units?.USD ?? [])
      .filter(p => typeof p.val === "number" && Number.isFinite(p.val) && Math.abs(p.val) <= Number.MAX_SAFE_INTEGER
        && Boolean(p.start && p.end && p.filed && /^10-K(?:\/A)?$/.test(p.form ?? "")
          && Number.isFinite(Date.parse(p.start)) && Date.parse(p.start) < Date.parse(p.end) && Date.parse(p.end) <= Date.parse(p.filed)));
  }
  const rows = new Map<string, { fiscalDate: string; sourceFiledAt: string; revenue: number | null; netIncome: number | null; ocf: number | null; capex: number | null }>();
  for (const field of ["revenue", "netIncome", "ocf", "capex"] as const) {
    const selected = new Map<string, SecFactPoint>();
    for (const p of flows[field]) {
      const days = (Date.parse(p.end!) - Date.parse(p.start!)) / DAY;
      if (!p.form?.startsWith("10-K") || days < 360 || days > 374) continue;
      const previous = selected.get(p.end!);
      if (!previous || p.filed! > previous.filed!) selected.set(p.end!, p);
    }
    for (const p of selected.values()) {
      const row = rows.get(p.end!) ?? { fiscalDate: p.end!, sourceFiledAt: p.filed!, revenue: null, netIncome: null, ocf: null, capex: null };
      row[field] = p.val!; if (p.filed! > row.sourceFiledAt) row.sourceFiledAt = p.filed!;
      rows.set(p.end!, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.fiscalDate.localeCompare(b.fiscalDate));
}
