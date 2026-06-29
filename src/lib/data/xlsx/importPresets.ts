import type { MacroImportScopeConfig } from "./importMacroWorkbook";

const DEFAULT_COUNTRY_CODE_BY_ZH: Record<string, string> = {
  中国: "CN",
  美国: "US",
  日本: "JP",
  德国: "DE",
  英国: "UK",
  法国: "FR",
  欧元区: "EU",
  韩国: "KR",
  印度: "IN",
  澳大利亚: "AU",
  加拿大: "CA",
};

export const DEBTCAP_PRESET: Omit<MacroImportScopeConfig, "sourceTag"> = {
  scope: "debtcap",
  freqLabel: "季度",
  unit: "%",
  categoryThemeName: "偿债能力",
  countryCodeByZh: DEFAULT_COUNTRY_CODE_BY_ZH,
  metricCodeByZh: {
    杠杆率: "leverage",
    "杠杆率(按名义价值计)": "leverage_nominal",
    偿债率: "debt_service",
  },
  sectorCodeByZh: {
    居民部门: "household",
    非金融企业部门: "non_financial_corporate",
    私营非金融部门: "private_non_financial",
    政府部门: "government",
  },
  catalogCategoryByMetricZh: {
    杠杆率: "偿债能力·杠杆率",
    "杠杆率(按名义价值计)": "偿债能力·杠杆率",
    偿债率: "偿债能力·偿债率",
  },
};

export const ISM_PRESET: Omit<MacroImportScopeConfig, "sourceTag"> = {
  scope: "ism",
  freqLabel: "月",
  unit: "指数",
  categoryThemeName: "ISM 制造业 PMI",
  countryCodeByZh: DEFAULT_COUNTRY_CODE_BY_ZH,
  metricCodeByZh: {
    ISM: "ism",
  },
  sectorCodeByZh: {
    制造业PMI: "headline",
    "制造业PMI:订单库存": "backlog",
    "制造业PMI:就业": "employment",
    "制造业PMI:自有库存": "inventories",
    "制造业PMI:新订单": "new_orders",
    "制造业PMI:物价": "prices",
    "制造业PMI:产出": "production",
    "制造业PMI:供应商交付": "supplier_deliveries",
  },
  catalogCategoryByMetricZh: {
    ISM: "采购经理人指数",
  },
};

export const ISM_SVC_PRESET: Omit<MacroImportScopeConfig, "sourceTag"> = {
  scope: "ism_svc",
  freqLabel: "月",
  unit: "指数",
  categoryThemeName: "ISM 服务业 PMI",
  countryCodeByZh: DEFAULT_COUNTRY_CODE_BY_ZH,
  metricCodeByZh: {
    ISM: "svc",
  },
  sectorCodeByZh: {
    服务业PMI: "headline",
    "服务业PMI:商业活动": "business_activity",
    "服务业PMI:就业": "employment",
    "服务业PMI:新订单": "new_orders",
    "服务业PMI:物价": "prices",
  },
  catalogCategoryByMetricZh: {
    ISM: "采购经理人指数",
  },
};

export type ImportPresetName = "debtcap" | "ism" | "ism_svc";

/** 复制此模板为新数据集 preset（见 .cursor/prompts/macro-xlsx-import.md） */
export const MACRO_IMPORT_PRESET_TEMPLATE: Omit<MacroImportScopeConfig, "sourceTag"> = {
  scope: "your_scope",
  freqLabel: "月",
  unit: "%",
  categoryThemeName: "主题中文名",
  countryCodeByZh: DEFAULT_COUNTRY_CODE_BY_ZH,
  metricCodeByZh: {
    指标中文: "metric_code",
  },
  sectorCodeByZh: {
    子维度中文: "sector_code",
  },
  catalogCategoryByMetricZh: {
    指标中文: "宏观侧栏分类名",
  },
};

export function resolveImportPreset(name: string): Omit<MacroImportScopeConfig, "sourceTag"> | null {
  if (name === "debtcap") return DEBTCAP_PRESET;
  if (name === "ism") return ISM_PRESET;
  if (name === "ism_svc") return ISM_SVC_PRESET;
  return null;
}

export function listImportPresetNames(): ImportPresetName[] {
  return ["debtcap", "ism", "ism_svc"];
}

export { DEFAULT_COUNTRY_CODE_BY_ZH };
