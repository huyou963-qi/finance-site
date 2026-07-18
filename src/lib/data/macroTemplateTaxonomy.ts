import type { MacroChartTemplate } from "@/lib/data/macroPresetTemplates";
import { DEFAULT_BUILTIN_TEMPLATE_FOLDER_IDS } from "@/lib/data/macroPresetTemplates";

/** 浏览入口：全球对比 vs 单国分析 */
export type MacroTemplateBrowseMode = "global" | "country";

/** 展示用 scope（与落库 folder 无关） */
export type MacroTemplateScope = "global" | "US" | "CN" | "JP";

export type MacroTemplateDimensionId =
  | "economy"
  | "inflation"
  | "labor"
  | "fiscal"
  | "monetary"
  | "housing"
  | "cycle-risk"
  | "consumer-balance"
  | "external-dollar"
  | "industry-inventory"
  | "topic";

export type MacroTemplateDimension = {
  id: MacroTemplateDimensionId;
  label: string;
  /** 结构图节点短名 */
  shortLabel: string;
};

export type MacroTemplateCountry = {
  id: Exclude<MacroTemplateScope, "global">;
  label: string;
};

export type MacroTemplatePlacement = {
  scope: MacroTemplateScope;
  dimensionId: MacroTemplateDimensionId;
};

export type MacroTemplateDimensionGroup = {
  dimension: MacroTemplateDimension;
  templates: MacroChartTemplate[];
};

export type MacroTemplateRelationGroupId =
  | "hub"
  | "real"
  | "price"
  | "policy"
  | "meta"
  | "topic";

export type MacroTemplateRelationGroup = {
  id: MacroTemplateRelationGroupId;
  label: string;
  hint?: string;
  dimensionIds: MacroTemplateDimensionId[];
};

export type MacroTemplateEdgeStyle = "solid" | "dashed";

export type MacroTemplateStructureEdge = {
  from: MacroTemplateDimensionId;
  to: MacroTemplateDimensionId;
  style: MacroTemplateEdgeStyle;
  label: string;
};

export type MacroTemplateDimensionLink = {
  overviewPillar?: string;
  blurb: string;
  related: MacroTemplateDimensionId[];
};

/** 共用宏观维度（顺序固定） */
export const MACRO_TEMPLATE_DIMENSIONS: MacroTemplateDimension[] = [
  { id: "economy", label: "经济 Overview", shortLabel: "经济 Overview" },
  { id: "labor", label: "就业", shortLabel: "就业" },
  { id: "inflation", label: "通胀", shortLabel: "通胀" },
  { id: "consumer-balance", label: "消费与居民资产负债", shortLabel: "消费" },
  { id: "industry-inventory", label: "制造业与库存周期", shortLabel: "制造业" },
  { id: "housing", label: "住房与地产", shortLabel: "住房" },
  { id: "external-dollar", label: "对外部门与美元", shortLabel: "对外" },
  { id: "monetary", label: "货币政策与金融条件", shortLabel: "货币金融" },
  { id: "fiscal", label: "财政", shortLabel: "财政" },
  { id: "cycle-risk", label: "增长动能与衰退风险", shortLabel: "周期风险" },
  { id: "topic", label: "专题", shortLabel: "专题" },
];

const DIMENSION_BY_ID = Object.fromEntries(
  MACRO_TEMPLATE_DIMENSIONS.map((d) => [d.id, d]),
) as Record<MacroTemplateDimensionId, MacroTemplateDimension>;

export function getMacroTemplateDimension(
  id: MacroTemplateDimensionId,
): MacroTemplateDimension {
  return DIMENSION_BY_ID[id];
}

/**
 * 结构图层（对齐线框图）：
 * Overview → 实体与需求(含就业) → 价格(通胀) → 政策 → 综合研判
 */
export const MACRO_TEMPLATE_RELATION_GROUPS: MacroTemplateRelationGroup[] = [
  {
    id: "hub",
    label: "枢纽",
    hint: "L1–L5",
    dimensionIds: ["economy"],
  },
  {
    id: "real",
    label: "实体与需求",
    dimensionIds: [
      "consumer-balance",
      "labor",
      "industry-inventory",
      "housing",
      "external-dollar",
    ],
  },
  {
    id: "price",
    label: "价格",
    dimensionIds: ["inflation"],
  },
  {
    id: "policy",
    label: "政策",
    dimensionIds: ["monetary", "fiscal"],
  },
  {
    id: "meta",
    label: "综合研判",
    dimensionIds: ["cycle-risk"],
  },
  {
    id: "topic",
    label: "专题",
    dimensionIds: ["topic"],
  },
];

