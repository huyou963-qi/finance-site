import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroDerivedCalc,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";

export type CnFinancialLiquiditySeriesDef = {
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

function mds(code: string): string {
  return `mds:${code}`;
}

const LPR_1Y = mds("pbc_cn_lpr_1y");
const LPR_5Y = mds("pbc_cn_lpr_5y");
const REPO_RATE = mds("pbc_cn_repo_rate");
const INTERBANK_RATE = mds("pbc_cn_interbank_lending_rate");
const M1_YOY = mds("pbc_cn_m1_yoy");
const M2_YOY = mds("pbc_cn_m2_yoy");
const TSF_STOCK_YOY = mds("pbc_cn_social_financing_stock_yoy");
const RMB_LOAN_YOY = mds("pbc_cn_rmb_loan_yoy");
const RMB_DEPOSIT_YOY = mds("pbc_cn_rmb_deposit_yoy");
const TSF_CUMULATIVE = mds("pbc_cn_social_financing_cumulative");
const TSF_RMB_LOAN_CUMULATIVE = mds("pbc_cn_social_financing_rmb_loan_cumulative");
const GOVERNMENT_BOND_CUMULATIVE = mds("pbc_cn_government_bond_financing_cumulative");
const CORPORATE_BOND_CUMULATIVE = mds("pbc_cn_corporate_bond_financing_cumulative");
const EQUITY_CUMULATIVE = mds("pbc_cn_domestic_equity_financing_cumulative");

export const CN_FINANCIAL_LIQUIDITY_FUNDING_DERIVED: readonly MacroDerivedCalc[] = [
  {
    id: "cn-financial-unsecured-secured-spread",
    leftKey: INTERBANK_RATE,
    rightKey: REPO_RATE,
    op: "sub",
    name: "无担保−有担保资金价差代理（百分点）",
  },
  {
    id: "cn-financial-m1-m2-gap",
    leftKey: M1_YOY,
    rightKey: M2_YOY,
    op: "sub",
    name: "M1−M2 增速差（百分点）",
  },
];

export const CN_FINANCIAL_LIQUIDITY_CREDIT_DERIVED: readonly MacroDerivedCalc[] = [
  {
    id: "cn-financial-loan-deposit-growth-gap",
    leftKey: RMB_LOAN_YOY,
    rightKey: RMB_DEPOSIT_YOY,
    op: "sub",
    name: "贷款−存款增速差（百分点）",
  },
  {
    id: "cn-financial-tsf-rmb-loan-share",
    leftKey: TSF_RMB_LOAN_CUMULATIVE,
    rightKey: TSF_CUMULATIVE,
    op: "ratio",
    scale: 100,
    name: "社融口径人民币贷款占社融增量累计（%）",
  },
  {
    id: "cn-financial-tsf-government-bond-share",
    leftKey: GOVERNMENT_BOND_CUMULATIVE,
    rightKey: TSF_CUMULATIVE,
    op: "ratio",
    scale: 100,
    name: "政府债券融资占社融增量累计（%）",
  },
  {
    id: "cn-financial-tsf-corporate-bond-share",
    leftKey: CORPORATE_BOND_CUMULATIVE,
    rightKey: TSF_CUMULATIVE,
    op: "ratio",
    scale: 100,
    name: "企业债券融资占社融增量累计（%）",
  },
  {
    id: "cn-financial-tsf-equity-share",
    leftKey: EQUITY_CUMULATIVE,
    rightKey: TSF_CUMULATIVE,
    op: "ratio",
    scale: 100,
    name: "非金融企业境内股票融资占社融增量累计（%）",
  },
];

export const CN_FINANCIAL_LIQUIDITY_FUNDING_SERIES: readonly CnFinancialLiquiditySeriesDef[] = [
  {
    virtualKey: LPR_1Y,
    displayName: "贷款市场报价利率（1年期）",
    panel: 1,
    axis: "left",
    chartType: "stepLine",
    color: "#5f76b8",
    calc: NONE_KEEP,
    roleId: "cn-financial-lpr-1y",
  },
  {
    virtualKey: LPR_5Y,
    displayName: "贷款市场报价利率（5年以上）",
    panel: 1,
    axis: "left",
    chartType: "stepLine",
    color: "#ef6461",
    calc: NONE_KEEP,
    roleId: "cn-financial-lpr-5y",
  },
  {
    virtualKey: REPO_RATE,
    displayName: "质押式债券回购加权平均利率",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calc: NONE_KEEP,
    roleId: "cn-financial-repo-rate",
  },
  {
    virtualKey: INTERBANK_RATE,
    displayName: "银行间同业拆借加权平均利率",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calc: NONE_KEEP,
    roleId: "cn-financial-interbank-rate",
  },
  {
    virtualKey: M1_YOY,
    displayName: "狭义货币（M1）同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: NONE_KEEP,
    roleId: "cn-financial-m1-yoy",
  },
  {
    virtualKey: M2_YOY,
    displayName: "广义货币（M2）同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calc: NONE_KEEP,
    roleId: "cn-financial-m2-yoy",
  },
];

export const CN_FINANCIAL_LIQUIDITY_CREDIT_SERIES: readonly CnFinancialLiquiditySeriesDef[] = [
  {
    virtualKey: TSF_STOCK_YOY,
    displayName: "社会融资规模存量同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: NONE_KEEP,
    roleId: "cn-financial-tsf-stock-yoy",
  },
  {
    virtualKey: RMB_LOAN_YOY,
    displayName: "人民币贷款余额同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calc: NONE_KEEP,
    roleId: "cn-financial-rmb-loan-yoy",
  },
  {
    virtualKey: RMB_DEPOSIT_YOY,
    displayName: "人民币存款余额同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calc: NONE_KEEP,
    roleId: "cn-financial-rmb-deposit-yoy",
  },
  ...[
    [TSF_CUMULATIVE, "社会融资规模增量累计", "cn-financial-tsf-cumulative"],
    [TSF_RMB_LOAN_CUMULATIVE, "社融：人民币贷款累计", "cn-financial-tsf-rmb-loan-cumulative"],
    [GOVERNMENT_BOND_CUMULATIVE, "社融：政府债券融资累计", "cn-financial-government-bond-cumulative"],
    [CORPORATE_BOND_CUMULATIVE, "社融：企业债券融资累计", "cn-financial-corporate-bond-cumulative"],
    [EQUITY_CUMULATIVE, "社融：非金融企业境内股票融资累计", "cn-financial-equity-cumulative"],
  ].map(([virtualKey, displayName, roleId]): CnFinancialLiquiditySeriesDef => ({
    virtualKey,
    displayName,
    panel: null,
    axis: "left",
    chartType: "line",
    color: "#8f9bab",
    calc: NONE_KEEP,
    roleId,
  })),
];

const FUNDING_SLOT_TITLES: Record<number, string> = {
  0: "贷款报价利率：1年期 vs 5年以上 LPR",
  1: "银行间资金价格与无担保−有担保价差",
  2: "货币增速：M1 vs M2",
  3: "货币活化代理：M1−M2 增速差",
};

const CREDIT_SLOT_TITLES: Record<number, string> = {
  0: "信用总量：社融存量 vs 人民币贷款同比",
  1: "银行资产负债：存款同比与贷存增速差",
  2: "融资渠道：银行信贷 vs 政府债券占比",
  3: "直接融资：企业债券 vs 股票融资占比",
};

const FUNDING_DESCRIPTION =
  "【第一步 · 资金与货币活性】从 1 年期/5 年以上 LPR、银行间有担保/无担保资金价格，进入 M1/M2 与 M1−M2 增速差，判断流动性是否由价格和总量宽松进一步转成交易性资金活跃。月均回购利率不是 DR007，M1−M2 也不是官方指数。";

const CREDIT_DESCRIPTION =
  "【第二步 · 信用与结构】从社融和人民币贷款存量同比进入贷存扩张，再拆人民币贷款、政府债券、企业债券与股票融资占社融增量累计的比重，区分私人信用修复、政府融资托底和直接融资接力。占比是年内累计口径，每年 1 月重置且不构成完整 100%。";

const FUNDING_INTRO: Record<string, string> = {
  "0": "先看 1 年期和 5 年以上 LPR 是否同步下调。同步下行表示银行贷款报价锚放松，5 年以上降幅更大对中长期贷款和按揭更友好；但这只是定价信号，必须去图 2–4 检查资金面和货币活性。",
  "1": "质押式回购与同业拆借月均利率同降，表示银行间资金价格趋松；无担保利率相对有担保利率上升、价差扩大，只能视作资金风险溢价代理。它们不是 DR007/R007，不能判断月内尖峰压力。",
  "2": "M2 企稳而 M1 继续偏弱，通常表示总量流动性未充分进入交易和企业活期资金；两者共同回升才是更广泛的货币扩张。接着去图 4确认相对强弱。",
  "3": "M1−M2 由负收窄、转正，表示交易性货币相对活跃；继续走低则呈现‘钱多但不活’。该代理受 M1 口径和结构变化影响，必须到信用模板图 1验证，不能单独确认复苏。",
};

const CREDIT_INTRO: Record<string, string> = {
  "0": "社融存量与人民币贷款余额同比同步回升，是较广泛的信用扩张；社融回升而贷款继续下行，意味着非贷款融资托底，转到图 3–4找来源。",
  "1": "存款同比反映银行负债端资金增长，贷款−存款增速差上升表示资产端扩张相对更快。它不是存贷比或流动性覆盖率；若与资金模板图 2的银行间利率上行共振，才提示资金来源相对承压。",
  "2": "人民币贷款占比上升且图 1 贷款同比改善，更接近私人信用修复；政府债券占比上升而贷款偏弱，则是政府融资托底，应对照中国财政模板，不能称私人需求复苏。",
  "3": "企业债券与股票融资占比共同上升，表示直接融资渠道改善；若两者持续偏低且图 3 银行贷款占比高，实体融资仍依赖银行。占比为年内累计，每年 1 月重置，允许负值或超过 100%。",
};

function visibleDerivedKeys(calcs: readonly MacroDerivedCalc[]): string[] {
  return calcs.filter((calc) => !calc.hidden).map((calc) => `calc:${calc.id}`);
}

function buildTemplate(opts: {
  id: string;
  name: string;
  description: string;
  series: readonly CnFinancialLiquiditySeriesDef[];
  derived: readonly MacroDerivedCalc[];
  slotTitles: Record<number, string>;
  chartIntroNotes: Record<string, string>;
  derivedSlots: Record<string, number | null>;
  derivedVisuals: Record<string, { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string }>;
}): MacroChartTemplate {
  const selectedKeys = [
    ...opts.series.map((row) => row.virtualKey),
    ...visibleDerivedKeys(opts.derived),
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
  for (const calc of opts.derived) {
    if (calc.hidden) continue;
    const key = `calc:${calc.id}`;
    const visual = opts.derivedVisuals[key];
    slotAssignment[key] = opts.derivedSlots[key] ?? null;
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
    derivedCalcs: [...opts.derived],
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
    folderId: "folder-builtin-cn-financial-liquidity",
  };
}

export const BUILTIN_CN_FINANCIAL_LIQUIDITY_FUNDING_TEMPLATE = buildTemplate({
  id: "builtin-cn-financial-liquidity-funding",
  name: "金融条件 · 资金价格与货币活性",
  description: FUNDING_DESCRIPTION,
  series: CN_FINANCIAL_LIQUIDITY_FUNDING_SERIES,
  derived: CN_FINANCIAL_LIQUIDITY_FUNDING_DERIVED,
  slotTitles: FUNDING_SLOT_TITLES,
  chartIntroNotes: FUNDING_INTRO,
  derivedSlots: {
    "calc:cn-financial-unsecured-secured-spread": 1,
    "calc:cn-financial-m1-m2-gap": 3,
  },
  derivedVisuals: {
    "calc:cn-financial-unsecured-secured-spread": {
      axis: "right",
      chartType: "dashedLine",
      color: "#3e4d83",
    },
    "calc:cn-financial-m1-m2-gap": {
      axis: "left",
      chartType: "bar",
      color: "#d89b4e",
    },
  },
});

export const BUILTIN_CN_FINANCIAL_LIQUIDITY_CREDIT_TEMPLATE = buildTemplate({
  id: "builtin-cn-financial-liquidity-credit",
  name: "金融条件 · 信用扩张与融资结构",
  description: CREDIT_DESCRIPTION,
  series: CN_FINANCIAL_LIQUIDITY_CREDIT_SERIES,
  derived: CN_FINANCIAL_LIQUIDITY_CREDIT_DERIVED,
  slotTitles: CREDIT_SLOT_TITLES,
  chartIntroNotes: CREDIT_INTRO,
  derivedSlots: {
    "calc:cn-financial-loan-deposit-growth-gap": 1,
    "calc:cn-financial-tsf-rmb-loan-share": 2,
    "calc:cn-financial-tsf-government-bond-share": 2,
    "calc:cn-financial-tsf-corporate-bond-share": 3,
    "calc:cn-financial-tsf-equity-share": 3,
  },
  derivedVisuals: {
    "calc:cn-financial-loan-deposit-growth-gap": {
      axis: "right",
      chartType: "bar",
      color: "#d89b4e",
    },
    "calc:cn-financial-tsf-rmb-loan-share": {
      axis: "left",
      chartType: "line",
      color: "#5f76b8",
    },
    "calc:cn-financial-tsf-government-bond-share": {
      axis: "left",
      chartType: "line",
      color: "#ef6461",
    },
    "calc:cn-financial-tsf-corporate-bond-share": {
      axis: "left",
      chartType: "line",
      color: "#6ccad1",
    },
    "calc:cn-financial-tsf-equity-share": {
      axis: "left",
      chartType: "line",
      color: "#c97b84",
    },
  },
});

export const BUILTIN_CN_FINANCIAL_LIQUIDITY_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_CN_FINANCIAL_LIQUIDITY_FUNDING_TEMPLATE,
  BUILTIN_CN_FINANCIAL_LIQUIDITY_CREDIT_TEMPLATE,
];

export const BUILTIN_CN_FINANCIAL_LIQUIDITY_TEMPLATE_IDS =
  BUILTIN_CN_FINANCIAL_LIQUIDITY_TEMPLATES.map((template) => template.id);

export const CN_FINANCIAL_LIQUIDITY_VIRTUAL_KEY_LABELS: ReadonlyMap<string, string> = new Map([
  ...[
    ...CN_FINANCIAL_LIQUIDITY_FUNDING_SERIES,
    ...CN_FINANCIAL_LIQUIDITY_CREDIT_SERIES,
  ].map((row) => [row.virtualKey, row.displayName] as const),
  ...[
    ...CN_FINANCIAL_LIQUIDITY_FUNDING_DERIVED,
    ...CN_FINANCIAL_LIQUIDITY_CREDIT_DERIVED,
  ]
    .filter((calc) => !calc.hidden)
    .map((calc) => [`calc:${calc.id}`, calc.name] as const),
]);
