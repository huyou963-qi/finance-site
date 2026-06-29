import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

export type FiscalCalcOp = "yoy" | "pctChange" | "none";

export type FiscalAnalysisSeriesDef = {
  virtualKey: string;
  displayName: string;
  panel: number;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calcOp: FiscalCalcOp;
  resampleToMonth?: boolean;
  stackGroup?: string;
  roleId?: string;
  fredId?: string;
  mdsCode?: string;
};

export function fiscalFredKey(fredId: string, variant?: string): string {
  if (!variant || variant === "level") return `fred:${fredId}`;
  return `fred:${fredId}::${variant}`;
}

export function fiscalMdsKey(instrumentCode: string): string {
  return `mds:${instrumentCode}`;
}

function calcConfigFor(op: FiscalCalcOp, resampleToMonth?: boolean): MacroSeriesCalcConfig {
  if (op === "none") {
    return {
      op: "none",
      frequency: resampleToMonth ? "month" : "keep",
      unit: "keep",
      resampleMethod: resampleToMonth ? "avg" : "end",
    };
  }
  return {
    op,
    frequency: "month",
    unit: "keep",
    resampleMethod: "end",
  };
}

export function buildFiscalSeriesCalcConfigMap(
  series: readonly FiscalAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const row of series) {
    out[row.virtualKey] = calcConfigFor(row.calcOp, row.resampleToMonth);
  }
  return out;
}

function layoutModeForPanels(maxPanel: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (maxPanel <= 1) return 1;
  if (maxPanel <= 2) return 2;
  if (maxPanel <= 3) return 3;
  if (maxPanel <= 4) return 4;
  if (maxPanel <= 5) return 5;
  return 6;
}

/** 视图 A：财政总览 · 存量与流量 */
export const FISCAL_OVERVIEW_SERIES: readonly FiscalAnalysisSeriesDef[] = [
  {
    virtualKey: fiscalFredKey("GFDEGDQ188S"),
    fredId: "GFDEGDQ188S",
    roleId: "us-federal-debt-gdp",
    displayName: "联邦公共债务/GDP %",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#6f84c0",
    calcOp: "none",
  },
  {
    virtualKey: fiscalFredKey("GFDEBTN"),
    fredId: "GFDEBTN",
    roleId: "us-federal-debt-total",
    displayName: "联邦公共债务总额",
    panel: 1,
    axis: "right",
    chartType: "dashedLine",
    color: "#5f76b8",
    calcOp: "none",
  },
  {
    virtualKey: fiscalFredKey("FYFSGDA188S"),
    fredId: "FYFSGDA188S",
    roleId: "us-federal-deficit-gdp",
    displayName: "联邦赤字/GDP %",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("fiscal_primary_deficit_gdp"),
    mdsCode: "fiscal_primary_deficit_gdp",
    roleId: "us-primary-deficit-gdp",
    displayName: "联邦初级赤字/GDP %",
    panel: 2,
    axis: "right",
    chartType: "dashedLine",
    color: "#9ea68b",
    calcOp: "none",
  },
  {
    virtualKey: fiscalFredKey("FYOIGDA188S"),
    fredId: "FYOIGDA188S",
    roleId: "us-net-interest-gdp",
    displayName: "联邦利息支出/GDP %",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#d75a68",
    calcOp: "none",
  },
];