/**
 * 线框图连线：
 * 实线主轴 Overview→制造业→通胀→货币/财政
 * 虚线：消费/就业/住房/对外/货币/财政 → 周期风险
 */
export const MACRO_TEMPLATE_STRUCTURE_EDGES: MacroTemplateStructureEdge[] = [
  { from: "economy", to: "consumer-balance", style: "solid", label: "下钻" },
  { from: "economy", to: "labor", style: "solid", label: "下钻" },
  { from: "economy", to: "industry-inventory", style: "solid", label: "下钻" },
  { from: "economy", to: "housing", style: "solid", label: "下钻" },
  { from: "economy", to: "external-dollar", style: "solid", label: "下钻" },
  { from: "industry-inventory", to: "inflation", style: "solid", label: "价格传导" },
  { from: "inflation", to: "monetary", style: "solid", label: "政策响应" },
  { from: "inflation", to: "fiscal", style: "solid", label: "政策响应" },
  { from: "consumer-balance", to: "cycle-risk", style: "dashed", label: "综合引用" },
  { from: "labor", to: "cycle-risk", style: "dashed", label: "综合引用" },
  { from: "housing", to: "cycle-risk", style: "dashed", label: "综合引用" },
  { from: "external-dollar", to: "cycle-risk", style: "dashed", label: "综合引用" },
  { from: "monetary", to: "cycle-risk", style: "dashed", label: "综合引用" },
  { from: "fiscal", to: "cycle-risk", style: "dashed", label: "综合引用" },
];

/** 右侧详情：承接说明 + 关联 chips（对齐线框「通胀」示例） */
export const MACRO_TEMPLATE_DIMENSION_LINKS: Record<
  MacroTemplateDimensionId,
  MacroTemplateDimensionLink
> = {
  economy: {
    overviewPillar: "L1–L5",
    blurb: "总量快照枢纽；进入实体、价格与政策各层的入口",
    related: ["labor", "inflation", "consumer-balance", "monetary", "cycle-risk"],
  },
  labor: {
    overviewPillar: "L3",
    blurb: "承接 Overview L3 · 实体与需求中的就业侧",
    related: ["economy", "inflation", "consumer-balance", "cycle-risk"],
  },
  inflation: {
    overviewPillar: "L4",
    blurb: "承接 Overview L4 · 价格锚",
    related: ["economy", "monetary", "housing", "labor"],
  },
  "consumer-balance": {
    overviewPillar: "L2C",
    blurb: "承接 Overview L2C · 消费与居民资产负债",
    related: ["economy", "labor", "cycle-risk", "fiscal"],
  },
  "industry-inventory": {
    overviewPillar: "活动",
    blurb: "制造业景气与库存；主轴实线通向价格（通胀）",
    related: ["economy", "inflation", "labor", "cycle-risk"],
  },
  housing: {
    overviewPillar: "L2I",
    blurb: "承接 Overview L2I · 住房与地产（虚线参与周期研判）",
    related: ["economy", "inflation", "monetary", "cycle-risk"],
  },
  "external-dollar": {
    overviewPillar: "L2X",
    blurb: "承接 Overview L2X · 对外部门与美元",
    related: ["economy", "monetary", "cycle-risk"],
  },
  monetary: {
    overviewPillar: "L5",
    blurb: "政策层 · 承接价格信号；虚线汇入周期风险",
    related: ["economy", "inflation", "fiscal", "cycle-risk"],
  },
  fiscal: {
    overviewPillar: "L2G",
    blurb: "政策层 · 财政工具；虚线汇入周期风险",
    related: ["economy", "inflation", "monetary", "cycle-risk"],
  },
  "cycle-risk": {
    overviewPillar: "综合",
    blurb: "综合研判；虚线汇总实体外沿与政策信号",
    related: [
      "economy",
      "labor",
      "consumer-balance",
      "housing",
      "monetary",
      "fiscal",
    ],
  },
  topic: {
    blurb: "无法归入支柱结构的专题模板",
    related: ["economy"],
  },
};

export const MACRO_TEMPLATE_COUNTRIES: MacroTemplateCountry[] = [
  { id: "US", label: "美国" },
  { id: "CN", label: "中国" },
  { id: "JP", label: "日本" },
];

