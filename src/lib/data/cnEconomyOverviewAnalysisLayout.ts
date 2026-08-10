import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroDerivedCalc,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";

type SeriesDef = {
  virtualKey: string;
  displayName: string;
  panel: number | null;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calc: MacroSeriesCalcConfig;
  lineWidth?: number;
};

const NONE: MacroSeriesCalcConfig = { op: "none", frequency: "keep", unit: "keep", resampleMethod: "end" };
const QUARTER: MacroSeriesCalcConfig = { op: "none", frequency: "quarter", unit: "keep", resampleMethod: "end" };
const QUARTER_YOY: MacroSeriesCalcConfig = { op: "yoy", frequency: "quarter", unit: "keep", resampleMethod: "end" };
const mds = (code: string, variant?: string) => `mds:${code}${variant ? `::${variant}` : ""}`;

const GDP_REAL_YOY = mds("nbs_cn_gdp_q_headline_real_yoy");
const GDP_NOMINAL_YOY = mds("nbs_cn_gdp_q_headline_nominal", "overview-yoy");
const GDP_NOMINAL_LEVEL = mds("nbs_cn_gdp_q_headline_nominal", "overview-level");
const GDP_REAL_LEVEL = mds("nbs_cn_gdp_q_headline_real", "overview-level");
const GENERAL_EXPENDITURE = mds("mof_cn_fiscal_general_expenditure_amount");
const FUND_EXPENDITURE = mds("mof_cn_fiscal_fund_expenditure_amount");

export const CN_ECONOMY_OVERVIEW_GROWTH_DERIVED: readonly MacroDerivedCalc[] = [
  {
    id: "cn-overview-gdp-deflator-yoy",
    leftKey: GDP_NOMINAL_LEVEL,
    rightKey: GDP_REAL_LEVEL,
    op: "ratio",
    postOp: "yoy",
    name: "隐含 GDP 平减指数季度同比",
  },
];

export const CN_ECONOMY_OVERVIEW_POLICY_DERIVED: readonly MacroDerivedCalc[] = [
  {
    id: "cn-overview-broad-fiscal-expenditure",
    leftKey: GENERAL_EXPENDITURE,
    rightKey: FUND_EXPENDITURE,
    op: "add",
    name: "广义财政支出累计额",
  },
  {
    id: "cn-overview-broad-fiscal-expenditure-yoy",
    leftKey: GENERAL_EXPENDITURE,
    rightKey: FUND_EXPENDITURE,
    op: "add",
    postOp: "yoy",
    name: "广义财政支出累计同比",
  },
];

export const CN_ECONOMY_OVERVIEW_GROWTH_SERIES: readonly SeriesDef[] = [
  { virtualKey: GDP_REAL_YOY, displayName: "季度 GDP 实际同比", panel: 1, axis: "left", chartType: "line", color: "#ef6461", calc: NONE, lineWidth: 2.2 },
  { virtualKey: GDP_NOMINAL_YOY, displayName: "季度 GDP 名义同比", panel: 1, axis: "left", chartType: "line", color: "#5f76b8", calc: QUARTER_YOY, lineWidth: 2 },
  { virtualKey: GDP_NOMINAL_LEVEL, displayName: "季度 GDP 名义值（平减指数输入）", panel: null, axis: "left", chartType: "line", color: "#8f9bab", calc: QUARTER },
  { virtualKey: GDP_REAL_LEVEL, displayName: "季度 GDP 不变价值（平减指数输入）", panel: null, axis: "left", chartType: "line", color: "#8f9bab", calc: QUARTER },
  { virtualKey: mds("nbs_cn_gdp_q_final_consumption_contribution"), displayName: "最终消费支出增长贡献率", panel: 2, axis: "left", chartType: "bar", color: "#ef6461", calc: NONE },
  { virtualKey: mds("nbs_cn_gdp_q_capital_formation_contribution"), displayName: "资本形成总额增长贡献率", panel: 2, axis: "left", chartType: "bar", color: "#5f76b8", calc: NONE },
  { virtualKey: mds("nbs_cn_gdp_q_net_exports_contribution"), displayName: "净出口增长贡献率", panel: 2, axis: "left", chartType: "bar", color: "#6ccad1", calc: NONE },
  { virtualKey: mds("nbs_cn_mfg_new_orders"), displayName: "制造业 PMI 新订单", panel: 3, axis: "left", chartType: "line", color: "#ef6461", calc: NONE },
  { virtualKey: mds("nbs_cn_non_mfg_new_orders"), displayName: "非制造业 PMI 新订单", panel: 3, axis: "left", chartType: "line", color: "#5f76b8", calc: NONE },
  { virtualKey: mds("nbs_cn_industrial_headline_yoy"), displayName: "规模以上工业增加值同比", panel: 4, axis: "left", chartType: "line", color: "#ef6461", calc: NONE },
  { virtualKey: mds("nbs_cn_retail_h_yoy"), displayName: "社会消费品零售总额当月同比", panel: 4, axis: "left", chartType: "line", color: "#5f76b8", calc: NONE },
  { virtualKey: mds("nbs_cn_fai_m_5129067b_7e570cf8"), displayName: "固定资产投资累计同比", panel: 4, axis: "left", chartType: "dashedLine", color: "#d89b4e", calc: NONE },
];