/** 视图 B：财政结构 · 收支拆解 */
export const FISCAL_STRUCTURE_SERIES: readonly FiscalAnalysisSeriesDef[] = [
  {
    virtualKey: fiscalMdsKey("treasury_mts_m09_rcpt_individual"),
    mdsCode: "treasury_mts_m09_rcpt_individual",
    roleId: "us-receipts-individual-tax",
    displayName: "个人所得税（现金，月）",
    panel: 1,
    axis: "left",
    chartType: "stackBar",
    color: "#56b6c2",
    calcOp: "none",
    stackGroup: "fiscal-rcpt",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m09_rcpt_corporate"),
    mdsCode: "treasury_mts_m09_rcpt_corporate",
    roleId: "us-receipts-corporate-tax",
    displayName: "企业所得税（现金，月）",
    panel: 1,
    axis: "left",
    chartType: "stackBar",
    color: "#7fc8c5",
    calcOp: "none",
    stackGroup: "fiscal-rcpt",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m09_rcpt_payroll"),
    mdsCode: "treasury_mts_m09_rcpt_payroll",
    roleId: "us-receipts-payroll-tax",
    displayName: "社保/退休税（现金，月）",
    panel: 1,
    axis: "left",
    chartType: "stackBar",
    color: "#d89b4e",
    calcOp: "none",
    stackGroup: "fiscal-rcpt",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m09_mandatory_proxy"),
    mdsCode: "treasury_mts_m09_mandatory_proxy",
    roleId: "us-outlays-mandatory",
    displayName: "强制性支出代理（MTS Table 9）",
    panel: 2,
    axis: "left",
    chartType: "stackBar",
    color: "#c97b84",
    calcOp: "none",
    stackGroup: "fiscal-outlay",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m09_discretionary_proxy"),
    mdsCode: "treasury_mts_m09_discretionary_proxy",
    roleId: "us-outlays-discretionary",
    displayName: "可自由裁量支出代理（MTS Table 9）",
    panel: 2,
    axis: "left",
    chartType: "stackBar",
    color: "#f4b165",
    calcOp: "none",
    stackGroup: "fiscal-outlay",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m09_outlay_interest"),
    mdsCode: "treasury_mts_m09_outlay_interest",
    roleId: "us-outlays-net-interest",
    displayName: "净利息支出（现金，月）",
    panel: 2,
    axis: "left",
    chartType: "stackBar",
    color: "#d75a68",
    calcOp: "none",
    stackGroup: "fiscal-outlay",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m01_receipts"),
    mdsCode: "treasury_mts_m01_receipts",
    roleId: "us-mts-receipts",
    displayName: "MTS 现金收入 YoY",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#56b6c2",
    calcOp: "yoy",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m01_outlays"),
    mdsCode: "treasury_mts_m01_outlays",
    roleId: "us-mts-outlays",
    displayName: "MTS 现金支出 YoY",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "yoy",
  },
  {
    virtualKey: fiscalFredKey("GCEC1", "yoy"),
    fredId: "GCEC1",
    roleId: "us-gov-consumption-yoy",
    displayName: "实际政府消费 YoY（广义政府）",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#6f84c0",
    calcOp: "yoy",
  },
  {
    virtualKey: fiscalMdsKey("fiscal_fgcec1_yoy"),
    mdsCode: "fiscal_fgcec1_yoy",
    roleId: "us-gov-investment-yoy",
    displayName: "联邦消费+总投资 YoY",
    panel: 4,
    axis: "right",
    chartType: "dashedLine",
    color: "#5f76b8",
    calcOp: "none",
  },
];

/** 视图 C：高频跟踪 · 现金流与融资 */
export const FISCAL_HIGHFREQ_SERIES: readonly FiscalAnalysisSeriesDef[] = [
  {
    virtualKey: fiscalMdsKey("treasury_mts_m01_deficit"),
    mdsCode: "treasury_mts_m01_deficit",
    roleId: "us-mts-deficit",
    displayName: "MTS 联邦月赤字",
    panel: 1,
    axis: "left",
    chartType: "bar",
    color: "#ef6461",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m01_receipts"),
    mdsCode: "treasury_mts_m01_receipts",
    roleId: "us-mts-receipts",
    displayName: "MTS 联邦现金收入（月）",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#56b6c2",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m01_outlays"),
    mdsCode: "treasury_mts_m01_outlays",
    roleId: "us-mts-outlays",
    displayName: "MTS 联邦现金支出（月）",
    panel: 2,
    axis: "right",
    chartType: "dashedLine",
    color: "#ef6461",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_dts_tga_balance"),
    mdsCode: "treasury_dts_tga_balance",
    roleId: "us-tga-balance",
    displayName: "TGA 余额（日）",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_dts_daily_net_cash"),
    mdsCode: "treasury_dts_daily_net_cash",
    roleId: "us-dts-daily-deficit",
    displayName: "DTS 日净现金流",
    panel: 4,
    axis: "left",
    chartType: "bar",
    color: "#9ea68b",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_debt_penny_net_weekly"),
    mdsCode: "treasury_debt_penny_net_weekly",
    roleId: "us-net-issuance-weekly",
    displayName: "公共债务周净增发",
    panel: 5,
    axis: "left",
    chartType: "line",
    color: "#6f84c0",
    calcOp: "none",
  },
];

export const FISCAL_OVERVIEW_SLOT_TITLES: Record<number, string> = {
  0: "F1a 存量：债务/GDP 与债务总额",
  1: "F2 流量：赤字/GDP 与初级赤字",
  2: "F1b 负担：利息/GDP",
};

