import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

/**
 * 美国消费与居民资产负债 — 内置双模板
 *
 * Spec: docs/specs/us-consumer-balance.spec.md
 * 数据: consumerBalanceFredSeedCatalog.ts（10 条新 seed + 1 条复用 UMCSENT）
 */

export type ConsumerBalanceCalcOp = "yoy" | "none";

export type ConsumerBalanceAnalysisSeriesDef = {
  virtualKey: string;
  fredId: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calcOp: ConsumerBalanceCalcOp;
};

export function consumerBalanceFredKey(fredId: string, variant?: string): string {
  if (!variant || variant === "level") return `fred:${fredId}`;
  return `fred:${fredId}::${variant}`;
}

function calcConfigFor(row: ConsumerBalanceAnalysisSeriesDef): MacroSeriesCalcConfig {
  if (row.calcOp === "yoy") {
    return { op: "yoy", frequency: "month", unit: "keep", resampleMethod: "end" };
  }
  return { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
}

export function buildConsumerBalanceSeriesCalcConfigMap(
  series: readonly ConsumerBalanceAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const row of series) out[row.virtualKey] = calcConfigFor(row);
  return out;
}

/** 模板 ①：消费 · 支出与景气 */
export const CONSUMER_BALANCE_SPENDING_SERIES: readonly ConsumerBalanceAnalysisSeriesDef[] = [
  {
    virtualKey: consumerBalanceFredKey("RSXFS", "yoy"),
    fredId: "RSXFS",
    displayName: "零售销售（零售贸易）同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "yoy",
  },
  {
    virtualKey: consumerBalanceFredKey("PCEDGC96", "yoy"),
    fredId: "PCEDGC96",
    displayName: "实际 PCE 耐用品同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "yoy",
  },
  {
    virtualKey: consumerBalanceFredKey("PCESC96", "yoy"),
    fredId: "PCESC96",
    displayName: "实际 PCE 服务同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "yoy",
  },
  {
    virtualKey: consumerBalanceFredKey("UMCSENT", "level"),
    fredId: "UMCSENT",
    displayName: "密歇根消费者信心",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "none",
  },
  {
    virtualKey: consumerBalanceFredKey("PSAVERT", "level"),
    fredId: "PSAVERT",
    displayName: "个人储蓄率",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "none",
  },
];

/** 模板 ②：居民 · 资产负债与信用 */
export const CONSUMER_BALANCE_SHEET_SERIES: readonly ConsumerBalanceAnalysisSeriesDef[] = [
  {
    virtualKey: consumerBalanceFredKey("TNWBSHNO", "yoy"),
    fredId: "TNWBSHNO",
    displayName: "家庭净财富同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "yoy",
  },
  {
    virtualKey: consumerBalanceFredKey("TDSP", "level"),
    fredId: "TDSP",
    displayName: "家庭偿债比率",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "none",
  },
  {
    virtualKey: consumerBalanceFredKey("TOTALSL", "yoy"),
    fredId: "TOTALSL",
    displayName: "总消费信贷同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "yoy",
  },
  {
    virtualKey: consumerBalanceFredKey("REVOLSL", "yoy"),
    fredId: "REVOLSL",
    displayName: "循环消费信贷同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "yoy",
  },
  {
    virtualKey: consumerBalanceFredKey("CORCCACBS", "level"),
    fredId: "CORCCACBS",
    displayName: "信用卡贷款核销率",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "none",
  },
];

export const CONSUMER_BALANCE_SPENDING_SLOT_TITLES: Record<number, string> = {
  0: "L1 高频：零售贸易",
  1: "L2 PCE 结构：耐用品 vs 服务",
  2: "L3 信心：密歇根",
  3: "L4 储蓄缓冲",
};

export const CONSUMER_BALANCE_SHEET_SLOT_TITLES: Record<number, string> = {
  0: "L5 净财富",
  1: "L6 偿债压力",
  2: "L7 消费信贷：总量 vs 循环",
  3: "L8 信用质量：信用卡核销",
};

export const CONSUMER_BALANCE_SPENDING_DESCRIPTION =
  "【第一步 · 支出】按图 1→4 看消费动能：零售贸易 → PCE 耐用品/服务结构 → 密歇根信心 → 储蓄率。判断支出冷热与缓冲 → 加载「居民 · 资产负债与信用」。";

export const CONSUMER_BALANCE_SHEET_DESCRIPTION =
  "【第二步 · 资产负债表】按图 1→4 看财务与信用：家庭净财富 → 偿债比率 → 消费信贷增速 → 信用卡核销。回答财富效应与信用风险。";

