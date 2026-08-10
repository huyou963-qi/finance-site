import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroDerivedCalc,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";

export type CnFiscalSeriesDef = {
  virtualKey: string;
  displayName: string;
  panel: number | null;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calc: MacroSeriesCalcConfig;
  roleId: string;
};

const NONE_KEEP: MacroSeriesCalcConfig = {
  op: "none",
  frequency: "keep",
  unit: "keep",
  resampleMethod: "end",
};

const YEAR_END: MacroSeriesCalcConfig = {
  op: "none",
  frequency: "year",
  unit: "keep",
  resampleMethod: "end",
};

function mds(code: string, variant?: string): string {
  return `mds:${code}${variant ? `::${variant}` : ""}`;
}

const GENERAL_REVENUE_AMOUNT = mds("mof_cn_fiscal_general_revenue_amount");
const GENERAL_EXPENDITURE_AMOUNT = mds("mof_cn_fiscal_general_expenditure_amount");
const FUND_REVENUE_AMOUNT = mds("mof_cn_fiscal_fund_revenue_amount");
const FUND_EXPENDITURE_AMOUNT = mds("mof_cn_fiscal_fund_expenditure_amount");
const GENERAL_REVENUE_YEAR = mds("mof_cn_fiscal_general_revenue_amount", "year-end");
const GENERAL_EXPENDITURE_YEAR = mds("mof_cn_fiscal_general_expenditure_amount", "year-end");
const FUND_REVENUE_YEAR = mds("mof_cn_fiscal_fund_revenue_amount", "year-end");
const FUND_EXPENDITURE_YEAR = mds("mof_cn_fiscal_fund_expenditure_amount", "year-end");
const NOMINAL_GDP_BASE = mds("nbs_cn_gdp_a_headline_nominal");
const NOMINAL_GDP_YEAR = mds("nbs_cn_gdp_a_headline_nominal", "year");

export const CN_FISCAL_OVERVIEW_DERIVED: readonly MacroDerivedCalc[] = [
  {
    id: "cn-fiscal-general-deficit-proxy",
    leftKey: GENERAL_EXPENDITURE_AMOUNT,
    rightKey: GENERAL_REVENUE_AMOUNT,
    op: "sub",
    name: "一般公共预算赤字代理（亿元）",
  },
  {
    id: "cn-fiscal-fund-deficit-proxy",
    leftKey: FUND_EXPENDITURE_AMOUNT,
    rightKey: FUND_REVENUE_AMOUNT,
    op: "sub",
    name: "政府性基金预算赤字代理（亿元）",
  },
  {
    id: "cn-fiscal-two-book-expenditure-total",
    leftKey: GENERAL_EXPENDITURE_AMOUNT,
    rightKey: FUND_EXPENDITURE_AMOUNT,
    op: "add",
    name: "两账本支出合计（中间值）",
    hidden: true,
  },
  {
    id: "cn-fiscal-two-book-revenue-total",
    leftKey: GENERAL_REVENUE_AMOUNT,
    rightKey: FUND_REVENUE_AMOUNT,
    op: "add",
    name: "两账本收入合计（中间值）",
    hidden: true,
  },
  {
    id: "cn-fiscal-two-book-deficit-proxy",
    leftKey: "calc:cn-fiscal-two-book-expenditure-total",
    rightKey: "calc:cn-fiscal-two-book-revenue-total",
    op: "sub",
    name: "两账本合并可观察赤字代理（亿元）",
  },
  {
    id: "cn-fiscal-two-book-expenditure-total-year",
    leftKey: GENERAL_EXPENDITURE_YEAR,
    rightKey: FUND_EXPENDITURE_YEAR,
    op: "add",
    name: "两账本年度支出合计（中间值）",
    hidden: true,
  },
  {
    id: "cn-fiscal-two-book-revenue-total-year",
    leftKey: GENERAL_REVENUE_YEAR,
    rightKey: FUND_REVENUE_YEAR,
    op: "add",
    name: "两账本年度收入合计（中间值）",
    hidden: true,
  },
  {
    id: "cn-fiscal-two-book-deficit-year",
    leftKey: "calc:cn-fiscal-two-book-expenditure-total-year",
    rightKey: "calc:cn-fiscal-two-book-revenue-total-year",
    op: "sub",
    name: "两账本年度可观察赤字（中间值）",
    hidden: true,
  },
  {
    id: "cn-fiscal-two-book-deficit-gdp",
    leftKey: "calc:cn-fiscal-two-book-deficit-year",
    rightKey: NOMINAL_GDP_YEAR,
    op: "ratio",
    scale: 100,
    name: "两账本合并可观察赤字/GDP（%）",
  },
];

