import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

/**
 * 美国制造业与库存周期 — 内置双模板
 *
 * Spec: docs/specs/us-industry-inventory.spec.md
 * 数据: industryInventoryFredSeedCatalog.ts（10 新 FRED）+ 复用 3 条 ISM（mds 键）
 */

export type IndustryInventorySeriesDef = {
  virtualKey: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calc: MacroSeriesCalcConfig;
};

const NONE_KEEP: MacroSeriesCalcConfig = {
  op: "none",
  frequency: "keep",
  unit: "keep",
  resampleMethod: "avg",
};
const YOY_MONTH: MacroSeriesCalcConfig = {
  op: "yoy",
  frequency: "month",
  unit: "keep",
  resampleMethod: "end",
};

/** 模板 ①：制造业 · 景气与订单 */
export const INDUSTRY_INVENTORY_ORDERS_SERIES: readonly IndustryInventorySeriesDef[] = [
  {
    virtualKey: "mds:ism_us_ism_headline",
    displayName: "ISM 制造业 PMI",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: NONE_KEEP,
  },
  {
    virtualKey: "mds:ism_us_ism_new_orders",
    displayName: "ISM 新订单",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calc: NONE_KEEP,
  },
  {
    virtualKey: "fred:DGORDER::yoy",
    displayName: "耐用品新订单 同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: YOY_MONTH,
  },
  {
    virtualKey: "fred:ADXTNO::yoy",
    displayName: "耐用品(除运输)新订单 同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calc: YOY_MONTH,
  },
  {
    virtualKey: "fred:NEWORDER::yoy",
    displayName: "非国防资本品(除飞机)新订单 同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calc: YOY_MONTH,
  },
  {
    virtualKey: "fred:AMDMUO::yoy",
    displayName: "耐用品未完成订单 同比",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: YOY_MONTH,
  },
  {
    virtualKey: "mds:ism_us_ism_inventories",
    displayName: "ISM 库存分项",
    panel: 4,
    axis: "right",
    chartType: "line",
    color: "#6ccad1",
    calc: NONE_KEEP,
  },
];

/** 模板 ②：制造业 · 产出库存与产能 */
export const INDUSTRY_INVENTORY_CYCLE_SERIES: readonly IndustryInventorySeriesDef[] = [
  {
    virtualKey: "fred:IPMAN::yoy",
    displayName: "工业生产·制造业 同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: YOY_MONTH,
  },
  {
    virtualKey: "fred:BUSINV::yoy",
    displayName: "总商业库存 同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: YOY_MONTH,
  },
  {
    virtualKey: "fred:AMTMTI::yoy",
    displayName: "制造业库存 同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calc: YOY_MONTH,
  },
  {
    virtualKey: "fred:ISRATIO",
    displayName: "总业务库销比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calc: NONE_KEEP,
  },
  {
    virtualKey: "fred:MNFCTRIRSA",
    displayName: "制造业库销比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calc: NONE_KEEP,
  },
  {
    virtualKey: "fred:MCUMFN",
    displayName: "制造业产能利用率",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calc: NONE_KEEP,
  },
];

export const INDUSTRY_INVENTORY_ORDERS_SLOT_TITLES: Record<number, string> = {
  0: "L1 软景气：ISM PMI vs 新订单",
  1: "L2 硬订单：耐用品 vs 除运输",
  2: "L3 资本品：核心资本品新订单",
  3: "L4 积压：未完成订单 vs ISM 库存",
};

export const INDUSTRY_INVENTORY_CYCLE_SLOT_TITLES: Record<number, string> = {
  0: "L5 产出：制造业工业生产",
  1: "L6 库存：总商业 vs 制造业",
  2: "L7 库销比：总量 vs 制造业",
  3: "L8 产能：制造业产能利用率",
};

export const INDUSTRY_INVENTORY_ORDERS_DESCRIPTION =
  "【第一步 · 订单链】ISM 软景气 → Census 硬订单 → 核心资本品 → 积压/ISM 库存。判断制造需求是领先扩张还是假信号。说不清时加载「产出库存与产能」。";

export const INDUSTRY_INVENTORY_CYCLE_DESCRIPTION =
  "【第二步 · 库存周期】制造产出 → 库存水平 → 库销比 → 产能利用率。定位主动补库 / 被动积压 / 主动去库与过热风险。";