export const CONSUMER_BALANCE_SPENDING_CHART_INTRO: Record<string, string> = {
  "0":
    "零售销售（零售贸易，RSXFS）同比是高频消费温度计；与 Overview 的 RSAFS（含餐饮）口径不同，更贴近商品零售。同比转负常领先 PCE 走弱。",
  "1":
    "实际 PCE 耐用品（利率/财富敏感）vs 服务（粘性）。耐用品先掉、服务仍强 = 软着陆式放缓；两者同掉 = 需求全面收缩。",
  "2":
    "密歇根消费者信心领先硬数据 1–3 月；深跌后若图 1 零售未跟跌，多为情绪噪声，硬数据优先。",
  "3":
    "个人储蓄率：↑可缓冲收入冲击，但过高也可能意味预防性储蓄、消费意愿弱；对照图 1/2 判断是「有缓冲」还是「不敢花」。",
};

export const CONSUMER_BALANCE_SHEET_CHART_INTRO: Record<string, string> = {
  "0":
    "家庭净财富同比：股市/房价驱动的财富效应；转负后消费常滞后 1–2 季走弱（对照 ① 图 1）。",
  "1":
    "家庭偿债比率：利息+本金占可支配收入。抬升 = 财务压力累积，限制加杠杆消费；与储蓄率对照看缓冲是否耗尽。",
  "2":
    "总消费信贷 vs 循环信贷同比：循环信贷（信用卡）更敏感；总量扩张而循环收缩 = 结构转向分期/车贷。",
  "3":
    "信用卡贷款核销率：损失确认，滞后于货币域拖欠率（DRCCLACBS）。抬头确认居民信用周期下行。",
};

export function consumerBalanceSelectedKeys(
  series: readonly ConsumerBalanceAnalysisSeriesDef[],
): string[] {
  return series.map((r) => r.virtualKey);
}

export function buildConsumerBalanceSlotAssignment(
  series: readonly ConsumerBalanceAnalysisSeriesDef[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of series) out[row.virtualKey] = row.panel - 1;
  return out;
}

export function buildConsumerBalanceVisualMap(
  series: readonly ConsumerBalanceAnalysisSeriesDef[],
): Record<
  string,
  { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string; showEndLabel: boolean }
> {
  const out: Record<
    string,
    { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string; showEndLabel: boolean }
  > = {};
  for (const row of series) {
    out[row.virtualKey] = {
      axis: row.axis,
      chartType: row.chartType,
      color: row.color,
      showEndLabel: true,
    };
  }
  return out;
}

export function buildConsumerBalanceBuiltinTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly ConsumerBalanceAnalysisSeriesDef[];
  slotTitles: Record<number, string>;
  createdAtIso?: string;
}): MacroChartTemplate {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    chartIntroNotes: { ...opts.chartIntroNotes },
    selectedKeys: consumerBalanceSelectedKeys(opts.series),
    layoutMode: 4,
    slotAssignment: buildConsumerBalanceSlotAssignment(opts.series),
    seriesVisualMap: buildConsumerBalanceVisualMap(opts.series),
    seriesCalcConfigMap: buildConsumerBalanceSeriesCalcConfigMap(opts.series),
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
    createdAtIso: opts.createdAtIso ?? "2026-07-09T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-consumer-balance",
  };
}

export const BUILTIN_US_CONSUMER_BALANCE_SPENDING_TEMPLATE = buildConsumerBalanceBuiltinTemplate({
  id: "builtin-us-consumer-balance-spending",
  name: "消费 · 支出与景气",
  description: CONSUMER_BALANCE_SPENDING_DESCRIPTION,
  chartIntroNotes: CONSUMER_BALANCE_SPENDING_CHART_INTRO,
  series: CONSUMER_BALANCE_SPENDING_SERIES,
  slotTitles: CONSUMER_BALANCE_SPENDING_SLOT_TITLES,
});

export const BUILTIN_US_CONSUMER_BALANCE_SHEET_TEMPLATE = buildConsumerBalanceBuiltinTemplate({
  id: "builtin-us-consumer-balance-balance-sheet",
  name: "居民 · 资产负债与信用",
  description: CONSUMER_BALANCE_SHEET_DESCRIPTION,
  chartIntroNotes: CONSUMER_BALANCE_SHEET_CHART_INTRO,
  series: CONSUMER_BALANCE_SHEET_SERIES,
  slotTitles: CONSUMER_BALANCE_SHEET_SLOT_TITLES,
});

export const BUILTIN_US_CONSUMER_BALANCE_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_CONSUMER_BALANCE_SPENDING_TEMPLATE,
  BUILTIN_US_CONSUMER_BALANCE_SHEET_TEMPLATE,
];

export const BUILTIN_US_CONSUMER_BALANCE_TEMPLATE_IDS =
  BUILTIN_US_CONSUMER_BALANCE_TEMPLATES.map((t) => t.id);

function buildConsumerBalanceVirtualKeyLabelMap(): ReadonlyMap<string, string> {
  const all = [...CONSUMER_BALANCE_SPENDING_SERIES, ...CONSUMER_BALANCE_SHEET_SERIES];
  const m = new Map<string, string>();
  for (const row of all) m.set(row.virtualKey, row.displayName);
  return m;
}

/** 消费/居民资产负债模板虚拟键 → 中文显示名 */
export const CONSUMER_BALANCE_VIRTUAL_KEY_LABELS = buildConsumerBalanceVirtualKeyLabelMap();