export const CN_FISCAL_OVERVIEW_SERIES: readonly CnFiscalSeriesDef[] = [
  {
    virtualKey: mds("mof_cn_fiscal_general_revenue_yoy"),
    displayName: "一般公共预算收入累计同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#56b6c2",
    calc: NONE_KEEP,
    roleId: "cn-fiscal-general-revenue-yoy",
  },
  {
    virtualKey: mds("mof_cn_fiscal_general_expenditure_yoy"),
    displayName: "一般公共预算支出累计同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: NONE_KEEP,
    roleId: "cn-fiscal-general-expenditure-yoy",
  },
  {
    virtualKey: mds("mof_cn_fiscal_fund_revenue_yoy"),
    displayName: "政府性基金预算收入累计同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calc: NONE_KEEP,
    roleId: "cn-fiscal-fund-revenue-yoy",
  },
  {
    virtualKey: mds("mof_cn_fiscal_fund_expenditure_yoy"),
    displayName: "政府性基金预算支出累计同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calc: NONE_KEEP,
    roleId: "cn-fiscal-fund-expenditure-yoy",
  },
  ...[
    [GENERAL_REVENUE_AMOUNT, "一般公共预算收入累计额", "cn-fiscal-general-revenue-amount", NONE_KEEP],
    [GENERAL_EXPENDITURE_AMOUNT, "一般公共预算支出累计额", "cn-fiscal-general-expenditure-amount", NONE_KEEP],
    [FUND_REVENUE_AMOUNT, "政府性基金预算收入累计额", "cn-fiscal-fund-revenue-amount", NONE_KEEP],
    [FUND_EXPENDITURE_AMOUNT, "政府性基金预算支出累计额", "cn-fiscal-fund-expenditure-amount", NONE_KEEP],
    [GENERAL_REVENUE_YEAR, "一般公共预算收入年末累计", "cn-fiscal-general-revenue-year", YEAR_END],
    [GENERAL_EXPENDITURE_YEAR, "一般公共预算支出年末累计", "cn-fiscal-general-expenditure-year", YEAR_END],
    [FUND_REVENUE_YEAR, "政府性基金预算收入年末累计", "cn-fiscal-fund-revenue-year", YEAR_END],
    [FUND_EXPENDITURE_YEAR, "政府性基金预算支出年末累计", "cn-fiscal-fund-expenditure-year", YEAR_END],
    [NOMINAL_GDP_BASE, "年度名义国内生产总值（派生输入）", "cn-fiscal-nominal-gdp", NONE_KEEP],
    [NOMINAL_GDP_YEAR, "年度名义国内生产总值", "cn-fiscal-nominal-gdp-year", YEAR_END],
  ].map(([virtualKey, displayName, roleId, calc]) => ({
    virtualKey: virtualKey as string,
    displayName: displayName as string,
    panel: null,
    axis: "left" as const,
    chartType: "line" as const,
    color: "#8f9bab",
    calc: calc as MacroSeriesCalcConfig,
    roleId: roleId as string,
  })),
];

export const CN_FISCAL_REVENUE_SERIES: readonly CnFiscalSeriesDef[] = [
  ["tax_revenue", "税收收入累计同比", 1, "#56b6c2"],
  ["nontax_revenue", "非税收入累计同比", 1, "#d89b4e"],
  ["general_revenue_central", "中央一般公共预算收入累计同比", 2, "#5f76b8"],
  ["general_revenue_local", "地方一般公共预算本级收入累计同比", 2, "#6ccad1"],
  ["vat", "国内增值税累计同比", 3, "#56b6c2"],
  ["corporate_income_tax", "企业所得税累计同比", 3, "#d89b4e"],
  ["personal_income_tax", "个人所得税累计同比", 3, "#c97b84"],
  ["fund_revenue_local", "地方政府性基金预算本级收入累计同比", 4, "#6ccad1"],
  ["land_transfer_revenue", "国有土地使用权出让收入累计同比", 4, "#ef6461"],
].map(([component, displayName, panel, color]): CnFiscalSeriesDef => ({
  virtualKey: mds(`mof_cn_fiscal_${component}_yoy`),
  displayName: displayName as string,
  panel: panel as number,
  axis: "left",
  chartType: "line",
  color: color as string,
  calc: NONE_KEEP,
  roleId: `cn-fiscal-${String(component).replaceAll("_", "-")}-yoy`,
}));

