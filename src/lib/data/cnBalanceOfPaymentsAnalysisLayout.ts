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

const NONE_KEEP: MacroSeriesCalcConfig = {
  op: "none",
  frequency: "keep",
  unit: "keep",
  resampleMethod: "end",
};

const mds = (code: string) => `mds:${code}`;

const RESERVE_ASSETS = mds("safe_cn_iip_8d7e57a2760c");
const EXTERNAL_DEBT = mds("safe_cn_debt_ce941250bdad");

export const CN_BALANCE_OF_PAYMENTS_DERIVED: readonly MacroDerivedCalc[] = [
  {
    id: "cn-bop-reserve-assets-to-external-debt",
    leftKey: RESERVE_ASSETS,
    rightKey: EXTERNAL_DEBT,
    op: "ratio",
    scale: 100,
    name: "储备资产/外债总额（%）",
  },
];

export const CN_BALANCE_OF_PAYMENTS_SERIES: readonly SeriesDef[] = [
  { virtualKey: mds("safe_cn_bop_current_account"), displayName: "经常账户差额", panel: 1, axis: "left", chartType: "line", color: "#3e4d83", calc: NONE_KEEP, lineWidth: 2.4 },
  { virtualKey: mds("safe_cn_bop_goods_balance"), displayName: "货物差额", panel: 1, axis: "left", chartType: "bar", color: "#5f76b8", calc: NONE_KEEP },
  { virtualKey: mds("safe_cn_bop_services_balance"), displayName: "服务差额", panel: 1, axis: "left", chartType: "bar", color: "#d89b4e", calc: NONE_KEEP },
  { virtualKey: mds("safe_cn_bop_direct_investment_net"), displayName: "直接投资净额", panel: 2, axis: "left", chartType: "bar", color: "#ef6461", calc: NONE_KEEP },
  { virtualKey: mds("safe_cn_bop_portfolio_investment_net"), displayName: "证券投资净额", panel: 2, axis: "left", chartType: "bar", color: "#5f76b8", calc: NONE_KEEP },
  { virtualKey: mds("safe_cn_bop_other_investment_net"), displayName: "其他投资净额", panel: 2, axis: "left", chartType: "bar", color: "#d89b4e", calc: NONE_KEEP },
  { virtualKey: mds("safe_cn_settlement_6b1b40a90c3a"), displayName: "银行结售汇差额", panel: 3, axis: "left", chartType: "bar", color: "#5f76b8", calc: NONE_KEEP },
  { virtualKey: mds("safe_cn_payments_36f49c28853c"), displayName: "银行代客涉外收付款差额", panel: 3, axis: "left", chartType: "bar", color: "#d89b4e", calc: NONE_KEEP },
  { virtualKey: mds("safe_cn_iip_d2af2fbaf002"), displayName: "净国际投资头寸", panel: 4, axis: "left", chartType: "line", color: "#3e4d83", calc: NONE_KEEP, lineWidth: 2.4 },
  { virtualKey: RESERVE_ASSETS, displayName: "储备资产（偿债覆盖率输入）", panel: null, axis: "left", chartType: "line", color: "#8f9bab", calc: NONE_KEEP },
  { virtualKey: EXTERNAL_DEBT, displayName: "外债总额（偿债覆盖率输入）", panel: null, axis: "left", chartType: "line", color: "#8f9bab", calc: NONE_KEEP },
];

const selectedKeys = [
  ...CN_BALANCE_OF_PAYMENTS_SERIES.map((item) => item.virtualKey),
  ...CN_BALANCE_OF_PAYMENTS_DERIVED.map((item) => `calc:${item.id}`),
];

const slotAssignment: MacroChartTemplate["slotAssignment"] = {};
const seriesVisualMap: MacroChartTemplate["seriesVisualMap"] = {};
const seriesCalcConfigMap: MacroSeriesCalcConfigMap = {};

