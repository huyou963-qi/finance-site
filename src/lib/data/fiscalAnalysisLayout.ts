import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroDerivedCalcOp,
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
  /** 指标运算（virtualKey 为 `calc:<id>`）：二次指标不入库，在模板中由基础序列计算 */
  derived?: { op: MacroDerivedCalcOp; leftKey: string; rightKey: string };
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
    if (row.derived) continue;
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
    virtualKey: fiscalMdsKey("treasury_debt_penny_total_daily"),
    mdsCode: "treasury_debt_penny_total_daily",
    roleId: "us-federal-debt-total-daily",
    displayName: "公共债务总额（日）",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#6f84c0",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_debt_penny_held_public_daily"),
    mdsCode: "treasury_debt_penny_held_public_daily",
    roleId: "us-federal-debt-held-public-daily",
    displayName: "公众持有联邦债务（日）",
    panel: 1,
    axis: "left",
    chartType: "dashedLine",
    color: "#5f76b8",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m01_deficit_fytd"),
    mdsCode: "treasury_mts_m01_deficit_fytd",
    roleId: "us-mts-deficit-fytd",
    displayName: "MTS 财年累计赤字（现金）",
    panel: 2,
    axis: "left",
    chartType: "bar",
    color: "#ef6461",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m01_receipts_fytd"),
    mdsCode: "treasury_mts_m01_receipts_fytd",
    roleId: "us-mts-receipts-fytd",
    displayName: "MTS 财年累计收入（现金）",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#56b6c2",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m01_outlays_fytd"),
    mdsCode: "treasury_mts_m01_outlays_fytd",
    roleId: "us-mts-outlays-fytd",
    displayName: "MTS 财年累计支出（现金）",
    panel: 3,
    axis: "left",
    chartType: "dashedLine",
    color: "#ef6461",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m09_outlay_interest"),
    mdsCode: "treasury_mts_m09_outlay_interest",
    roleId: "us-outlays-net-interest",
    displayName: "MTS 月度净利息支出（现金）",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#d75a68",
    calcOp: "none",
  },
  {
    virtualKey: fiscalMdsKey("treasury_mts_m01_deficit"),
    mdsCode: "treasury_mts_m01_deficit",
    roleId: "us-mts-deficit",
    displayName: "MTS 月度赤字（现金）",
    panel: 4,
    axis: "left",
    chartType: "bar",
    color: "#d89b4e",
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
    // 原调度器同比 fiscal_fgcec1_yoy 已退役：基础序列 FGCEC1 + 指标运算同比
    virtualKey: fiscalFredKey("FGCEC1", "yoy"),
    fredId: "FGCEC1",
    roleId: "us-gov-investment-yoy",
    displayName: "联邦消费+总投资 YoY",
    panel: 4,
    axis: "right",
    chartType: "dashedLine",
    color: "#5f76b8",
    calcOp: "yoy",
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
  0: "债务存量：总额与公众持有（日）",
  1: "当期缺口：MTS 财年累计赤字（月）",
  2: "收支两端：MTS 财年累计收入与支出（月）",
  3: "利息压力：月度净利息与月赤字（月）",
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
  "四图优先看最新官方观测：Debt to the Penny 每日公共债务存量、MTS 每月财年累计赤字与收支、MTS 月度净利息。债务是存量，MTS 是现金流；FYTD 每年 10 月重置。这里不把现金赤字冒充年度赤字/GDP，也不以日度债务除以滞后的季度 GDP。";

export const FISCAL_STRUCTURE_DESCRIPTION =
  "【第二步 · 解释为什么】图 1–2 为 Treasury **现金制** MTS Table 9；mandatory/discretionary 为 **功能分类代理**，图表须标注 ≠ CBO 法定口径。图 3–4 对照总收/总支与 NIPA 政府侧。与视图 A **不重复** 债务/GDP、赤字/GDP。";

export const FISCAL_HIGHFREQ_DESCRIPTION =
  "【第三步 · 发布月/周】MTS 月表（现金）、TGA 与 DTS 日频、Debt to the Penny 周净增发。FY 日历 10/1–9/30；DTS 日净流 = Deposits−Withdrawals（百万美元），非 BEA 权责赤字。";

export const FISCAL_OVERVIEW_CHART_INTRO: Record<string, string> = {
  "0":
    "Debt to the Penny 每个工作日公布总债务及公众持有债务，两条线均为美元面值、共用左轴。两者的差额主要对应政府内部持有；绝对额上升不等于债务/GDP 同步上升。",
  "1":
    "MTS 财年累计现金赤字按每年 10 月至次年 9 月累加，正值表示赤字。比较不同年份时要对齐相同财年月份；10 月重置不是财政状况突然改善。",
  "2":
    "MTS 财年累计收入和支出共用同一美元轴；两线距离对应图 2 的累计赤字。收入变化可受报税季影响，先比较同一财年月份，再到财政结构模板看税种和支出分项。",
  "3":
    "MTS 月度净利息支出与月赤字均为现金流、共用美元轴。观察利息是否持续上升，以及赤字波动是否由利息以外的收支推动；月赤字可受缴税时点影响，不能用单月外推全年。",
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
  // calc: 键由 derivedCalcs 生成，不进已选指标
  return series.filter((r) => !r.derived).map((r) => r.virtualKey);
}

function fiscalDerivedCalcs(series: readonly FiscalAnalysisSeriesDef[]) {
  return series.flatMap((r) =>
    r.derived
      ? [{ id: r.virtualKey.slice("calc:".length), name: r.displayName, ...r.derived }]
      : [],
  );
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
    derivedCalcs: fiscalDerivedCalcs(opts.series),
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
