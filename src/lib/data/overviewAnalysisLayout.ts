import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroDerivedCalc,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

export type OverviewCalcOp = "yoy" | "pctChange" | "diff" | "none";

export type OverviewAnalysisSeriesDef = {
  virtualKey: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calcOp: OverviewCalcOp;
  resampleToMonth?: boolean;
  roleId?: string;
  fredId?: string;
  mdsCode?: string;
};

export function overviewFredKey(fredId: string, variant?: string): string {
  if (!variant || variant === "level") return `fred:${fredId}`;
  return `fred:${fredId}::${variant}`;
}

export function overviewMdsKey(instrumentCode: string): string {
  return `mds:${instrumentCode}`;
}

function calcConfigFor(op: OverviewCalcOp, resampleToMonth?: boolean): MacroSeriesCalcConfig {
  if (op === "none") {
    return {
      op: "none",
      frequency: resampleToMonth ? "month" : "keep",
      unit: "keep",
      resampleMethod: "avg",
    };
  }
  return {
    op,
    frequency: "month",
    unit: "keep",
    resampleMethod: op === "diff" ? "end" : "end",
  };
}

export function buildOverviewSeriesCalcConfigMap(
  series: readonly OverviewAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const row of series) {
    out[row.virtualKey] = calcConfigFor(row.calcOp, row.resampleToMonth);
  }
  return out;
}

/** 模板 ①：经济 Overview · 总量与政策 */
export const OVERVIEW_SNAPSHOT_SERIES: readonly OverviewAnalysisSeriesDef[] = [
  {
    virtualKey: overviewFredKey("A191RL1Q225SBEA"),
    fredId: "A191RL1Q225SBEA",
    roleId: "us-gdp-saar",
    displayName: "实际 GDP 环比折年率",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#f1cd57",
    calcOp: "none",
  },
  {
    virtualKey: overviewFredKey("INDPRO", "yoy"),
    fredId: "INDPRO",
    roleId: "us-indpro-yoy",
    displayName: "工业生产 YoY",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#56b6c2",
    calcOp: "yoy",
  },
  {
    virtualKey: overviewFredKey("UNRATE"),
    fredId: "UNRATE",
    roleId: "us-unrate",
    displayName: "失业率",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#f2cf67",
    calcOp: "none",
  },
  {
    virtualKey: overviewFredKey("PAYEMS", "diff"),
    fredId: "PAYEMS",
    roleId: "us-nfp-change",
    displayName: "新增非农就业",
    panel: 2,
    axis: "left",
    chartType: "bar",
    color: "#9ea68b",
    calcOp: "diff",
  },
  {
    virtualKey: overviewFredKey("CPIAUCSL", "yoy"),
    fredId: "CPIAUCSL",
    roleId: "us-cpi-yoy",
    displayName: "CPI 同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "yoy",
  },
  {
    virtualKey: overviewFredKey("PCEPILFE", "yoy"),
    fredId: "PCEPILFE",
    roleId: "us-core-pce-yoy",
    displayName: "核心 PCE 同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#7fc8c5",
    calcOp: "yoy",
  },
  {
    virtualKey: overviewFredKey("DFEDTARU"),
    fredId: "DFEDTARU",
    roleId: "us-fed-target",
    displayName: "联邦基金目标利率",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#6f84c0",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: overviewFredKey("T10Y2Y", "avg"),
    fredId: "T10Y2Y",
    roleId: "us-10y2y",
    displayName: "10Y-2Y 利差",
    panel: 4,
    axis: "right",
    chartType: "dashedLine",
    color: "#d75a68",
    calcOp: "none",
    resampleToMonth: true,
  },
];

