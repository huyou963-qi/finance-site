import { allItemsInGroup } from "@/lib/data/catalogTree";
import { randomUUID } from "@/lib/randomId";
import { buildUsCatalogLayoutCountry } from "./buildUsCatalogLayout";
import type { CatalogLayoutCategory, CatalogLayoutCountry } from "./catalogLayout";
import type { UnifiedCatalogCountry, UnifiedCatalogItem } from "./fredCatalog";
import { US_CATALOG_TOP_LEVEL, type UsCatalogTopLevel } from "./usCatalogTaxonomy";

/** A leaf (a subgroup's direct indicators) must remain scannable in the picker. */
export const MAX_CATALOG_LEAF_ITEMS = 48;

export type GlobalCatalogPlacement = { category: UsCatalogTopLevel; subgroup: string };

const TOP_LEVEL = new Set<string>(US_CATALOG_TOP_LEVEL);
const p = (category: UsCatalogTopLevel, subgroup: string): GlobalCatalogPlacement => ({ category, subgroup });

function chinaPlacement(item: UnifiedCatalogItem): GlobalCatalogPlacement | null {
  const code = item.key.startsWith("mds:") ? item.key.slice(4) : "";
  const label = item.label;
  if (code.startsWith("nbs_cn_cpi_")) return p("通胀与价格", "CPI");
  if (code.startsWith("nbs_cn_ppi_")) {
    if (/(coal|oil_gas|ferrous_mining|nonferrous_mining|nonmetal_mining|mining_support|other_mining)/.test(code)) return p("通胀与价格", "PPI：采矿业");
    if (/(agri_food|food|beverage|tobacco|textile|apparel|leather|wood|furniture|paper|printing|culture_goods)/.test(code)) return p("通胀与价格", "PPI：消费品制造");
    if (/(petroleum_coal|chemicals|pharma|chemical_fiber|rubber_plastic|nonmetal_products)/.test(code)) return p("通胀与价格", "PPI：能源与材料");
    if (/(ferrous_smelting|nonferrous_smelting|metal_products|general_equipment|special_equipment|automobile|transport_equipment|electrical_equipment|electronics|instruments|repair)/.test(code)) return p("通胀与价格", "PPI：装备制造");
    if (/(power_heat|gas|water|resource_recycling|other_manufacturing)/.test(code)) return p("通胀与价格", "PPI：公用事业与其他");
    return p("通胀与价格", "PPI：总项与生产/生活资料");
  }
  if (code.startsWith("nbs_cn_mfg_") || code.startsWith("nbs_cn_non_mfg_") || code.startsWith("chov_c0[56]_")) return p("国民经济", "采购经理指数");
  if (code.startsWith("nbs_cn_industrial_")) {
    if (/(coal|mining|agri_food|food|textile|chemicals|pharma|metal|power_heat|gas|water)/.test(code)) return p("国民经济", "工业增加值：行业");
    if (/(state_owned|private|collective|cooperative|joint_stock|foreign_hkmt)/.test(code)) return p("国民经济", "工业增加值：经济类型");
    return p("国民经济", "工业增加值：总项与门类");
  }
  if (code.startsWith("nbs_cn_gdp_")) return p("国民经济", /支出|最终消费|资本形成|净出口/.test(label) ? "GDP：支出法" : "GDP：生产法与总项");
  if (code.startsWith("nbs_cn_fai_")) return p("国民经济", "固定资产投资");
  if (code.startsWith("nbs_cn_retail_goods_")) return p("国民经济", /粮油|饮料|烟酒|服装|化妆|日用|书报|体育/.test(label) ? "商品零售：日常消费" : "商品零售：耐用及大宗消费");
  if (code.startsWith("nbs_cn_retail_")) return p("国民经济", "社会消费品零售");
  if (code.startsWith("nbs_cn_realestate_")) return p("地产与建筑", /70城|新建商品住宅|二手住宅/.test(label) ? "70 城住房价格" : "房地产开发、销售与资金");
  if (code.startsWith("mof_cn_fiscal_")) return p("财政与公共债务", /支出/.test(label) ? "财政支出" : /基金/.test(label) ? "政府性基金" : "一般公共预算收入");
  if (code.startsWith("pbc_cn_")) return /利率|LPR/.test(label) ? p("利率与信用市场", "贷款利率") : p("货币政策与流动性", "货币、信贷与社会融资");
  if (code.startsWith("safe_cn_")) return /外汇储备|黄金/.test(label) ? p("对外与汇率", "外汇储备与黄金") : /结售汇|收付款/.test(label) ? p("对外与汇率", "银行结售汇与跨境资金") : p("对外与汇率", "国际收支、投资头寸与外债");
  if (code.startsWith("mofcom_cn_trade_")) return /贸易方式/.test(label) ? p("对外与汇率", "货物贸易：贸易方式") : /国别|地区/.test(label) ? p("对外与汇率", "货物贸易：国别地区") : /商品构成/.test(label) ? p("对外与汇率", "货物贸易：商品构成") : p("对外与汇率", "货物贸易：总额");
  return null;
}