const INTEREST_AMOUNT = mds("mof_cn_fiscal_debt_interest_amount");
const EXPENDITURE_AMOUNT_FOR_SHARE = mds("mof_cn_fiscal_general_expenditure_amount", "interest-share-base");

export const CN_FISCAL_EXPENDITURE_DERIVED: readonly MacroDerivedCalc[] = [
  {
    id: "cn-fiscal-interest-share-expenditure-ytd",
    leftKey: INTEREST_AMOUNT,
    rightKey: EXPENDITURE_AMOUNT_FOR_SHARE,
    op: "ratio",
    scale: 100,
    name: "债务付息/一般公共预算支出（%）",
  },
];

export const CN_FISCAL_EXPENDITURE_SERIES: readonly CnFiscalSeriesDef[] = [
  ...[
    ["general_expenditure_central", "中央一般公共预算本级支出累计同比", 1, "#5f76b8"],
    ["general_expenditure_local", "地方一般公共预算支出累计同比", 1, "#6ccad1"],
    ["social_security", "社会保障和就业支出累计同比", 2, "#c97b84"],
    ["education", "教育支出累计同比", 2, "#d89b4e"],
    ["health", "卫生健康支出累计同比", 2, "#56b6c2"],
    ["science", "科学技术支出累计同比", 3, "#5f76b8"],
    ["agriculture", "农林水支出累计同比", 3, "#6ccad1"],
    ["transport", "交通运输支出累计同比", 3, "#d89b4e"],
    ["debt_interest", "债务付息支出累计同比", 4, "#ef6461"],
  ].map(([component, displayName, panel, color]): CnFiscalSeriesDef => ({
    virtualKey: mds(`mof_cn_fiscal_${component}_yoy`),
    displayName: displayName as string,
    panel: panel as number,
    axis: "left",
    chartType: "line",
    color: color as string,
    calc: NONE_KEEP,
    roleId: `cn-fiscal-${String(component).replaceAll("_", "-")}-yoy`,
  })),
  {
    virtualKey: INTEREST_AMOUNT,
    displayName: "债务付息支出累计额",
    panel: null,
    axis: "left",
    chartType: "line",
    color: "#8f9bab",
    calc: NONE_KEEP,
    roleId: "cn-fiscal-interest-amount",
  },
  {
    virtualKey: EXPENDITURE_AMOUNT_FOR_SHARE,
    displayName: "一般公共预算支出累计额（付息占比基数）",
    panel: null,
    axis: "left",
    chartType: "line",
    color: "#8f9bab",
    calc: NONE_KEEP,
    roleId: "cn-fiscal-expenditure-amount-share-base",
  },
];

const OVERVIEW_SLOT_TITLES: Record<number, string> = {
  0: "一般公共预算收支累计同比",
  1: "政府性基金预算收支累计同比",
  2: "两账本赤字代理（正值=支出高于收入）",
  3: "两账本合并可观察赤字/GDP（年度）",
};

const REVENUE_SLOT_TITLES: Record<number, string> = {
  0: "一般公共预算收入质量：税收 vs 非税",
  1: "中央与地方本级收入累计同比",
  2: "主要税基：增值税、企业所得税、个人所得税",
  3: "地方基金与土地出让收入累计同比",
};

const EXPENDITURE_SLOT_TITLES: Record<number, string> = {
  0: "中央本级与地方支出执行",
  1: "民生托底：社保、教育、卫生",
  2: "发展支出：科技、农林水、交通",
  3: "债务付息增速与付息占比",
};

const OVERVIEW_DESCRIPTION =
  "【第一步 · 财政总览】图 1–2 比较一般公共预算、政府性基金预算各自的收支累计同比；图 3 看两账本各自及合并可观察赤字代理；图 4 才用年度名义 GDP 标准化。代理未处理调入调出、结转结余及账间重复，不等于官方赤字率。";
const REVENUE_DESCRIPTION =
  "【第二步 · 收入解释】总收入增速已在总览模板，本模板只拆税收/非税、中央/地方本级收入、主要税基和土地财力。地方本级收入不含中央转移支付，不能直接与地方支出相减。";
