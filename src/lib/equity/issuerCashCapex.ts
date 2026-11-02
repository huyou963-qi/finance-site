import type { SecFactPoint } from "./secFundamentals";

/** 仅列经合并现金流表核实的现金购置科目，不接受投资/收购混合总额或未付金额。 */
export const CASH_CAPEX_COMPONENTS: Readonly<Record<number, readonly string[]>> = {
  1045810: ["nvda:PurchasesOfPropertyAndEquipmentAndIntangibleAssets"],
  715957: ["d:PaymentsToAcquirePropertyPlantAndEquipmentIncludingNuclearFuel"],
  1047862: ["us-gaap:PaymentsForConstructionInProcess", "ed:PaymentsNonUtilityConstructionExpenditures"],
  811156: ["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment"],
  1393311: [
    "psa:CapitalExpendituresToMaintainRealEstateFacilities",
    "psa:CapitalExpendituresForPropertyEnhancements",
    "psa:CapitalExpendituresForEnergyEfficiencies",
    "us-gaap:PaymentsToDevelopRealEstateAssets",
  ],
};

export type CashCapexFacts = { cik?: string | number; facts?: Record<string, Record<string, { units?: Record<string, SecFactPoint[]> }>> };

/** 合成现金资本开支必须全部分项来自同一申报、同一累计区间；不把缺少分项当零。 */
export function issuerReportedCashCapex(facts: unknown): SecFactPoint[] {
  const shape = facts as CashCapexFacts;
  if (Number(shape?.cik) === 783325) {
    // WEC同一现金流表Capital expenditures：季报用PPE，年报用OtherPPE。
    // 仅2023起逐表核对；更早PPE包含收购，不能与OtherPPE现金总额混接。
    const out = new Map<string, SecFactPoint>();
    for (const name of ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireOtherPropertyPlantAndEquipment"]) {
      for (const p of shape.facts?.["us-gaap"]?.[name]?.units?.USD ?? []) {
        if (!p.start || p.start < "2023-01-01" || !p.end || !p.filed || typeof p.val !== "number" || !Number.isFinite(p.val) || p.val < 0) continue;
        const key = `${p.filed}|${p.start}|${p.end}`;
        if (out.has(key) && out.get(key)!.val !== p.val) throw new Error("WEC同申报资本开支总额冲突");
        out.set(key, p);
      }
    }
    return [...out.values()];
  }
  const tags = CASH_CAPEX_COMPONENTS[Number(shape?.cik)];
  if (!tags) return [];
  const groups = new Map<string, { sample: SecFactPoint; amounts: Map<string, number> }>();
  for (const tag of tags) {
    const [ns, name] = tag.split(":") as [string, string];
    for (const p of shape.facts?.[ns]?.[name]?.units?.USD ?? []) {
      if (!p.start || !p.end || !p.accn || !p.filed || typeof p.val !== "number" || !Number.isFinite(p.val) || p.val < 0) continue;
      const key = `${p.accn}|${p.filed}|${p.start}|${p.end}`;
      let group = groups.get(key);
      if (!group) { group = { sample: p, amounts: new Map() }; groups.set(key, group); }
      if (group.amounts.has(tag) && group.amounts.get(tag) !== p.val) throw new Error("同申报现金资本开支分项冲突");
      group.amounts.set(tag, p.val);
    }
  }
  return [...groups.values()].filter(g => g.amounts.size === tags.length)
    .map(g => ({ ...g.sample, val: [...g.amounts.values()].reduce((a, b) => a + b, 0) }));
}