export const FISCAL_STRUCTURE_SLOT_TITLES: Record<number, string> = {
  0: "F3b 收入分项（MTS Table 9 现金）",
  1: "F4b 支出结构（MTS 代理；≠ CBO 法定口径）",
  2: "F3a/F4a MTS 总收/总支 YoY",
  3: "F4c 政府消费 vs 联邦消费+投资 YoY",
};

export const FISCAL_HIGHFREQ_SLOT_TITLES: Record<number, string> = {
  0: "F5a MTS 月赤字（现金）",
  1: "F5a MTS 月收入 vs 支出（水平）",
  2: "F5b TGA 余额",
  3: "F5b DTS 日净现金流",
  4: "F5c 周净发债",
};

export const FISCAL_OVERVIEW_DESCRIPTION =
  "【第一步 · 初学者入口】按图 1→3 写 L0（≤150 字）：债务负担、赤字/GDP、初级赤字与利息。口径：OMB/FRED 为权责/GDP 比率；MTS/DTS 在视图 C。若问「为什么赤字变」→ 加载「财政结构 · 收支拆解」。";

export const FISCAL_STRUCTURE_DESCRIPTION =
  "【第二步 · 解释为什么】图 1–2 为 Treasury **现金制** MTS Table 9；mandatory/discretionary 为 **功能分类代理**，图表须标注 ≠ CBO 法定口径。图 3–4 对照总收/总支与 NIPA 政府侧。与视图 A **不重复** 债务/GDP、赤字/GDP。";

export const FISCAL_HIGHFREQ_DESCRIPTION =
  "【第三步 · 发布月/周】MTS 月表（现金）、TGA 与 DTS 日频、Debt to the Penny 周净增发。FY 日历 10/1–9/30；DTS 日净流 = Deposits−Withdrawals（百万美元），非 BEA 权责赤字。";

export const FISCAL_OVERVIEW_CHART_INTRO: Record<string, string> = {
  "0":
    "左轴公共债务/GDP %、右轴债务总额：存量负担是否抬升。债务/GDP 升而总额稳 → 看名义 GDP；双升 → 五问 ① 与 F5 融资。",
  "1":
    "左轴赤字/GDP %、右轴初级赤字/GDP %：总赤字宽、初级窄 → **利息** 渠道（看图 3）；初级也宽 → 收入或刚性支出（视图 B）。",
  "2":
    "利息/GDP %：高利率环境下「第二财政」。对照视图 B 净利息现金支出与视图 C 周净发债。",
};

export const FISCAL_STRUCTURE_CHART_INTRO: Record<string, string> = {
  "0":
    "个税 / 企税 / payroll 堆叠：收入端谁在变。退税季企业税波动大；payroll 刚性 → 对照 mandatory 代理。",
  "1":
    "**MTS Table 9 功能分类代理**（SS/Medicare/Health 等 vs 国防/教育/交通等 + 净利息）。**≠ CBO mandatory/discretionary**；勿与 OMB 表直接对比。",
  "2":
    "MTS Table 1 总收/总支 YoY：近月脉冲是否弱于年度/GDP 叙事（五问 ④）。现金制，FY 月对齐。",
  "3":
    "左轴广义政府消费 YoY（GCEC1）、右轴联邦消费+总投资 YoY（FGCEC1 衍生）：经济含义；与 Overview L2G 政府代理交叉。",
};

export const FISCAL_HIGHFREQ_CHART_INTRO: Record<string, string> = {
  "0":
    "MTS 月赤字柱：单月噪声大，结合图 2 收/支水平看趋势。发布月（约每月第 8–12 个工作日）更新。",
  "1":
    "MTS 月收入 vs 支出（现金水平）：对照图 0 赤字；收入走弱或支出走强 → 回视图 B 分项。",
  "2":
    "TGA 日余额（百万美元）：财政部在联储账户。快速下降 + 债务上限博弈 → 五问 ⑤ 流动性/政治尾部。",
  "3":
    "DTS 日净现金流 = Total Deposits − Total Withdrawals（Table II 汇总）。负值日多 → 现金压力；**非** 权责赤字。",
  "4":
    "公共债务周净增发（Debt to the Penny 周差分）：融资脉冲。与视图 A 债务存量、视图 B 净利息对照。",
};

function fiscalSelectedKeys(series: readonly FiscalAnalysisSeriesDef[]): string[] {
  return series.map((r) => r.virtualKey);
}