const EXPENDITURE_DESCRIPTION =
  "【第三步 · 支出解释】从总览模板的一般公共预算总支出进入中央本级与地方执行、民生和发展投向，再看预算内债务付息增速与付息占比。付息约束不能用于估计隐性债务。";

const OVERVIEW_INTRO: Record<string, string> = {
  "0": "一般公共预算收入与支出累计同比的剪刀差。支出快于收入且差距扩大，表示常规预算账本的可观察资金缺口增加；收入原因转收入模板，支出去向转支出模板。",
  "1": "政府性基金预算收支累计同比。收入更受土地和项目周期影响；收入走弱而支出维持通常意味着基金账本承压，再到收入模板图 4 检查土地财力。",
  "2": "一般预算、基金预算各自赤字代理均为支出−收入；合并线为两者之和。正值扩大表示可观察缺口增加，但未处理调入调出和账间关系，不能称官方赤字。",
  "3": "只在最后将年末两账本合并可观察赤字除以同年名义 GDP，用于跨年比较。未完成年度不出值，该线不等于政府工作报告或决算中的官方赤字率。",
};
const REVENUE_INTRO: Record<string, string> = {
  "0": "总收入已在总览图 1，本图只拆税收与非税。税收弱、非税强可能表示经济税基偏弱并由其他收入补位，其可持续性通常较低。",
  "1": "中央收入与地方本级收入用于定位压力层级。地方本级收入不含中央转移支付，不能据此直接判断地方可支配财力。",
  "2": "增值税更贴近生产流通，企业所得税受利润和汇算清缴影响，个人所得税反映居民收入与政策变化。三项共同走弱比单项波动更能说明税基压力。",
  "3": "地方基金预算本级收入与土地出让收入同向走弱，说明土地财政拖累较广；回总览图 2 对照全国基金预算收入，识别是否存在其他基金项目补位。",
};
const EXPENDITURE_INTRO: Record<string, string> = {
  "0": "总支出已在总览图 1，本图比较中央本级与地方执行。地方支出包含转移支付形成的支出，央地两线只反映执行节奏，不能相减推算地方缺口。",
  "1": "社保就业、教育和卫生健康共同衡量民生托底。三者同步加快才更能说明公共服务支出扩张，单项跳升需检查基数与专项政策。",
  "2": "科技、农林水和交通运输对应创新、农业水利与交通基础设施。持续改善并高于总支出增速，才说明发展性支出倾斜。",
  "3": "付息增速上升且付息占一般公共预算支出比重抬升，表示预算内刚性负担挤压其他空间；这不能用于估计城投或隐性债务。",
};

function visibleDerivedKeys(calcs: readonly MacroDerivedCalc[]): string[] {
  return calcs.filter((calc) => !calc.hidden).map((calc) => `calc:${calc.id}`);
}

function buildTemplate(opts: {
  id: string;
  name: string;
  description: string;
  series: readonly CnFiscalSeriesDef[];
  derived?: readonly MacroDerivedCalc[];
  slotTitles: Record<number, string>;
  chartIntroNotes: Record<string, string>;
  derivedSlots?: Record<string, number | null>;
  derivedVisuals?: Record<string, { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string }>;
}): MacroChartTemplate {
  const derived = opts.derived ?? [];
  const selectedKeys = [
    ...opts.series.map((row) => row.virtualKey),
    ...visibleDerivedKeys(derived),
  ];
  const slotAssignment: Record<string, number | null> = {};
  const seriesVisualMap: MacroChartTemplate["seriesVisualMap"] = {};
  const seriesCalcConfigMap: MacroSeriesCalcConfigMap = {};
  for (const row of opts.series) {
    slotAssignment[row.virtualKey] = row.panel == null ? null : row.panel - 1;
    seriesVisualMap[row.virtualKey] = {
      axis: row.axis,
      chartType: row.chartType,
      color: row.color,
      showEndLabel: true,
    };
    seriesCalcConfigMap[row.virtualKey] = row.calc;
  }
  for (const calc of derived) {
    const key = `calc:${calc.id}`;
    if (calc.hidden) continue;
    slotAssignment[key] = opts.derivedSlots?.[key] ?? 0;
    const visual = opts.derivedVisuals?.[key];
    seriesVisualMap[key] = {
      axis: visual?.axis ?? "left",
      chartType: visual?.chartType ?? "line",
      color: visual?.color ?? "#3e4d83",
      showEndLabel: true,
    };
  }
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    chartIntroNotes: opts.chartIntroNotes,
    selectedKeys,
    layoutMode: 4,
    slotAssignment,
    seriesVisualMap,
    seriesCalcConfigMap,
    derivedCalcs: derived.length ? [...derived] : undefined,
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
    createdAtIso: "2026-08-10T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-cn-fiscal",
  };
}

