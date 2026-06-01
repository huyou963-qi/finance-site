import type { MacroSlotAssignment } from "@/lib/macroPartition";
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

export type MacroChartTemplate = {
  id: string;
  name: string;
  description?: string;
  selectedKeys: string[];
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

