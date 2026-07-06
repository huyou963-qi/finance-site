import type { MacroSlotAssignment } from "@/lib/macroPartition";
import type { MacroSelectedListItem } from "@/lib/macroSelectedList";
import type {
  MacroChartDisplayConfig,
  MacroSeriesChartType,
  MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";
import {
  CHINA_OVERVIEW_BY_CODE,
  CHINA_OVERVIEW_SERIES,
  chinaOverviewCodeFromMdsKey,
  chinaOverviewMdsKey,
} from "@/lib/data/chinaOverviewLayout";
import {
  JAPAN_OVERVIEW_BY_CODE,
  JAPAN_OVERVIEW_CHART_SERIES,
  japanOverviewCodeFromMdsKey,
  japanOverviewMdsKey,
} from "@/lib/data/japanOverviewLayout";
import {
  US_OVERVIEW_BY_CODE,
  US_OVERVIEW_SERIES,
  usOverviewCodeFromMdsKey,
  usOverviewMdsKey,
} from "@/lib/data/usOverviewLayout";
import {
  GOLD_ANALYSIS_SERIES,
  goldAnalysisMdsKey,
} from "@/lib/data/goldAnalysisLayout";
import {
  BUILTIN_US_CPI_DRIVERS_TEMPLATE,
  BUILTIN_US_CPI_OVERVIEW_TEMPLATE,
  BUILTIN_US_CPI_TEMPLATE_IDS,
  BUILTIN_US_CPI_TEMPLATES,
} from "@/lib/data/cpiAnalysisLayout";
import {
  BUILTIN_US_LABOR_DRIVERS_TEMPLATE,
  BUILTIN_US_LABOR_OVERVIEW_TEMPLATE,
  BUILTIN_US_LABOR_TEMPLATE_IDS,
  BUILTIN_US_LABOR_TEMPLATES,
} from "@/lib/data/laborAnalysisLayout";
import {
  BUILTIN_US_FISCAL_HIGHFREQ_TEMPLATE,
  BUILTIN_US_FISCAL_OVERVIEW_TEMPLATE,
  BUILTIN_US_FISCAL_STRUCTURE_TEMPLATE,
  BUILTIN_US_FISCAL_TEMPLATE_IDS,
  BUILTIN_US_FISCAL_TEMPLATES,
} from "@/lib/data/fiscalAnalysisLayout";
import {
  BUILTIN_US_ECON_DEMAND_TEMPLATE,
  BUILTIN_US_ECON_OVERVIEW_TEMPLATE,
  BUILTIN_US_ECON_TEMPLATE_IDS,
  BUILTIN_US_ECON_TEMPLATES,
} from "@/lib/data/overviewAnalysisLayout";
import {
  BUILTIN_US_MONETARY_CONDITIONS_TEMPLATE,
  BUILTIN_US_MONETARY_OVERVIEW_TEMPLATE,
  BUILTIN_US_MONETARY_TEMPLATE_IDS,
  BUILTIN_US_MONETARY_TEMPLATES,
} from "@/lib/data/monetaryAnalysisLayout";
import {
  BUILTIN_US_HOUSING_ACTIVITY_TEMPLATE,
  BUILTIN_US_HOUSING_PRICE_FINANCE_TEMPLATE,
  BUILTIN_US_HOUSING_TEMPLATE_IDS,
  BUILTIN_US_HOUSING_TEMPLATES,
} from "@/lib/data/housingAnalysisLayout";

export {
  BUILTIN_US_CPI_DRIVERS_TEMPLATE,
  BUILTIN_US_CPI_OVERVIEW_TEMPLATE,
  BUILTIN_US_CPI_TEMPLATES,
  BUILTIN_US_ECON_DEMAND_TEMPLATE,
  BUILTIN_US_ECON_OVERVIEW_TEMPLATE,
  BUILTIN_US_ECON_TEMPLATES,
  BUILTIN_US_FISCAL_HIGHFREQ_TEMPLATE,
  BUILTIN_US_FISCAL_OVERVIEW_TEMPLATE,
  BUILTIN_US_FISCAL_STRUCTURE_TEMPLATE,
  BUILTIN_US_FISCAL_TEMPLATES,
  BUILTIN_US_LABOR_DRIVERS_TEMPLATE,
  BUILTIN_US_LABOR_OVERVIEW_TEMPLATE,
  BUILTIN_US_LABOR_TEMPLATES,
  BUILTIN_US_MONETARY_CONDITIONS_TEMPLATE,
  BUILTIN_US_MONETARY_OVERVIEW_TEMPLATE,
  BUILTIN_US_MONETARY_TEMPLATES,
  BUILTIN_US_HOUSING_ACTIVITY_TEMPLATE,
  BUILTIN_US_HOUSING_PRICE_FINANCE_TEMPLATE,
  BUILTIN_US_HOUSING_TEMPLATES,
};

export type MacroChartTemplate = {
  id: string;
  name: string;
  description?: string;
  /** 各指标解读说明（indicatorKey → 文本） */
  indicatorIntroNotes?: Record<string, string>;
  /** 各图位解读说明（slotIndex 字符串 "0"… → 文本；与 displayConfig.slotTitles 对应） */
  chartIntroNotes?: Record<string, string>;
  selectedKeys: string[];
  /** 已选指标列表（含分割线），顺序即展示与提取顺序 */
  selectedListItems?: MacroSelectedListItem[];
  layoutMode: 1 | 2 | 3 | 4 | 5 | 6;
  slotAssignment: MacroSlotAssignment;
  seriesVisualMap: MacroSeriesVisualConfigMap;
  displayConfig?: MacroChartDisplayConfig;
  seriesCalcConfigMap?: MacroSeriesCalcConfigMap;
  derivedCalcs?: MacroDerivedCalc[];
  createdAtIso: string;
  builtIn?: boolean;
  /** 用户模板所属文件夹；系统模板文件夹与归类存于 SystemMacroChartPrefs */
  folderId?: string | null;
};

export type MacroTemplateFolderScope = "builtin" | "user";

export type MacroTemplateFolder = {
  id: string;
  name: string;
  scope: MacroTemplateFolderScope;
};

export type MacroSeriesCalcOp = "none" | "pctChange" | "yoy" | "diff" | "cumsum";
export type MacroFrequencyAdjust = "keep" | "month" | "quarter" | "year";
export type MacroUnitAdjust = "keep" | "x0.01" | "x100";
export type MacroResampleMethod = "avg" | "start" | "end";

export type MacroSeriesCalcConfig = {
  op: MacroSeriesCalcOp;
  frequency: MacroFrequencyAdjust;
  unit: MacroUnitAdjust;
  resampleMethod: MacroResampleMethod;
};

export type MacroSeriesCalcConfigMap = Record<string, MacroSeriesCalcConfig>;

export type MacroDerivedCalcOp = "add" | "sub" | "mul" | "div" | "ratio" | "spread";

export type MacroDerivedCalc = {
  id: string;
  leftKey: string;
  rightKey: string;
  op: MacroDerivedCalcOp;
  name: string;
};

/** 代码内置系统模板文件夹（DB 无配置时合并） */
export const DEFAULT_BUILTIN_TEMPLATE_FOLDERS: MacroTemplateFolder[] = [
  { id: "folder-builtin-us-economy", name: "美国经济 Overview", scope: "builtin" },
  { id: "folder-builtin-us-cpi", name: "美国通胀分析", scope: "builtin" },
  { id: "folder-builtin-us-labor", name: "美国就业市场", scope: "builtin" },
  { id: "folder-builtin-us-fiscal", name: "美国财政分析", scope: "builtin" },
  { id: "folder-builtin-us-monetary", name: "美国货币政策与金融条件", scope: "builtin" },
  { id: "folder-builtin-us-housing", name: "美国住房与地产", scope: "builtin" },
];

export const DEFAULT_BUILTIN_TEMPLATE_FOLDER_IDS: Record<string, string | null> = {
  "builtin-us-econ-overview": "folder-builtin-us-economy",
  "builtin-us-econ-demand": "folder-builtin-us-economy",
  "builtin-us-cpi-overview": "folder-builtin-us-cpi",
  "builtin-us-cpi-drivers": "folder-builtin-us-cpi",
  "builtin-us-labor-overview": "folder-builtin-us-labor",
  "builtin-us-labor-drivers": "folder-builtin-us-labor",
  "builtin-us-fiscal-overview": "folder-builtin-us-fiscal",
  "builtin-us-fiscal-structure": "folder-builtin-us-fiscal",
  "builtin-us-fiscal-highfreq": "folder-builtin-us-fiscal",
  "builtin-us-monetary-overview": "folder-builtin-us-monetary",
  "builtin-us-monetary-conditions": "folder-builtin-us-monetary",
  "builtin-us-housing-activity": "folder-builtin-us-housing",
  "builtin-us-housing-price-finance": "folder-builtin-us-housing",
};

const DEBT_SELECTED_KEYS: string[] = [
  "mds:debtcap_us_leverage_household",
  "mds:debtcap_us_leverage_non_financial_corporate",
  "mds:debtcap_us_leverage_nominal_government",
  "mds:debtcap_us_debt_service_household",
  "mds:debtcap_us_debt_service_private_non_financial",
  "mds:debtcap_us_debt_service_non_financial_corporate",
  "mds:debtcap_jp_leverage_household",
  "mds:debtcap_jp_leverage_non_financial_corporate",
  "mds:debtcap_jp_leverage_nominal_government",
  "mds:debtcap_jp_debt_service_household",
  "mds:debtcap_jp_debt_service_private_non_financial",
  "mds:debtcap_jp_debt_service_non_financial_corporate",
  "mds:debtcap_cn_leverage_household",
  "mds:debtcap_cn_leverage_non_financial_corporate",
  "mds:debtcap_cn_leverage_nominal_government",
  "mds:debtcap_cn_debt_service_private_non_financial",
  "mds:debtcap_de_leverage_household",
  "mds:debtcap_de_leverage_non_financial_corporate",
  "mds:debtcap_de_leverage_nominal_government",
  "mds:debtcap_de_debt_service_household",
  "mds:debtcap_de_debt_service_private_non_financial",
  "mds:debtcap_de_debt_service_non_financial_corporate",
];

function buildDebtSlotAssignment(): MacroSlotAssignment {
  const out: MacroSlotAssignment = {};
  for (const key of DEBT_SELECTED_KEYS) {
    if (key.includes("_us_")) out[key] = 0;
    else if (key.includes("_jp_")) out[key] = 1;
    else if (key.includes("_cn_")) out[key] = 2;
    else if (key.includes("_de_")) out[key] = 3;
    else out[key] = null;
  }
  return out;
}

function buildDebtSeriesVisualMap(): MacroSeriesVisualConfigMap {
  const out: MacroSeriesVisualConfigMap = {};
  for (const key of DEBT_SELECTED_KEYS) {
    if (key.includes("_leverage_")) {
      const color = key.endsWith("_household")
        ? "#f08a8a"
        : key.endsWith("_non_financial_corporate")
          ? "#6e7fb8"
          : "#d9b15c";
      out[key] = {
        axis: "left",
        chartType: "stackBar",
        color,
        showEndLabel: true,
        stackGroup: "debtcap-leverage",
      };
    } else if (key.includes("private_non_financial")) {
      out[key] = {
        axis: "right",
        chartType: "dashedLine",
        color: "#6ccad1",
        showEndLabel: true,
      };
    } else {
      const color = key.endsWith("_household") ? "#f4b165" : "#3e4d83";
      out[key] = {
        axis: "right",
        chartType: "line",
        color,
        showEndLabel: true,
      };
    }
  }
  return out;
}

export const BUILTIN_DEBT_CAPACITY_TEMPLATE: MacroChartTemplate = {
  id: "builtin-debt-capacity-4country",
  name: "四国偿债能力（美日中德）",
  description: "与导入 Excel 对应：杠杆率堆叠柱 + 偿债率右轴折线，四图分国展示。",
  selectedKeys: DEBT_SELECTED_KEYS,
  layoutMode: 4,
  slotAssignment: buildDebtSlotAssignment(),
  seriesVisualMap: buildDebtSeriesVisualMap(),
  displayConfig: {
    ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
    legendPosition: "bottom",
    lineWidth: 1.8,
    showSymbols: false,
  },
  createdAtIso: "2026-05-27T00:00:00.000Z",
  builtIn: true,
};

/** 黄金分析模板：金价/美元、利率与通胀、管理基金持仓、COMEX 库存、ETF、全球储备 */
function buildGoldAnalysisSelectedKeys(): string[] {
  return GOLD_ANALYSIS_SERIES.map((row) => goldAnalysisMdsKey(row.code));
}

function buildGoldAnalysisSlotAssignment(): MacroSlotAssignment {
  const out: MacroSlotAssignment = {};
  for (const row of GOLD_ANALYSIS_SERIES) {
    out[goldAnalysisMdsKey(row.code)] = row.panel == null ? null : row.panel - 1;
  }
  return out;
}

function buildGoldAnalysisVisualMap(): MacroSeriesVisualConfigMap {
  const out: MacroSeriesVisualConfigMap = {};
  for (const row of GOLD_ANALYSIS_SERIES) {
    out[goldAnalysisMdsKey(row.code)] = {
      axis: row.axis,
      chartType: row.chartType,
      color: row.color,
      showEndLabel: true,
      ...(row.stackGroup ? { stackGroup: row.stackGroup } : {}),
    };
  }
  return out;
}

export const BUILTIN_GOLD_ANALYSIS_TEMPLATE: MacroChartTemplate = {
  id: "builtin-gold-analysis",
  name: "黄金分析",
  description:
    "由 黄金期货头寸.xlsx 导入的 28 项黄金市场指标：金价/美元、利率与通胀、管理基金持仓、COMEX 库存、黄金 ETF 与全球储备。",
  selectedKeys: buildGoldAnalysisSelectedKeys(),
  layoutMode: 6,
  slotAssignment: buildGoldAnalysisSlotAssignment(),
  seriesVisualMap: buildGoldAnalysisVisualMap(),
  displayConfig: {
    ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
    legendPosition: "bottom",
    xLabelRotate: 24,
    xLabelFontSize: 10,
    yLabelFontSize: 10,
    lineWidth: 1.6,
    barMaxWidth: 14,
    showSymbols: false,
    lineSmooth: false,
    areaOpacity: 0.25,
  },
  createdAtIso: "2026-06-06T00:00:00.000Z",
  builtIn: true,
};

export const BUILTIN_US_OVERVIEW_TEMPLATE: MacroChartTemplate = {
  id: "builtin-us-overview",
  name: "US_Overview",
  description:
    "由 US_Overview.xlsx 导入的美国总览图组。点击后自动从数据库读取并按预置样式绘制。",
  selectedKeys: [],
  layoutMode: 6,
  slotAssignment: {},
  seriesVisualMap: {},
  displayConfig: {
    ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
    legendPosition: "bottom",
    xLabelRotate: 24,
    xLabelFontSize: 10,
    yLabelFontSize: 10,
    lineWidth: 1.8,
    barMaxWidth: 16,
    showSymbols: false,
    lineSmooth: true,
    areaOpacity: 0.2,
  },
  createdAtIso: "2026-05-27T00:00:00.000Z",
  builtIn: true,
};

export const BUILTIN_CHINA_OVERVIEW_TEMPLATE: MacroChartTemplate = {
  id: "builtin-china-overview",
  name: "China_Overview",
  description:
    "由 China_Overview.xlsx 导入的中国总览图组。点击后自动从数据库读取并按预置样式绘制。",
  selectedKeys: [],
  layoutMode: 6,
  slotAssignment: {},
  seriesVisualMap: {},
  displayConfig: {
    ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
    legendPosition: "bottom",
    xLabelRotate: 24,
    xLabelFontSize: 10,
    yLabelFontSize: 10,
    lineWidth: 1.8,
    barMaxWidth: 16,
    showSymbols: false,
    lineSmooth: true,
    areaOpacity: 0.2,
  },
  createdAtIso: "2026-05-31T00:00:00.000Z",
  builtIn: true,
};

export const BUILTIN_JAPAN_OVERVIEW_TEMPLATE: MacroChartTemplate = {
  id: "builtin-japan-overview",
  name: "Japan_Overview",
  description:
    "由 Japan_Overview.xlsx 导入的日本总览图组。点击后自动从数据库读取并按预置样式绘制。",
  selectedKeys: [],
  layoutMode: 6,
  slotAssignment: {},
  seriesVisualMap: {},
  displayConfig: {
    ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
    legendPosition: "bottom",
    xLabelRotate: 24,
    xLabelFontSize: 10,
    yLabelFontSize: 10,
    lineWidth: 1.8,
    barMaxWidth: 16,
    showSymbols: false,
    lineSmooth: true,
    areaOpacity: 0.2,
  },
  createdAtIso: "2026-05-31T00:00:00.000Z",
  builtIn: true,
};

function buildUsOverviewSlotAssignment(keys: string[]): MacroSlotAssignment {
  const out: MacroSlotAssignment = {};
  for (const key of keys) {
    const code = usOverviewCodeFromMdsKey(key);
    const panel = code ? (US_OVERVIEW_BY_CODE.get(code)?.panel ?? 1) : 1;
    out[key] = panel - 1;
  }
  return out;
}

function buildUsOverviewVisualMap(keys: string[]): MacroSeriesVisualConfigMap {
  const out: MacroSeriesVisualConfigMap = {};
  for (const key of keys) {
    const code = usOverviewCodeFromMdsKey(key);
    const def = code ? US_OVERVIEW_BY_CODE.get(code) : undefined;
    if (!def) continue;
    out[key] = {
      axis: def.axis,
      chartType: def.chartType,
      color: def.color,
      showEndLabel: true,
    };
  }
  return out;
}

function buildChinaOverviewSlotAssignment(keys: string[]): MacroSlotAssignment {
  const out: MacroSlotAssignment = {};
  for (const key of keys) {
    const code = chinaOverviewCodeFromMdsKey(key);
    const panel = code ? (CHINA_OVERVIEW_BY_CODE.get(code)?.panel ?? 1) : 1;
    out[key] = panel - 1;
  }
  return out;
}

function buildChinaOverviewVisualMap(keys: string[]): MacroSeriesVisualConfigMap {
  const out: MacroSeriesVisualConfigMap = {};
  for (const key of keys) {
    const code = chinaOverviewCodeFromMdsKey(key);
    const def = code ? CHINA_OVERVIEW_BY_CODE.get(code) : undefined;
    if (!def) continue;
    out[key] = {
      axis: def.axis,
      chartType: def.chartType,
      color: def.color,
      showEndLabel: true,
    };
  }
  return out;
}

function buildJapanOverviewSlotAssignment(keys: string[]): MacroSlotAssignment {
  const out: MacroSlotAssignment = {};
  for (const key of keys) {
    const code = japanOverviewCodeFromMdsKey(key);
    const panel = code ? (JAPAN_OVERVIEW_BY_CODE.get(code)?.panel ?? 1) : 1;
    out[key] = panel - 1;
  }
  return out;
}

function buildJapanOverviewVisualMap(keys: string[]): MacroSeriesVisualConfigMap {
  const out: MacroSeriesVisualConfigMap = {};
  for (const key of keys) {
    const code = japanOverviewCodeFromMdsKey(key);
    const def = code ? JAPAN_OVERVIEW_BY_CODE.get(code) : undefined;
    if (!def) continue;
    out[key] = {
      axis: def.axis,
      chartType: def.chartType,
      color: def.color,
      showEndLabel: true,
    };
  }
  return out;
}

const BUILTIN_OVERVIEW_TEMPLATE_IDS = new Set([
  BUILTIN_US_OVERVIEW_TEMPLATE.id,
  BUILTIN_CHINA_OVERVIEW_TEMPLATE.id,
  BUILTIN_JAPAN_OVERVIEW_TEMPLATE.id,
]);

/** 代码内置的系统模板 id（管理员覆盖配置存于 SystemMacroChartPrefs） */
export const HARDCODED_BUILTIN_TEMPLATE_IDS = new Set([
  BUILTIN_DEBT_CAPACITY_TEMPLATE.id,
  BUILTIN_US_OVERVIEW_TEMPLATE.id,
  BUILTIN_CHINA_OVERVIEW_TEMPLATE.id,
  BUILTIN_JAPAN_OVERVIEW_TEMPLATE.id,
  BUILTIN_GOLD_ANALYSIS_TEMPLATE.id,
  ...BUILTIN_US_CPI_TEMPLATE_IDS,
  ...BUILTIN_US_LABOR_TEMPLATE_IDS,
  ...BUILTIN_US_ECON_TEMPLATE_IDS,
  ...BUILTIN_US_FISCAL_TEMPLATE_IDS,
  ...BUILTIN_US_MONETARY_TEMPLATE_IDS,
  ...BUILTIN_US_HOUSING_TEMPLATE_IDS,
]);

export function resolveBuiltinTemplate(
  tpl: MacroChartTemplate,
  catalogAllowlist: Set<string> | null,
  labelByKey: Map<string, string>,
): MacroChartTemplate {
  if (!BUILTIN_OVERVIEW_TEMPLATE_IDS.has(tpl.id)) {
    return tpl;
  }

  if (tpl.selectedKeys.length > 0 && Object.keys(tpl.slotAssignment).length > 0) {
    const keys =
      catalogAllowlist && catalogAllowlist.size > 0
        ? tpl.selectedKeys.filter((k) => catalogAllowlist.has(k))
        : tpl.selectedKeys;
    return {
      ...tpl,
      selectedKeys: keys,
      displayConfig: tpl.displayConfig ?? DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
    };
  }

  const keysRaw =
    catalogAllowlist && catalogAllowlist.size > 0
      ? [...catalogAllowlist].filter((k) => {
          if (tpl.id === BUILTIN_US_OVERVIEW_TEMPLATE.id) return k.startsWith("mds:usov_");
          if (tpl.id === BUILTIN_CHINA_OVERVIEW_TEMPLATE.id) return k.startsWith("mds:chov_");
          return k.startsWith("mds:jpov_");
        })
      : [];
  const keys =
    tpl.id === BUILTIN_CHINA_OVERVIEW_TEMPLATE.id
      ? CHINA_OVERVIEW_SERIES.map((row) => chinaOverviewMdsKey(row.code)).filter((k) =>
          keysRaw.includes(k),
        )
      : tpl.id === BUILTIN_US_OVERVIEW_TEMPLATE.id
        ? US_OVERVIEW_SERIES.map((row) => usOverviewMdsKey(row.code)).filter((k) =>
            keysRaw.includes(k),
          )
        : JAPAN_OVERVIEW_CHART_SERIES.map((row) => japanOverviewMdsKey(row.code)).filter((k) =>
            keysRaw.includes(k),
          );

  return {
    ...tpl,
    selectedKeys: keys,
    layoutMode: 6,
    slotAssignment:
      tpl.id === BUILTIN_US_OVERVIEW_TEMPLATE.id
        ? buildUsOverviewSlotAssignment(keys)
        : tpl.id === BUILTIN_CHINA_OVERVIEW_TEMPLATE.id
          ? buildChinaOverviewSlotAssignment(keys)
          : buildJapanOverviewSlotAssignment(keys),
    seriesVisualMap:
      tpl.id === BUILTIN_US_OVERVIEW_TEMPLATE.id
        ? buildUsOverviewVisualMap(keys)
        : tpl.id === BUILTIN_CHINA_OVERVIEW_TEMPLATE.id
          ? buildChinaOverviewVisualMap(keys)
          : buildJapanOverviewVisualMap(keys),
    displayConfig: tpl.displayConfig ?? DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
  };
}