export const CN_ECONOMY_OVERVIEW_POLICY_SERIES: readonly SeriesDef[] = [
  { virtualKey: mds("nbs_cn_fai_m_5129067b_7e570cf8"), displayName: "固定资产投资累计同比", panel: 1, axis: "left", chartType: "line", color: "#3e4d83", calc: NONE, lineWidth: 2.4 },
  { virtualKey: mds("nbs_cn_fai_m_90028595_d1771824"), displayName: "制造业投资累计同比", panel: 1, axis: "left", chartType: "line", color: "#ef6461", calc: NONE },
  { virtualKey: mds("nbs_cn_fai_m_infrastructure_yoy"), displayName: "基础设施投资累计同比", panel: 1, axis: "left", chartType: "line", color: "#5f76b8", calc: NONE },
  { virtualKey: mds("nbs_cn_realestate_4035448cce98117aa2"), displayName: "房地产开发投资累计同比", panel: 1, axis: "left", chartType: "dashedLine", color: "#d89b4e", calc: NONE },
  { virtualKey: GENERAL_EXPENDITURE, displayName: "一般公共预算支出累计额（广义财政输入）", panel: null, axis: "left", chartType: "bar", color: "#8f9bab", calc: NONE },
  { virtualKey: FUND_EXPENDITURE, displayName: "政府性基金预算支出累计额（广义财政输入）", panel: null, axis: "left", chartType: "bar", color: "#8f9bab", calc: NONE },
  { virtualKey: mds("nbs_cn_cpi_headline_yoy"), displayName: "居民消费价格同比", panel: 3, axis: "left", chartType: "line", color: "#ef6461", calc: NONE },
  { virtualKey: mds("nbs_cn_ppi_headline_yoy"), displayName: "工业生产者出厂价格同比", panel: 3, axis: "left", chartType: "line", color: "#5f76b8", calc: NONE },
  { virtualKey: mds("mofcom_cn_trade_cabe8908b163088537"), displayName: "出口总额当月美元同比", panel: 4, axis: "left", chartType: "bar", color: "#ef6461", calc: NONE },
  { virtualKey: mds("mofcom_cn_trade_a02519f634eb068d5a"), displayName: "进口总额当月美元同比", panel: 4, axis: "left", chartType: "bar", color: "#5f76b8", calc: NONE },
];

function buildTemplate(options: {
  id: string;
  name: string;
  description: string;
  series: readonly SeriesDef[];
  derived: readonly MacroDerivedCalc[];
  slotTitles: Record<number, string>;
  chartIntroNotes: Record<string, string>;
  derivedSlots: Record<string, number>;
  derivedVisuals: Record<string, { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string }>;
}): MacroChartTemplate {
  const selectedKeys = [...options.series.map((item) => item.virtualKey), ...options.derived.filter((item) => !item.hidden).map((item) => `calc:${item.id}`)];
  const slotAssignment: Record<string, number | null> = {};
  const seriesVisualMap: MacroChartTemplate["seriesVisualMap"] = {};
  const seriesCalcConfigMap: MacroSeriesCalcConfigMap = {};
  for (const item of options.series) {
    slotAssignment[item.virtualKey] = item.panel == null ? null : item.panel - 1;
    seriesVisualMap[item.virtualKey] = { axis: item.axis, chartType: item.chartType, color: item.color, showEndLabel: true, lineWidth: item.lineWidth };
    seriesCalcConfigMap[item.virtualKey] = item.calc;
  }
  for (const calc of options.derived) {
    if (calc.hidden) continue;
    const key = `calc:${calc.id}`;
    const visual = options.derivedVisuals[key];
    slotAssignment[key] = options.derivedSlots[key];
    seriesVisualMap[key] = { axis: visual?.axis ?? "left", chartType: visual?.chartType ?? "line", color: visual?.color ?? "#6ccad1", showEndLabel: true, lineWidth: 2 };
  }
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    chartIntroNotes: options.chartIntroNotes,
    selectedKeys,
    layoutMode: 4,
    slotAssignment,
    seriesVisualMap,
    seriesCalcConfigMap,
    derivedCalcs: [...options.derived],
    displayConfig: { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, legendPosition: "bottom", xLabelRotate: 24, xLabelFontSize: 10, yLabelFontSize: 10, lineWidth: 1.7, barMaxWidth: 14, showSymbols: false, lineSmooth: false, slotTitles: options.slotTitles },
    createdAtIso: "2026-08-10T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-cn-economy-overview",
  };
}