/** 模板 ②：经济 Overview · 支出法结构（C+I+G+NX，与 ① 零重复） */
export const OVERVIEW_DEMAND_SERIES: readonly OverviewAnalysisSeriesDef[] = [
  {
    virtualKey: overviewFredKey("PCEC96", "yoy"),
    fredId: "PCEC96",
    roleId: "us-pce-real-yoy",
    displayName: "实际个人消费支出 YoY",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "yoy",
  },
  {
    virtualKey: overviewFredKey("RSAFS", "yoy"),
    fredId: "RSAFS",
    roleId: "us-retail-yoy",
    displayName: "零售销售 YoY",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#f4b165",
    calcOp: "yoy",
  },
  {
    virtualKey: overviewFredKey("PNFIC1", "yoy"),
    fredId: "PNFIC1",
    roleId: "us-pfi-real-yoy",
    displayName: "实际私人固定投资 YoY",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "yoy",
  },
  {
    virtualKey: overviewFredKey("HOUST"),
    fredId: "HOUST",
    roleId: "us-houst",
    displayName: "新屋开工",
    panel: 2,
    axis: "right",
    chartType: "dashedLine",
    color: "#6ccad1",
    calcOp: "none",
  },
  {
    virtualKey: overviewFredKey("EXPGSC1", "yoy"),
    fredId: "EXPGSC1",
    roleId: "us-export-real-yoy",
    displayName: "实际出口 YoY",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#56b6c2",
    calcOp: "yoy",
  },
  {
    virtualKey: overviewFredKey("IMPGSC1", "yoy"),
    fredId: "IMPGSC1",
    roleId: "us-import-real-yoy",
    displayName: "实际进口 YoY",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "yoy",
  },
  {
    virtualKey: overviewFredKey("FYFSGDA188S"),
    fredId: "FYFSGDA188S",
    roleId: "us-federal-deficit-gdp",
    displayName: "联邦赤字/GDP %",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#9ea68b",
    calcOp: "none",
  },
  {
    virtualKey: overviewFredKey("GCEC1", "yoy"),
    fredId: "GCEC1",
    roleId: "us-gov-consumption-yoy",
    displayName: "实际政府消费 YoY",
    panel: 4,
    axis: "right",
    chartType: "dashedLine",
    color: "#6f84c0",
    calcOp: "yoy",
  },
];

export const OVERVIEW_SNAPSHOT_SLOT_TITLES: Record<number, string> = {
  0: "L1 增长：GDP vs 工业",
  1: "L3 就业：失业 vs 非农",
  2: "L4 通胀锚：CPI vs 核心 PCE",
  3: "L5 政策：目标利率 vs 曲线",
};

export const OVERVIEW_DEMAND_SLOT_TITLES: Record<number, string> = {
  0: "L2C 消费：PCE vs 零售",
  1: "L2I 投资：私人固投 vs 新屋开工",
  2: "L2X 外部：出口 vs 进口",
  3: "L2G 政府：赤字/GDP vs 政府消费",
};

export const OVERVIEW_SNAPSHOT_DESCRIPTION =
  "【第一步 · 通常够用】按图 1→4 看总量增长、就业、通胀锚与政策/曲线。写清 1–2 条主因即可。若需拆分消费/投资/政府/进出口 → 加载「经济 Overview · 支出法结构」。ISM 调查从目录自选 L2S。";

export const OVERVIEW_DEMAND_DESCRIPTION =
  "【第二步 · 按需】按 GDP 支出法看图 1→4：消费、投资、净出口（进出口增速）、政府（赤字/GDP + 政府消费）。与模板 ① 合并；**不重复** GDP/工业/失业。ISM → 目录自选。";

export const OVERVIEW_SNAPSHOT_CHART_INTRO: Record<string, string> = {
  "0":
    "GDP 环比折年率 + 工业生产 YoY：周期锚。若走弱 → 加载模板 ② 定位是 C/I/G/X 哪一侧拖累。",
  "1":
    "失业率 + 新增非农（PAYEMS 月差分）：劳动力松紧。工资细节 → 就业/ CPI 模板。",
  "2":
    "CPI YoY vs 核心 PCE YoY：相对 2% 偏离。分项结构 → CPI 模板。",
  "3":
    "联邦基金目标 + 10Y-2Y 利差：政策立场与衰退预警。",
};

export const OVERVIEW_DEMAND_CHART_INTRO: Record<string, string> = {
  "0":
    "实际 PCE YoY vs 零售 YoY：私人消费（C）。零售弱、PCE 稳 → 服务消费支撑；双弱 → 内需放缓。",
  "1":
    "私人固定投资 YoY + 新屋开工：投资（I）。固投弱、开工强 → 住宅链分化；双弱 → 资本开支周期下行。",
  "2":
    "出口 YoY vs 进口 YoY：外部部门（NX 分项）。进口强、出口弱 → 净出口拖累；双强 → 全球需求与美元因素需交叉解读。",
  "3":
    "联邦赤字/GDP % + 实际政府消费 YoY：政府（G）。赤字走阔 + 消费扩张 → 财政脉冲；赤字收窄 → 财政拖累。",
};

/** L2S 调查：不进默认模板，供目录自选 */
export const OVERVIEW_OPTIONAL_ISM_SERIES: readonly OverviewAnalysisSeriesDef[] = [
  {
    virtualKey: overviewMdsKey("ism_us_ism_headline"),
    mdsCode: "ism_us_ism_headline",
    roleId: "us-ism-mfg-pmi",
    displayName: "ISM 制造业 PMI",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#56b6c2",
    calcOp: "none",
  },
  {
    virtualKey: overviewMdsKey("ism_svc_us_svc_headline"),
    mdsCode: "ism_svc_us_svc_headline",
    roleId: "us-ism-nm-pmi",
    displayName: "ISM 非制造业 PMI",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "none",
  },
];