const FOLDER_ID_TO_DIMENSION: Record<string, MacroTemplateDimensionId> = {
  "folder-builtin-us-economy": "economy",
  "folder-builtin-us-cpi": "inflation",
  "folder-builtin-us-labor": "labor",
  "folder-builtin-us-fiscal": "fiscal",
  "folder-builtin-us-monetary": "monetary",
  "folder-builtin-us-housing": "housing",
  "folder-builtin-us-cycle-risk": "cycle-risk",
  "folder-builtin-us-consumer-balance": "consumer-balance",
  "folder-builtin-us-external-dollar": "external-dollar",
  "folder-builtin-us-industry-inventory": "industry-inventory",
};

/** 内置模板 id → 展示归类 */
const BUILTIN_PLACEMENT: Record<string, MacroTemplatePlacement> = {
  "builtin-debt-capacity-4country": { scope: "global", dimensionId: "economy" },
  "builtin-gold-analysis": { scope: "global", dimensionId: "topic" },
  "builtin-us-overview": { scope: "US", dimensionId: "economy" },
  "builtin-china-overview": { scope: "CN", dimensionId: "economy" },
  "builtin-japan-overview": { scope: "JP", dimensionId: "economy" },
  "builtin-us-econ-overview": { scope: "US", dimensionId: "economy" },
  "builtin-us-econ-demand": { scope: "US", dimensionId: "economy" },
  "builtin-us-cpi-overview": { scope: "US", dimensionId: "inflation" },
  "builtin-us-cpi-drivers": { scope: "US", dimensionId: "inflation" },
  "builtin-us-labor-overview": { scope: "US", dimensionId: "labor" },
  "builtin-us-labor-drivers": { scope: "US", dimensionId: "labor" },
  "builtin-us-fiscal-overview": { scope: "US", dimensionId: "fiscal" },
  "builtin-us-fiscal-structure": { scope: "US", dimensionId: "fiscal" },
  "builtin-us-fiscal-highfreq": { scope: "US", dimensionId: "fiscal" },
  "builtin-us-monetary-overview": { scope: "US", dimensionId: "monetary" },
  "builtin-us-monetary-conditions": { scope: "US", dimensionId: "monetary" },
  "builtin-us-housing-activity": { scope: "US", dimensionId: "housing" },
  "builtin-us-housing-price-finance": { scope: "US", dimensionId: "housing" },
  "builtin-us-cycle-risk-signals": { scope: "US", dimensionId: "cycle-risk" },
  "builtin-us-cycle-risk-momentum": { scope: "US", dimensionId: "cycle-risk" },
  "builtin-us-consumer-balance-spending": { scope: "US", dimensionId: "consumer-balance" },
  "builtin-us-consumer-balance-balance-sheet": {
    scope: "US",
    dimensionId: "consumer-balance",
  },
  "builtin-us-external-dollar-overview": { scope: "US", dimensionId: "external-dollar" },
  "builtin-us-external-dollar-balance": { scope: "US", dimensionId: "external-dollar" },
  "builtin-us-industry-inventory-orders": {
    scope: "US",
    dimensionId: "industry-inventory",
  },
  "builtin-us-industry-inventory-cycle": {
    scope: "US",
    dimensionId: "industry-inventory",
  },
};

function dimensionFromFolderId(folderId: string | null | undefined): MacroTemplateDimensionId | null {
  if (!folderId) return null;
  const direct = FOLDER_ID_TO_DIMENSION[folderId];
  if (direct) return direct;
  const id = folderId.toLowerCase();
  if (id.includes("cpi") || id.includes("inflat")) return "inflation";
  if (id.includes("labor") || id.includes("employ")) return "labor";
  if (id.includes("fiscal")) return "fiscal";
  if (id.includes("monetary") || id.includes("financ")) return "monetary";
  if (id.includes("housing") || id.includes("real-estate")) return "housing";
  if (id.includes("cycle") || id.includes("recession")) return "cycle-risk";
  if (id.includes("consumer") || id.includes("balance")) return "consumer-balance";
  if (id.includes("external") || id.includes("dollar")) return "external-dollar";
  if (id.includes("industry") || id.includes("inventory")) return "industry-inventory";
  if (id.includes("economy") || id.includes("overview") || id.includes("econ")) return "economy";
  return null;
}

function inferScopeFromText(text: string): MacroTemplateScope | null {
  const t = text.toLowerCase();
  if (
    t.includes("global") ||
    t.includes("四国") ||
    t.includes("多国") ||
    t.includes("全球") ||
    t.includes("4country") ||
    t.includes("cross-country")
  ) {
    return "global";
  }
  if (t.includes("china") || t.includes("中国") || t.includes("-cn") || t.includes("_cn")) {
    return "CN";
  }
  if (t.includes("japan") || t.includes("日本") || t.includes("-jp") || t.includes("_jp")) {
    return "JP";
  }
  if (t.includes("us_") || t.includes("us-") || t.includes("美国") || t.includes("u.s.")) {
    return "US";
  }
  return null;
}