export const BUILTIN_CN_ECONOMY_OVERVIEW_GROWTH_TEMPLATE = buildTemplate({
  id: "builtin-cn-economy-overview-growth",
  name: "中国经济 Overview · 增长脉冲",
  description: "从实际/名义 GDP 与精确隐含平减指数判断量价组合，再拆三大需求贡献、观察 PMI 新订单，并用工业、社零和固投验证月度增长脉冲。",
  series: CN_ECONOMY_OVERVIEW_GROWTH_SERIES,
  derived: CN_ECONOMY_OVERVIEW_GROWTH_DERIVED,
  slotTitles: { 0: "GDP 量价组合：实际、名义与平减指数同比", 1: "GDP 增长贡献：消费、资本形成与净出口", 2: "领先需求：制造业与非制造业新订单", 3: "月度增长验证：工业、社零与固定资产投资" },
  chartIntroNotes: {
    "0": "实际 GDP 同比看量，名义 GDP 同比看现价收入，隐含平减指数按名义值/不变价值后做同季同比。实际强而名义与平减指数弱属于量强价弱，不能用名义增速减实际增速冒充精确平减指数。",
    "1": "最终消费、资本形成和净出口贡献率解释当季 GDP 增长来源；贡献率不是 GDP 占比，负贡献必须保留。",
    "2": "制造业与非制造业新订单共同回升并站上 50 才是更广泛的领先需求改善；扩散指数不是订单金额或增速。",
    "3": "工业和社零为当月同比，固投为年内累计同比，只比较方向和拐点。三者共同改善更接近供需共振，工业强而社零/固投弱提示供给强于内需。",
  },
  derivedSlots: { "calc:cn-overview-gdp-deflator-yoy": 0 },
  derivedVisuals: { "calc:cn-overview-gdp-deflator-yoy": { axis: "left", chartType: "dashedLine", color: "#6ccad1" } },
});

export const BUILTIN_CN_ECONOMY_OVERVIEW_POLICY_TEMPLATE = buildTemplate({
  id: "builtin-cn-economy-overview-policy",
  name: "中国经济 Overview · 需求结构与政策支撑",
  description: "先比较总固投与制造业、基建、房地产三大领域的驱动方向，再观察两本账合计的广义财政支出，最后用 CPI/PPI 与出口/进口验证名义环境和内外需。",
  series: CN_ECONOMY_OVERVIEW_POLICY_SERIES,
  derived: CN_ECONOMY_OVERVIEW_POLICY_DERIVED,
  slotTitles: { 0: "固投及三大领域驱动（2026年基建口径断点）", 1: "广义财政支出：两本账合计规模与同比", 2: "名义环境：CPI vs PPI", 3: "外需与进口验证：出口 vs 进口" },
  chartIntroNotes: {
    "0": "以总固投累计同比为基准，对照制造业、基础设施和房地产开发投资。四条均为增速，只表示驱动方向，不能相加或称贡献率。基建自 2026 年起纳入电力、热力、燃气及水生产和供应业，标题明确标注口径断点。",
    "1": "广义财政支出累计额=一般公共预算支出累计额+政府性基金预算支出累计额；同比对合计额按上年同月计算，不加总或平均两条官方同比。它是两本账支出代理，不是完整合并政府支出。",
    "2": "CPI 看居民端价格，PPI 看工业品出厂价格。两者与增长数据共同回升更支持名义环境改善；PPI 回升不自动等于利润改善。",
    "3": "出口和进口当月美元同比共振上行更接近内外需改善；出口强、进口弱更像外需托底或价格影响，不能把顺差扩大写成全面复苏。",
  },
  derivedSlots: { "calc:cn-overview-broad-fiscal-expenditure": 1, "calc:cn-overview-broad-fiscal-expenditure-yoy": 1 },
  derivedVisuals: {
    "calc:cn-overview-broad-fiscal-expenditure": { axis: "left", chartType: "bar", color: "#5f76b8" },
    "calc:cn-overview-broad-fiscal-expenditure-yoy": { axis: "right", chartType: "line", color: "#ef6461" },
  },
});

export const BUILTIN_CN_ECONOMY_OVERVIEW_TEMPLATES: readonly MacroChartTemplate[] = [BUILTIN_CN_ECONOMY_OVERVIEW_GROWTH_TEMPLATE, BUILTIN_CN_ECONOMY_OVERVIEW_POLICY_TEMPLATE];
export const BUILTIN_CN_ECONOMY_OVERVIEW_TEMPLATE_IDS = BUILTIN_CN_ECONOMY_OVERVIEW_TEMPLATES.map((template) => template.id);
export const CN_ECONOMY_OVERVIEW_VIRTUAL_KEY_LABELS: ReadonlyMap<string, string> = new Map([
  ...[...CN_ECONOMY_OVERVIEW_GROWTH_SERIES, ...CN_ECONOMY_OVERVIEW_POLICY_SERIES].map((item) => [item.virtualKey, item.displayName] as const),
  ...[...CN_ECONOMY_OVERVIEW_GROWTH_DERIVED, ...CN_ECONOMY_OVERVIEW_POLICY_DERIVED].map((calc) => [`calc:${calc.id}`, calc.name] as const),
]);