export const INDUSTRY_INVENTORY_ORDERS_CHART_INTRO: Record<string, string> = {
  "0": "ISM PMI / 新订单：>50 扩张、<50 收缩。新订单领先产出约 1–3 月；与硬订单同向才确认周期转折。",
  "1": "DGORDER 含运输（飞机）噪音；ADXTNO 除运输更稳。硬订单同比转正且与 ISM 共振 → 制造需求实扩张。",
  "2": "NEWORDER（非国防资本品除飞机）是设备投资领先指标，对利率敏感。持续同比扩张通常对应企业 capex 上行。",
  "3": "AMDMUO 同比↑ = 积压加深；ISM 库存↑ + 新订单↓ = 被动积压、去库将至。左右轴对照硬积压与软库存。",
};

export const INDUSTRY_INVENTORY_CYCLE_CHART_INTRO: Record<string, string> = {
  "0": "IPMAN 同比——制造硬产出。订单先拐、产出后确认；与 Overview 的 INDPRO（总量）口径互补。",
  "1": "BUSINV / AMTMTI 同比——库存堆积 vs 消化。销售弱 + 库存同比↑ = 被动积压。",
  "2": "ISRATIO / MNFCTRIRSA——相对销售压力。库销比上行多标志去库压力加大；下行多标志库存偏紧、补库空间。",
  "3": "MCUMFN——制造产能松紧。长期 >80% 偏紧；深度下滑配合去库 = 制造衰退。",
};

function selectedKeys(series: readonly IndustryInventorySeriesDef[]): string[] {
  return series.map((r) => r.virtualKey);
}
function slotAssignment(
  series: readonly IndustryInventorySeriesDef[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const r of series) out[r.virtualKey] = r.panel - 1;
  return out;
}
function visualMap(series: readonly IndustryInventorySeriesDef[]) {
  const out: Record<
    string,
    { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string; showEndLabel: boolean }
  > = {};
  for (const r of series) {
    out[r.virtualKey] = {
      axis: r.axis,
      chartType: r.chartType,
      color: r.color,
      showEndLabel: true,
    };
  }
  return out;
}
function calcConfigMap(series: readonly IndustryInventorySeriesDef[]): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const r of series) out[r.virtualKey] = r.calc;
  return out;
}

function buildTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly IndustryInventorySeriesDef[];
  slotTitles: Record<number, string>;
}): MacroChartTemplate {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    chartIntroNotes: { ...opts.chartIntroNotes },
    selectedKeys: selectedKeys(opts.series),
    layoutMode: 4,
    slotAssignment: slotAssignment(opts.series),
    seriesVisualMap: visualMap(opts.series),
    seriesCalcConfigMap: calcConfigMap(opts.series),
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
      slotTitles: opts.slotTitles,
    },
    createdAtIso: "2026-07-08T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-industry-inventory",
  };
}

export const BUILTIN_US_INDUSTRY_INVENTORY_ORDERS_TEMPLATE = buildTemplate({
  id: "builtin-us-industry-inventory-orders",
  name: "制造业 · 景气与订单",
  description: INDUSTRY_INVENTORY_ORDERS_DESCRIPTION,
  chartIntroNotes: INDUSTRY_INVENTORY_ORDERS_CHART_INTRO,
  series: INDUSTRY_INVENTORY_ORDERS_SERIES,
  slotTitles: INDUSTRY_INVENTORY_ORDERS_SLOT_TITLES,
});

export const BUILTIN_US_INDUSTRY_INVENTORY_CYCLE_TEMPLATE = buildTemplate({
  id: "builtin-us-industry-inventory-cycle",
  name: "制造业 · 产出库存与产能",
  description: INDUSTRY_INVENTORY_CYCLE_DESCRIPTION,
  chartIntroNotes: INDUSTRY_INVENTORY_CYCLE_CHART_INTRO,
  series: INDUSTRY_INVENTORY_CYCLE_SERIES,
  slotTitles: INDUSTRY_INVENTORY_CYCLE_SLOT_TITLES,
});

export const BUILTIN_US_INDUSTRY_INVENTORY_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_INDUSTRY_INVENTORY_ORDERS_TEMPLATE,
  BUILTIN_US_INDUSTRY_INVENTORY_CYCLE_TEMPLATE,
];

export const BUILTIN_US_INDUSTRY_INVENTORY_TEMPLATE_IDS =
  BUILTIN_US_INDUSTRY_INVENTORY_TEMPLATES.map((t) => t.id);

function buildLabelMap(): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const r of [
    ...INDUSTRY_INVENTORY_ORDERS_SERIES,
    ...INDUSTRY_INVENTORY_CYCLE_SERIES,
  ]) {
    m.set(r.virtualKey, r.displayName);
  }
  return m;
}
export const INDUSTRY_INVENTORY_VIRTUAL_KEY_LABELS = buildLabelMap();