/**
 * 解析系统模板的展示归类。
 * @param folderIdByTemplate 可选：管理员 folder 归类（自定义系统模板启发式）
 */
export function resolveTemplatePlacement(
  tpl: MacroChartTemplate,
  folderIdByTemplate?: Record<string, string | null>,
): MacroTemplatePlacement {
  const hardcoded = BUILTIN_PLACEMENT[tpl.id];
  if (hardcoded) return hardcoded;

  const folderId =
    folderIdByTemplate?.[tpl.id] ??
    tpl.folderId ??
    DEFAULT_BUILTIN_TEMPLATE_FOLDER_IDS[tpl.id] ??
    null;

  const dimensionId = dimensionFromFolderId(folderId) ?? "topic";
  const inferred =
    inferScopeFromText(`${tpl.id} ${tpl.name} ${tpl.description ?? ""}`) ?? "US";

  return { scope: inferred, dimensionId };
}

function targetScopeForBrowse(
  mode: MacroTemplateBrowseMode,
  country: Exclude<MacroTemplateScope, "global">,
): MacroTemplateScope {
  return mode === "global" ? "global" : country;
}

export function groupSystemTemplatesForBrowse(
  templates: MacroChartTemplate[],
  mode: MacroTemplateBrowseMode,
  country: Exclude<MacroTemplateScope, "global">,
  folderIdByTemplate?: Record<string, string | null>,
): MacroTemplateDimensionGroup[] {
  const targetScope = targetScopeForBrowse(mode, country);

  const byDimension = new Map<MacroTemplateDimensionId, MacroChartTemplate[]>();
  for (const dim of MACRO_TEMPLATE_DIMENSIONS) {
    byDimension.set(dim.id, []);
  }

  for (const tpl of templates) {
    const placement = resolveTemplatePlacement(tpl, folderIdByTemplate);
    if (placement.scope !== targetScope) continue;
    const list = byDimension.get(placement.dimensionId);
    if (list) list.push(tpl);
    else byDimension.get("topic")!.push(tpl);
  }

  return MACRO_TEMPLATE_DIMENSIONS.map((dimension) => ({
    dimension,
    templates: byDimension.get(dimension.id) ?? [],
  }));
}

/** 当前浏览 scope 下某一维度的模板 */
export function getTemplatesForDimension(
  templates: MacroChartTemplate[],
  mode: MacroTemplateBrowseMode,
  country: Exclude<MacroTemplateScope, "global">,
  dimensionId: MacroTemplateDimensionId,
  folderIdByTemplate?: Record<string, string | null>,
): MacroChartTemplate[] {
  const targetScope = targetScopeForBrowse(mode, country);
  return templates.filter((tpl) => {
    const placement = resolveTemplatePlacement(tpl, folderIdByTemplate);
    return placement.scope === targetScope && placement.dimensionId === dimensionId;
  });
}

/** 各维度在当前 scope 下的模板数量 */
export function countTemplatesByDimension(
  templates: MacroChartTemplate[],
  mode: MacroTemplateBrowseMode,
  country: Exclude<MacroTemplateScope, "global">,
  folderIdByTemplate?: Record<string, string | null>,
): Record<MacroTemplateDimensionId, number> {
  const counts = Object.fromEntries(
    MACRO_TEMPLATE_DIMENSIONS.map((d) => [d.id, 0]),
  ) as Record<MacroTemplateDimensionId, number>;

  const targetScope = targetScopeForBrowse(mode, country);
  for (const tpl of templates) {
    const placement = resolveTemplatePlacement(tpl, folderIdByTemplate);
    if (placement.scope !== targetScope) continue;
    counts[placement.dimensionId] = (counts[placement.dimensionId] ?? 0) + 1;
  }
  return counts;
}

/** 某国家是否至少有一条已归类模板（用于 chip 是否“有内容”） */
export function countryHasTemplates(
  templates: MacroChartTemplate[],
  country: Exclude<MacroTemplateScope, "global">,
  folderIdByTemplate?: Record<string, string | null>,
): boolean {
  return templates.some(
    (tpl) => resolveTemplatePlacement(tpl, folderIdByTemplate).scope === country,
  );
}

/** 从某节点出发、指向某目标的结构边（用于节点旁注） */
export function edgesFromDimension(
  dimensionId: MacroTemplateDimensionId,
): MacroTemplateStructureEdge[] {
  return MACRO_TEMPLATE_STRUCTURE_EDGES.filter((e) => e.from === dimensionId);
}
