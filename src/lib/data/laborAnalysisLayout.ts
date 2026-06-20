import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroDerivedCalc,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

export type LaborCalcOp = "yoy" | "pctChange" | "none";

export type LaborAnalysisSeriesDef = {
  virtualKey: string;
  fredId: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calcOp: LaborCalcOp;
  resampleToMonth?: boolean;
};

export function laborFredKey(fredId: string, variant?: string): string {
  if (!variant || variant === "level") return `fred:${fredId}`;
  return `fred:${fredId}::${variant}`;
}

function calcConfigFor(op: LaborCalcOp, resampleToMonth?: boolean): MacroSeriesCalcConfig {
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
    resampleMethod: "end",
  };
}

export function buildLaborSeriesCalcConfigMap(
  series: readonly LaborAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const row of series) {
    out[row.virtualKey] = calcConfigFor(row.calcOp, row.resampleToMonth);
  }
  return out;
}

/** 模板 ①：就业诊断 · 总览 */
export const LABOR_OVERVIEW_SERIES: readonly LaborAnalysisSeriesDef[] = [
  {
    virtualKey: laborFredKey("UNRATE", "level"),
    fredId: "UNRATE",
    displayName: "失业率（U-3）",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
  },
  {
    virtualKey: laborFredKey("U6RATE", "level"),
    fredId: "U6RATE",
    displayName: "U-6 广义失业率",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "none",
  },
  {
    virtualKey: laborFredKey("PAYEMS", "mom"),
    fredId: "PAYEMS",
    displayName: "非农就业 环比",
    panel: 2,
    axis: "left",
    chartType: "bar",
    color: "#5f76b8",
    calcOp: "pctChange",
  },
  {
    virtualKey: laborFredKey("CIVPART", "level"),
    fredId: "CIVPART",
    displayName: "劳动参与率",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "none",
  },
  {
    virtualKey: laborFredKey("LNS11300060", "level"),
    fredId: "LNS11300060",
    displayName: "25–54 岁劳动参与率",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "none",
  },
  {
    virtualKey: laborFredKey("CES0500000003", "yoy"),
    fredId: "CES0500000003",
    displayName: "平均时薪 同比",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#f4b165",
    calcOp: "yoy",
  },
];

/** 模板 ②：就业驱动 · 流动与领先 */
export const LABOR_DRIVERS_SERIES: readonly LaborAnalysisSeriesDef[] = [
  {
    virtualKey: laborFredKey("JTSJOR", "level"),
    fredId: "JTSJOR",
    displayName: "岗位空缺率",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "none",
  },
  {
    virtualKey: laborFredKey("JTSQUR", "tight"),
    fredId: "JTSQUR",
    displayName: "离职率",
    panel: 1,
    axis: "right",
    chartType: "dashedLine",
    color: "#c9a227",
    calcOp: "none",
  },
  {
    virtualKey: laborFredKey("JTSHIR", "level"),
    fredId: "JTSHIR",
    displayName: "雇佣率",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "none",
  },
  {
    virtualKey: laborFredKey("JTSQUR", "flow"),
    fredId: "JTSQUR",
    displayName: "离职率",
    panel: 2,
    axis: "right",
    chartType: "dashedLine",
    color: "#c9a227",
    calcOp: "none",
  },
  {
    virtualKey: laborFredKey("ICSA", "avg"),
    fredId: "ICSA",
    displayName: "初请失业金（月均）",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#8f9bab",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: laborFredKey("UEMPMEAN", "level"),
    fredId: "UEMPMEAN",
    displayName: "平均失业周数",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
  },
  {
    virtualKey: laborFredKey("AWHNONAG", "level"),
    fredId: "AWHNONAG",
    displayName: "平均周工时",
    panel: 4,
    axis: "right",
    chartType: "dashedLine",
    color: "#6ccad1",
    calcOp: "none",
  },
];

export const LABOR_OVERVIEW_SLOT_TITLES: Record<number, string> = {
  0: "松紧：U-3 vs U-6",
  1: "动能：非农环比",
  2: "供给：参与率",
  3: "工资：时薪同比",
};

export const LABOR_DRIVERS_SLOT_TITLES: Record<number, string> = {
  0: "紧张度：空缺 vs 离职",
  1: "流动：雇佣 vs 离职",
  2: "领先：初请失业金",
  3: "深度：久期 vs 工时",
};

export const LABOR_OVERVIEW_DESCRIPTION =
  "【第一步 · 通常够用】按图 1→4 回答：劳动力偏紧还是偏松？新增就业强不强？参与率是否释放供给？工资压力多大？就业报告月写清 1–2 条即可；若要看空缺/离职/初请 → 加载「就业驱动 · 流动与领先」。";