function overviewSelectedKeys(
  series: readonly OverviewAnalysisSeriesDef[],
  derived?: MacroDerivedCalc[],
): string[] {
  const keys = series.map((r) => r.virtualKey);
  if (derived?.length) {
    for (const d of derived) keys.push(`calc:${d.id}`);
  }
  return keys;
}

function buildOverviewSlotAssignment(
  series: readonly OverviewAnalysisSeriesDef[],
  derived?: MacroDerivedCalc[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of series) {
    out[row.virtualKey] = row.panel - 1;
  }
  if (derived?.length) {
    for (const d of derived) out[`calc:${d.id}`] = 3;
  }
  return out;
}

function buildOverviewVisualMap(
  series: readonly OverviewAnalysisSeriesDef[],
  derived?: MacroDerivedCalc[],
): Record<
  string,
  {
    axis: "left" | "right";
    chartType: MacroSeriesChartType;
    color: string;
    showEndLabel: boolean;
  }
> {
  const out: Record<
    string,
    {
      axis: "left" | "right";
      chartType: MacroSeriesChartType;
      color: string;
      showEndLabel: boolean;
    }
  > = {};
  for (const row of series) {
    out[row.virtualKey] = {
      axis: row.axis,
      chartType: row.chartType,
      color: row.color,
      showEndLabel: true,
    };
  }
  if (derived?.length) {
    for (const d of derived) {
      out[`calc:${d.id}`] = {
        axis: "left",
        chartType: "line",
        color: "#c9a227",
        showEndLabel: true,
      };
    }
  }
  return out;
}

export function buildOverviewBuiltinTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly OverviewAnalysisSeriesDef[];
  slotTitles: Record<number, string>;
  derivedCalcs?: MacroDerivedCalc[];
  createdAtIso?: string;
}): MacroChartTemplate {
  const derived = opts.derivedCalcs ?? [];
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    chartIntroNotes: { ...opts.chartIntroNotes },
    selectedKeys: overviewSelectedKeys(opts.series, derived),
    layoutMode: 4,
    slotAssignment: buildOverviewSlotAssignment(opts.series, derived),
    seriesVisualMap: buildOverviewVisualMap(opts.series, derived),
    seriesCalcConfigMap: buildOverviewSeriesCalcConfigMap(opts.series),
    derivedCalcs: derived.length > 0 ? derived : undefined,
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
    createdAtIso: opts.createdAtIso ?? "2026-06-19T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-economy",
  };
}

export const BUILTIN_US_ECON_OVERVIEW_TEMPLATE = buildOverviewBuiltinTemplate({
  id: "builtin-us-econ-overview",
  name: "经济 Overview · 总量与政策",
  description: OVERVIEW_SNAPSHOT_DESCRIPTION,
  chartIntroNotes: OVERVIEW_SNAPSHOT_CHART_INTRO,
  series: OVERVIEW_SNAPSHOT_SERIES,
  slotTitles: OVERVIEW_SNAPSHOT_SLOT_TITLES,
});

export const BUILTIN_US_ECON_DEMAND_TEMPLATE = buildOverviewBuiltinTemplate({
  id: "builtin-us-econ-demand",
  name: "经济 Overview · 支出法结构",
  description: OVERVIEW_DEMAND_DESCRIPTION,
  chartIntroNotes: OVERVIEW_DEMAND_CHART_INTRO,
  series: OVERVIEW_DEMAND_SERIES,
  slotTitles: OVERVIEW_DEMAND_SLOT_TITLES,
});

export const BUILTIN_US_ECON_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_ECON_OVERVIEW_TEMPLATE,
  BUILTIN_US_ECON_DEMAND_TEMPLATE,
];

export const BUILTIN_US_ECON_TEMPLATE_IDS = BUILTIN_US_ECON_TEMPLATES.map((t) => t.id);

function buildOverviewVirtualKeyLabelMap(): ReadonlyMap<string, string> {
  const allSeries = [
    ...OVERVIEW_SNAPSHOT_SERIES,
    ...OVERVIEW_DEMAND_SERIES,
    ...OVERVIEW_OPTIONAL_ISM_SERIES,
  ];
  const m = new Map<string, string>();
  for (const row of allSeries) {
    m.set(row.virtualKey, row.displayName);
  }
  return m;
}

export const OVERVIEW_VIRTUAL_KEY_LABELS = buildOverviewVirtualKeyLabelMap();