const OVERVIEW_DERIVED_SLOTS: Record<string, number | null> = {
  "calc:cn-fiscal-general-deficit-proxy": 2,
  "calc:cn-fiscal-fund-deficit-proxy": 2,
  "calc:cn-fiscal-two-book-deficit-proxy": 2,
  "calc:cn-fiscal-two-book-deficit-gdp": 3,
};
const OVERVIEW_DERIVED_VISUALS = {
  "calc:cn-fiscal-general-deficit-proxy": { axis: "left" as const, chartType: "bar" as const, color: "#ef6461" },
  "calc:cn-fiscal-fund-deficit-proxy": { axis: "left" as const, chartType: "bar" as const, color: "#d89b4e" },
  "calc:cn-fiscal-two-book-deficit-proxy": { axis: "left" as const, chartType: "dashedLine" as const, color: "#3e4d83" },
  "calc:cn-fiscal-two-book-deficit-gdp": { axis: "left" as const, chartType: "line" as const, color: "#ef6461" },
};

export const BUILTIN_CN_FISCAL_OVERVIEW_TEMPLATE = buildTemplate({
  id: "builtin-cn-fiscal-overview",
  name: "财政全景 · 双账本增速与赤字",
  description: OVERVIEW_DESCRIPTION,
  series: CN_FISCAL_OVERVIEW_SERIES,
  derived: CN_FISCAL_OVERVIEW_DERIVED,
  slotTitles: OVERVIEW_SLOT_TITLES,
  chartIntroNotes: OVERVIEW_INTRO,
  derivedSlots: OVERVIEW_DERIVED_SLOTS,
  derivedVisuals: OVERVIEW_DERIVED_VISUALS,
});

export const BUILTIN_CN_FISCAL_REVENUE_TEMPLATE = buildTemplate({
  id: "builtin-cn-fiscal-revenue",
  name: "财政收入 · 税基、央地与土地财力",
  description: REVENUE_DESCRIPTION,
  series: CN_FISCAL_REVENUE_SERIES,
  slotTitles: REVENUE_SLOT_TITLES,
  chartIntroNotes: REVENUE_INTRO,
});

export const BUILTIN_CN_FISCAL_EXPENDITURE_TEMPLATE = buildTemplate({
  id: "builtin-cn-fiscal-expenditure",
  name: "财政支出 · 执行、投向与刚性约束",
  description: EXPENDITURE_DESCRIPTION,
  series: CN_FISCAL_EXPENDITURE_SERIES,
  derived: CN_FISCAL_EXPENDITURE_DERIVED,
  slotTitles: EXPENDITURE_SLOT_TITLES,
  chartIntroNotes: EXPENDITURE_INTRO,
  derivedSlots: { "calc:cn-fiscal-interest-share-expenditure-ytd": 3 },
  derivedVisuals: {
    "calc:cn-fiscal-interest-share-expenditure-ytd": {
      axis: "right",
      chartType: "dashedLine",
      color: "#3e4d83",
    },
  },
});

export const BUILTIN_CN_FISCAL_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_CN_FISCAL_OVERVIEW_TEMPLATE,
  BUILTIN_CN_FISCAL_REVENUE_TEMPLATE,
  BUILTIN_CN_FISCAL_EXPENDITURE_TEMPLATE,
];

export const BUILTIN_CN_FISCAL_TEMPLATE_IDS = BUILTIN_CN_FISCAL_TEMPLATES.map(
  (template) => template.id,
);

export const CN_FISCAL_VIRTUAL_KEY_LABELS: ReadonlyMap<string, string> = new Map([
  ...[
    ...CN_FISCAL_OVERVIEW_SERIES,
    ...CN_FISCAL_REVENUE_SERIES,
    ...CN_FISCAL_EXPENDITURE_SERIES,
  ].map((row) => [row.virtualKey, row.displayName] as const),
  ...[...CN_FISCAL_OVERVIEW_DERIVED, ...CN_FISCAL_EXPENDITURE_DERIVED]
    .filter((calc) => !calc.hidden)
    .map((calc) => [`calc:${calc.id}`, calc.name] as const),
]);