for (const item of CN_BALANCE_OF_PAYMENTS_SERIES) {
  slotAssignment[item.virtualKey] = item.panel == null ? null : item.panel - 1;
  seriesVisualMap[item.virtualKey] = {
    axis: item.axis,
    chartType: item.chartType,
    color: item.color,
    showEndLabel: true,
    lineWidth: item.lineWidth,
  };
  seriesCalcConfigMap[item.virtualKey] = item.calc;
}

const reserveCoverageKey = "calc:cn-bop-reserve-assets-to-external-debt";
slotAssignment[reserveCoverageKey] = 3;
seriesVisualMap[reserveCoverageKey] = {
  axis: "right",
  chartType: "dashedLine",
  color: "#ef6461",
  showEndLabel: true,
  lineWidth: 2,
};

export const BUILTIN_CN_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE: MacroChartTemplate = {
  id: "builtin-cn-balance-of-payments-overview",
  name: "中国国际收支 · 总账、资本流动与外部缓冲",
  description:
    "把国际收支总账、跨境资金高频体感和外部资产负债表放在同一套四图中：先辨认经常账户盈余来源，再按 BPM6 符号判断金融账户资本净流向，随后用月度结售汇与涉外收付款验证压力，最后以净国际投资头寸和储备资产对外债覆盖率衡量外部缓冲。",
  chartIntroNotes: {
    "0": "经常账户差额并不等于货物加服务差额，还包含初次收入与二次收入。货物顺差扩大但经常账户不扩张，通常意味着服务或收入账户拖累；本图金额不与 GDP 比较。",
    "1": "BPM6 标准下，金融账户净额按“净获得金融资产减净发生负债”记录，因此正值表示净资金流出，负值表示净资金流入。直接投资、证券投资和其他投资用于区分资本流动的性质，不能把正值误读为流入。",
    "2": "银行结售汇差额反映境内外汇买卖，银行代客涉外收付款差额反映跨境收付；二者共同转负时，外汇供求压力更可信。两条均为月度流量，不与季度 BOP 机械相加。",
    "3": "净国际投资头寸观察国家对外净债权规模；储备资产/外债总额衡量存量偿债覆盖缓冲。覆盖率使用季度 IIP 储备资产除以全口径外债总额，不用月度外汇储备替代，也不代表所有外债可由储备直接偿付。",
  },
  selectedKeys,
  layoutMode: 4,
  slotAssignment,
  seriesVisualMap,
  seriesCalcConfigMap,
  derivedCalcs: [...CN_BALANCE_OF_PAYMENTS_DERIVED],
  displayConfig: {
    ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
    legendPosition: "bottom",
    xLabelRotate: 24,
    xLabelFontSize: 10,
    yLabelFontSize: 10,
    lineWidth: 1.7,
    barMaxWidth: 14,
    showSymbols: false,
    lineSmooth: false,
    slotTitles: {
      0: "经常账户及来源：总差额、货物与服务",
      1: "非储备资本流动：直接、证券与其他投资",
      2: "月度跨境资金压力：外汇供求 vs 收付款",
      3: "外部净资产与缓冲",
    },
  },
  createdAtIso: "2026-08-11T00:00:00.000Z",
  builtIn: true,
  folderId: "folder-builtin-cn-balance-of-payments",
};

export const BUILTIN_CN_BALANCE_OF_PAYMENTS_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_CN_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE,
];

export const BUILTIN_CN_BALANCE_OF_PAYMENTS_TEMPLATE_IDS =
  BUILTIN_CN_BALANCE_OF_PAYMENTS_TEMPLATES.map((template) => template.id);

export const CN_BALANCE_OF_PAYMENTS_VIRTUAL_KEY_LABELS: ReadonlyMap<string, string> = new Map([
  ...CN_BALANCE_OF_PAYMENTS_SERIES.map((item) => [item.virtualKey, item.displayName] as const),
  ...CN_BALANCE_OF_PAYMENTS_DERIVED.map((calc) => [`calc:${calc.id}`, calc.name] as const),
]);