/** Maps every country's source category into the same top-level taxonomy as the US. */
export function resolveGlobalCatalogPlacement(item: UnifiedCatalogItem): GlobalCatalogPlacement {
  // 来源根目录下仍按九大经济主题展开；这里为跨国/市场数据源补足稳定的业务落点。
  if (item.countryCode === "SRC_CFTC") return p("对外与汇率", "商品期货持仓");
  if (item.countryCode === "SRC_WTO") return p("对外与汇率", "国际贸易与关税");
  if (item.countryCode === "SRC_BIS") {
    return p("金融条件与银行", "国际银行、信贷与偿债能力");
  }
  if (item.countryCode === "SRC_IMF") {
    return p("国民经济", "国际宏观与经济展望");
  }
  if (item.countryCode === "CN") {
    const hit = chinaPlacement(item);
    if (hit) return hit;
  }

  const text = `${item.categoryName} ${item.label}`.toLowerCase();
  if (/cpi|ppi|price|inflation|通胀|价格|物价/.test(text)) return p("通胀与价格", "综合价格指标");
  if (/unemploy|employment|labor|labour|wage|就业|失业|工资|劳动力/.test(text)) return p("劳动力市场", "就业、失业与工资");
  if (/central bank|money|monetary|m0|m1|m2|liquidity|货币|流动性|存款|贷款|社融/.test(text)) return p("货币政策与流动性", "货币与信贷");
  if (/rate|yield|bond|credit|interest|利率|收益率|债券|信贷/.test(text)) return p("利率与信用市场", "利率、债券与信贷");
  if (/bank|financial condition|金融条件|银行/.test(text)) return p("金融条件与银行", "金融条件与银行体系");
  if (/fiscal|government|debt|budget|财政|政府|债务|预算/.test(text)) return p("财政与公共债务", "财政收支与公共债务");
  if (/house|housing|property|real estate|construction|地产|房地产|住房|建筑/.test(text)) return p("地产与建筑", "房地产与建筑");
  if (/trade|export|import|exchange|foreign|reserve|external|贸易|出口|进口|汇率|外汇|国际收支|外债/.test(text)) return p("对外与汇率", "贸易、汇率与外部部门");
  if (/industry|industrial|pmi|retail|consumption|investment|gdp|output|生产|工业|制造|消费|零售|投资|国民经济|核算|景气/.test(text)) return p("国民经济", "增长、生产与需求");
  return p("国民经济", "其他宏观指标");
}

function boundedSubgroups(items: UnifiedCatalogItem[], subgroup: string) {
  const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  if (sorted.length <= MAX_CATALOG_LEAF_ITEMS) return [{ name: subgroup, items: sorted }];
  const chunks = Array.from({ length: Math.ceil(sorted.length / MAX_CATALOG_LEAF_ITEMS) }, (_, index) => ({
    name: `${subgroup}（${index + 1}）`,
    items: sorted.slice(index * MAX_CATALOG_LEAF_ITEMS, (index + 1) * MAX_CATALOG_LEAF_ITEMS),
  }));
  return chunks;
}

function buildUsLayoutWithFallback(items: UnifiedCatalogItem[]): CatalogLayoutCountry {
  const base = buildUsCatalogLayoutCountry(items);
  const byKey = new Map(items.map((item) => [item.key, item]));
  const categories = base.categories
    .filter((category) => category.name !== "未分配")
    .map((category) => ({ ...category, itemKeys: [...category.itemKeys], subgroups: category.subgroups.map((subgroup) => ({ ...subgroup, itemKeys: [...subgroup.itemKeys] })) }));
  const missing = base.categories.find((category) => category.name === "未分配")?.itemKeys ?? [];
  for (const key of missing) {
    const item = byKey.get(key);
    if (!item) continue;
    const placement = resolveGlobalCatalogPlacement(item);
    let category = categories.find((candidate) => candidate.name === placement.category);
    if (!category) {
      category = { id: randomUUID(), name: placement.category, itemKeys: [], subgroups: [] };
      categories.push(category);
    }
    let subgroup = category.subgroups.find((candidate) => candidate.name === placement.subgroup);
    if (!subgroup) {
      subgroup = { id: randomUUID(), name: placement.subgroup, itemKeys: [] };
      category.subgroups.push(subgroup);
    }
    subgroup.itemKeys.push(key);
  }
  for (const category of categories) {
    category.subgroups = category.subgroups.flatMap((subgroup) => {
      const subgroupItems = subgroup.itemKeys.map((key) => byKey.get(key)).filter((item): item is UnifiedCatalogItem => !!item);
      return boundedSubgroups(subgroupItems, subgroup.name).map((chunk) => ({ id: randomUUID(), name: chunk.name, itemKeys: chunk.items.map((item) => item.key) }));
    });
  }
  return { countryCode: "US", categories };
}

export function buildGlobalCatalogLayout(countries: UnifiedCatalogCountry[]): CatalogLayoutCountry[] {
  return countries.map((country) => {
    if (country.code === "US") return buildUsLayoutWithFallback(country.categories.flatMap(allItemsInGroup));
    const grouped = new Map<string, Map<string, UnifiedCatalogItem[]>>();
    for (const sourceGroup of country.categories) for (const item of allItemsInGroup(sourceGroup)) {
      const placement = resolveGlobalCatalogPlacement(item);
      if (!TOP_LEVEL.has(placement.category)) throw new Error(`Unknown top-level category: ${placement.category}`);
      const bySubgroup = grouped.get(placement.category) ?? new Map<string, UnifiedCatalogItem[]>();
      const values = bySubgroup.get(placement.subgroup) ?? [];
      values.push(item);
      bySubgroup.set(placement.subgroup, values);
      grouped.set(placement.category, bySubgroup);
    }
    const categories: CatalogLayoutCategory[] = US_CATALOG_TOP_LEVEL.flatMap((name) => {
      const bySubgroup = grouped.get(name);
      if (!bySubgroup) return [];
      return [{
        id: randomUUID(),
        name,
        itemKeys: [],
        subgroups: [...bySubgroup.entries()].flatMap(([subgroup, items]) => boundedSubgroups(items, subgroup).map((chunk) => ({ id: randomUUID(), name: chunk.name, itemKeys: chunk.items.map((item) => item.key) }))),
      }];
    });
    return { countryCode: country.code, categories };
  });
}