export const LABOR_DRIVERS_DESCRIPTION =
  "【第二步 · 按需】不重复 U-3/非农/参与率/时薪。图 1–2 看 JOLTS 紧张与流动，图 3 初请领先，图 4 失业久期与工时。与模板 ① 合并成劳动力叙事。";

export const LABOR_OVERVIEW_CHART_INTRO: Record<string, string> = {
  "0":
    "U-3 vs U-6：看谁更高、差是否扩大。U-6 明显更高 → 广义 slack 大，勿只看 U-3。",
  "1":
    "非农环比 %：就业报告月核心。连续走弱而 U-3 仍低 → 看图 3 供给或加载模板 ② 看空缺。",
  "2":
    "总参与率 vs prime-age：prime-age 升而总参与 flat → 人口结构；两者同升 → 供给增加、工资压力或缓和。",
  "3":
    "时薪 YoY：与 CPI 驱动模板衔接。仍 >4% 且图 1 紧 → 政策敏感；环比弱而 YoY 高 → 基数效应。",
};

export const LABOR_DRIVERS_CHART_INTRO: Record<string, string> = {
  "0":
    "岗位空缺率 vs 离职率：双高 → 偏紧；空缺降、离职降 → 冷却且工人不敢跳。",
  "1":
    "雇佣率 vs 离职率：雇佣跟上离职 → 健康流动；两者同降 → 流动冻结。",
  "2":
    "初请月均：领先裁员。升而 U-3 未反应 → 关注下月就业报告；对照模板 ① 图 2 非农环比。",
  "3":
    "失业周数升 + 工时降 → 深度 slack；工时单独降或为 hoarding。",
};

export function laborSelectedKeys(
  series: readonly LaborAnalysisSeriesDef[],
  derived?: MacroDerivedCalc[],
): string[] {
  const keys = series.map((r) => r.virtualKey);
  if (derived?.length) {
    for (const d of derived) {
      keys.push(`calc:${d.id}`);
    }
  }
  return keys;
}

export function buildLaborSlotAssignment(
  series: readonly LaborAnalysisSeriesDef[],
  derived?: MacroDerivedCalc[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of series) {
    out[row.virtualKey] = row.panel - 1;
  }
  if (derived?.length) {
    for (const d of derived) {
      out[`calc:${d.id}`] = 3;
    }
  }
  return out;
}

export function buildLaborVisualMap(
  series: readonly LaborAnalysisSeriesDef[],
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

export function buildLaborFullCalcConfigMap(
  series: readonly LaborAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  return buildLaborSeriesCalcConfigMap(series);
}

export function buildLaborBuiltinTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly LaborAnalysisSeriesDef[];
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
    selectedKeys: laborSelectedKeys(opts.series, derived),
    layoutMode: 4,
    slotAssignment: buildLaborSlotAssignment(opts.series, derived),
    seriesVisualMap: buildLaborVisualMap(opts.series, derived),
    seriesCalcConfigMap: buildLaborFullCalcConfigMap(opts.series),
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
    folderId: "folder-builtin-us-labor",
  };
}

export const BUILTIN_US_LABOR_OVERVIEW_TEMPLATE = buildLaborBuiltinTemplate({
  id: "builtin-us-labor-overview",
  name: "就业诊断 · 总览",
  description: LABOR_OVERVIEW_DESCRIPTION,
  chartIntroNotes: LABOR_OVERVIEW_CHART_INTRO,
  series: LABOR_OVERVIEW_SERIES,
  slotTitles: LABOR_OVERVIEW_SLOT_TITLES,
});

export const BUILTIN_US_LABOR_DRIVERS_TEMPLATE = buildLaborBuiltinTemplate({
  id: "builtin-us-labor-drivers",
  name: "就业驱动 · 流动与领先",
  description: LABOR_DRIVERS_DESCRIPTION,
  chartIntroNotes: LABOR_DRIVERS_CHART_INTRO,
  series: LABOR_DRIVERS_SERIES,
  slotTitles: LABOR_DRIVERS_SLOT_TITLES,
});

export const BUILTIN_US_LABOR_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_LABOR_OVERVIEW_TEMPLATE,
  BUILTIN_US_LABOR_DRIVERS_TEMPLATE,
];

export const BUILTIN_US_LABOR_TEMPLATE_IDS = BUILTIN_US_LABOR_TEMPLATES.map((t) => t.id);

function buildLaborVirtualKeyLabelMap(): ReadonlyMap<string, string> {
  const allSeries = [...LABOR_OVERVIEW_SERIES, ...LABOR_DRIVERS_SERIES];
  const m = new Map<string, string>();
  for (const row of allSeries) {
    m.set(row.virtualKey, row.displayName);
  }
  return m;
}

export const LABOR_VIRTUAL_KEY_LABELS = buildLaborVirtualKeyLabelMap();