function buildFiscalSlotAssignment(
  series: readonly FiscalAnalysisSeriesDef[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of series) {
    out[row.virtualKey] = row.panel - 1;
  }
  return out;
}

function buildFiscalVisualMap(
  series: readonly FiscalAnalysisSeriesDef[],
): Record<
  string,
  {
    axis: "left" | "right";
    chartType: MacroSeriesChartType;
    color: string;
    showEndLabel: boolean;
    stackGroup?: string;
  }
> {
  const out: Record<
    string,
    {
      axis: "left" | "right";
      chartType: MacroSeriesChartType;
      color: string;
      showEndLabel: boolean;
      stackGroup?: string;
    }
  > = {};
  for (const row of series) {
    out[row.virtualKey] = {
      axis: row.axis,
      chartType: row.chartType,
      color: row.color,
      showEndLabel: true,
      ...(row.stackGroup ? { stackGroup: row.stackGroup } : {}),
    };
  }
  return out;
}

export function buildFiscalBuiltinTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly FiscalAnalysisSeriesDef[];
  slotTitles: Record<number, string>;
  createdAtIso?: string;
}): MacroChartTemplate {
  const maxPanel = opts.series.reduce((m, r) => Math.max(m, r.panel), 1);
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    chartIntroNotes: { ...opts.chartIntroNotes },
    selectedKeys: fiscalSelectedKeys(opts.series),
    layoutMode: layoutModeForPanels(maxPanel),
    slotAssignment: buildFiscalSlotAssignment(opts.series),
    seriesVisualMap: buildFiscalVisualMap(opts.series),
    seriesCalcConfigMap: buildFiscalSeriesCalcConfigMap(opts.series),
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
    createdAtIso: opts.createdAtIso ?? "2026-06-19T12:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-fiscal",
  };
}

export const BUILTIN_US_FISCAL_OVERVIEW_TEMPLATE = buildFiscalBuiltinTemplate({
  id: "builtin-us-fiscal-overview",
  name: "财政总览 · 存量与流量",
  description: FISCAL_OVERVIEW_DESCRIPTION,
  chartIntroNotes: FISCAL_OVERVIEW_CHART_INTRO,
  series: FISCAL_OVERVIEW_SERIES,
  slotTitles: FISCAL_OVERVIEW_SLOT_TITLES,
});

export const BUILTIN_US_FISCAL_STRUCTURE_TEMPLATE = buildFiscalBuiltinTemplate({
  id: "builtin-us-fiscal-structure",
  name: "财政结构 · 收支拆解",
  description: FISCAL_STRUCTURE_DESCRIPTION,
  chartIntroNotes: FISCAL_STRUCTURE_CHART_INTRO,
  series: FISCAL_STRUCTURE_SERIES,
  slotTitles: FISCAL_STRUCTURE_SLOT_TITLES,
});

export const BUILTIN_US_FISCAL_HIGHFREQ_TEMPLATE = buildFiscalBuiltinTemplate({
  id: "builtin-us-fiscal-highfreq",
  name: "高频跟踪 · 现金流与融资",
  description: FISCAL_HIGHFREQ_DESCRIPTION,
  chartIntroNotes: FISCAL_HIGHFREQ_CHART_INTRO,
  series: FISCAL_HIGHFREQ_SERIES,
  slotTitles: FISCAL_HIGHFREQ_SLOT_TITLES,
});

export const BUILTIN_US_FISCAL_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_FISCAL_OVERVIEW_TEMPLATE,
  BUILTIN_US_FISCAL_STRUCTURE_TEMPLATE,
  BUILTIN_US_FISCAL_HIGHFREQ_TEMPLATE,
];

export const BUILTIN_US_FISCAL_TEMPLATE_IDS = BUILTIN_US_FISCAL_TEMPLATES.map((t) => t.id);

function buildFiscalVirtualKeyLabelMap(): ReadonlyMap<string, string> {
  const allSeries = [
    ...FISCAL_OVERVIEW_SERIES,
    ...FISCAL_STRUCTURE_SERIES,
    ...FISCAL_HIGHFREQ_SERIES,
  ];
  const m = new Map<string, string>();
  for (const row of allSeries) {
    m.set(row.virtualKey, row.displayName);
  }
  return m;
}

export const FISCAL_VIRTUAL_KEY_LABELS = buildFiscalVirtualKeyLabelMap();
