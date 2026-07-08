import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

/**
 * 美国增长动能与衰退风险 — 内置双模板
 *
 * Spec: docs/specs/us-cycle-risk.spec.md
 * 数据: cycleRiskFredSeedCatalog.ts（6 新 FRED）+ 复用 CFNAI/USREC(phase2)、
 *       nyfed_us_recession_prob(Agent C 抓取，mds 键)。
 * 每行显式 virtualKey+calc：模板 ① 混用 mds:（nyfed）与 fred: 键；RECPROUSM156N
 * 源为分数，用 unit:"x100" 转百分比，与已存百分比的 NY Fed 概率同图对齐。
 */

export type CycleRiskSeriesDef = {
  virtualKey: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calc: MacroSeriesCalcConfig;
};

const NONE_KEEP: MacroSeriesCalcConfig = { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
const NONE_X100: MacroSeriesCalcConfig = { op: "none", frequency: "keep", unit: "x100", resampleMethod: "avg" };
const YOY_MONTH: MacroSeriesCalcConfig = { op: "yoy", frequency: "month", unit: "keep", resampleMethod: "end" };
const YOY_QUARTER: MacroSeriesCalcConfig = { op: "yoy", frequency: "quarter", unit: "keep", resampleMethod: "end" };

/** 模板 ①：衰退风险 · 概率与规则 */
export const CYCLE_RISK_SIGNALS_SERIES: readonly CycleRiskSeriesDef[] = [
  { virtualKey: "mds:nyfed_us_recession_prob", displayName: "NY Fed 衰退概率（12月前瞻）", panel: 1, axis: "left", chartType: "line", color: "#ef6461", calc: NONE_KEEP },
  { virtualKey: "fred:RECPROUSM156N::x100", displayName: "平滑衰退概率（Chauvet-Piger）", panel: 1, axis: "left", chartType: "line", color: "#5f76b8", calc: NONE_X100 },
  { virtualKey: "fred:SAHMREALTIME", displayName: "Sahm 规则实时值", panel: 2, axis: "left", chartType: "line", color: "#d89b4e", calc: NONE_KEEP },
  { virtualKey: "fred:CFNAI", displayName: "芝加哥联储全国活动指数", panel: 3, axis: "left", chartType: "line", color: "#6ccad1", calc: NONE_KEEP },
  { virtualKey: "fred:USREC", displayName: "NBER 衰退标记（0/1）", panel: 4, axis: "left", chartType: "bar", color: "#9da8b6", calc: NONE_KEEP },
];

/** 模板 ②：增长动能 · 硬数据确认 */
export const CYCLE_RISK_MOMENTUM_SERIES: readonly CycleRiskSeriesDef[] = [
  { virtualKey: "fred:W875RX1::yoy", displayName: "实际个人收入(除转移支付) 同比", panel: 1, axis: "left", chartType: "line", color: "#ef6461", calc: YOY_MONTH },
  { virtualKey: "fred:CMRMTSPL::yoy", displayName: "实际制造与贸易销售 同比", panel: 2, axis: "left", chartType: "line", color: "#5f76b8", calc: YOY_MONTH },
  { virtualKey: "fred:DSPIC96::yoy", displayName: "实际可支配个人收入 同比", panel: 3, axis: "left", chartType: "line", color: "#d89b4e", calc: YOY_MONTH },
  { virtualKey: "fred:FINSLC1::yoy", displayName: "实际最终销售 同比", panel: 4, axis: "left", chartType: "line", color: "#3e4d83", calc: YOY_QUARTER },
];

export const CYCLE_RISK_SIGNALS_SLOT_TITLES: Record<number, string> = {
  0: "L1 模型概率：NY Fed vs 平滑",
  1: "L2 Sahm 规则（≥0.5 触发）",
  2: "L3 活动综合：CFNAI（<-0.7 衰退）",
  3: "L4 校准：NBER 衰退期",
};

export const CYCLE_RISK_MOMENTUM_SLOT_TITLES: Record<number, string> = {
  0: "L5 实际个人收入(除转移)",
  1: "L6 实际制造与贸易销售",
  2: "L5 实际可支配收入",
  3: "L7 实际最终销售",
};

export const CYCLE_RISK_SIGNALS_DESCRIPTION =
  "【第一步 · 衰退信号】四种探测法对照：模型概率(NY Fed 曲线 + 平滑因子) → Sahm 劳动规则 → CFNAI 活动综合 → NBER 历史校准。看谁先亮灯、几种共振。信号亮 → 加载「增长动能 · 硬数据确认」证实。";

export const CYCLE_RISK_MOMENTUM_DESCRIPTION =
  "【第二步 · 硬数据】NBER 同步硬数据看增长动能：实际收入 → 实际销售 → 可支配收入 → 最终需求。同比转负是衰退实质确认，与信号模板合并成周期定位结论。";

export const CYCLE_RISK_SIGNALS_CHART_INTRO: Record<string, string> = {
  "0": "NY Fed（收益率曲线模型，12 月前瞻，领先）vs 平滑概率（Chauvet-Piger 动态因子，同步）。前者先升预警、后者确认已入衰退。两者 >50% 是强信号；背离时以领先的 NY Fed 为早警。",
  "1": "Sahm 规则：3 月均失业率较前 12 月低点上升 ≥0.5pp 触发。实时值逼近 0.5 = 劳动市场转弱、衰退临近。它极少假阳性，是最可靠的实时衰退标志之一。",
  "2": "CFNAI（85 指标合成，0=趋势增长）。3 月均值 <-0.7 历史上标志衰退开始。负值渐深 = 广谱走弱；与图 1/2 共振时衰退确认度高。",
  "3": "NBER 衰退期（0/1）作校准基准——对照上面三种信号历史上领先/滞后 NBER 官方定义多少。当前 NBER 未标衰退 + 信号未亮 = 扩张延续。",
};

export const CYCLE_RISK_MOMENTUM_CHART_INTRO: Record<string, string> = {
  "0": "实际个人收入(除转移支付) 同比——NBER 定衰退的四大同步指标之一，剔除政府补贴后的真实收入动能。同比转负是硬确认。",
  "1": "实际制造与贸易销售 同比——NBER 四指标之一，需求端实际成交，领先库存调整。转负预示生产收缩。",
  "2": "实际可支配个人收入 同比——居民购买力，支撑占 GDP ~68% 的消费。放缓预示消费走弱、动能熄火。",
  "3": "实际最终销售 同比——GDP 剔除库存变动的真实终端需求，比 GDP 更干净地反映动能。转负是衰退实质。",
};

function selectedKeys(series: readonly CycleRiskSeriesDef[]): string[] {
  return series.map((r) => r.virtualKey);
}
function slotAssignment(series: readonly CycleRiskSeriesDef[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const r of series) out[r.virtualKey] = r.panel - 1;
  return out;
}
function visualMap(series: readonly CycleRiskSeriesDef[]) {
  const out: Record<string, { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string; showEndLabel: boolean }> = {};
  for (const r of series) out[r.virtualKey] = { axis: r.axis, chartType: r.chartType, color: r.color, showEndLabel: true };
  return out;
}
function calcConfigMap(series: readonly CycleRiskSeriesDef[]): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const r of series) out[r.virtualKey] = r.calc;
  return out;
}

function buildTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly CycleRiskSeriesDef[];
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
    createdAtIso: "2026-07-05T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-cycle-risk",
  };
}

export const BUILTIN_US_CYCLE_RISK_SIGNALS_TEMPLATE = buildTemplate({
  id: "builtin-us-cycle-risk-signals",
  name: "衰退风险 · 概率与规则",
  description: CYCLE_RISK_SIGNALS_DESCRIPTION,
  chartIntroNotes: CYCLE_RISK_SIGNALS_CHART_INTRO,
  series: CYCLE_RISK_SIGNALS_SERIES,
  slotTitles: CYCLE_RISK_SIGNALS_SLOT_TITLES,
});

export const BUILTIN_US_CYCLE_RISK_MOMENTUM_TEMPLATE = buildTemplate({
  id: "builtin-us-cycle-risk-momentum",
  name: "增长动能 · 硬数据确认",
  description: CYCLE_RISK_MOMENTUM_DESCRIPTION,
  chartIntroNotes: CYCLE_RISK_MOMENTUM_CHART_INTRO,
  series: CYCLE_RISK_MOMENTUM_SERIES,
  slotTitles: CYCLE_RISK_MOMENTUM_SLOT_TITLES,
});

export const BUILTIN_US_CYCLE_RISK_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_CYCLE_RISK_SIGNALS_TEMPLATE,
  BUILTIN_US_CYCLE_RISK_MOMENTUM_TEMPLATE,
];

export const BUILTIN_US_CYCLE_RISK_TEMPLATE_IDS = BUILTIN_US_CYCLE_RISK_TEMPLATES.map((t) => t.id);

function buildLabelMap(): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const r of [...CYCLE_RISK_SIGNALS_SERIES, ...CYCLE_RISK_MOMENTUM_SERIES]) m.set(r.virtualKey, r.displayName);
  return m;
}
export const CYCLE_RISK_VIRTUAL_KEY_LABELS = buildLabelMap();
