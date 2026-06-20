import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroDerivedCalc,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

export type CpiCalcOp = "yoy" | "pctChange" | "none";

export type CpiAnalysisSeriesDef = {
  virtualKey: string;
  fredId: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calcOp: CpiCalcOp;
  resampleToMonth?: boolean;
};

export function cpiFredKey(fredId: string, variant?: string): string {
  if (!variant || variant === "level") return `fred:${fredId}`;
  return `fred:${fredId}::${variant}`;
}

function calcConfigFor(op: CpiCalcOp, resampleToMonth?: boolean): MacroSeriesCalcConfig {
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

export function buildCpiSeriesCalcConfigMap(
  series: readonly CpiAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const row of series) {
    out[row.virtualKey] = calcConfigFor(row.calcOp, row.resampleToMonth);
  }
  return out;
}

/** 模板 ①：CPI 诊断 · 总览（合并原 L0–L3，每指标只出现一次） */
export const CPI_OVERVIEW_SERIES: readonly CpiAnalysisSeriesDef[] = [
  {
    virtualKey: cpiFredKey("CPIAUCSL", "yoy"),
    fredId: "CPIAUCSL",
    displayName: "CPI（全部城市消费者）同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "yoy",
  },
  {
    virtualKey: cpiFredKey("CPILFESL", "yoy"),
    fredId: "CPILFESL",
    displayName: "核心 CPI 同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "yoy",
  },
  {
    virtualKey: cpiFredKey("CPIENGSL", "yoy"),
    fredId: "CPIENGSL",
    displayName: "CPI 能源 同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#8f9bab",
    calcOp: "yoy",
  },
  {
    virtualKey: cpiFredKey("CPIFABSL", "yoy"),
    fredId: "CPIFABSL",
    displayName: "CPI 食品与饮料 同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "yoy",
  },
  {
    virtualKey: cpiFredKey("CUSR0000SEHC", "yoy"),
    fredId: "CUSR0000SEHC",
    displayName: "CPI 业主等价租金（OER）同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "yoy",
  },
  {
    virtualKey: cpiFredKey("CUSR0000SACL1E", "yoy"),
    fredId: "CUSR0000SACL1E",
    displayName: "CPI 核心商品 同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#f4b165",
    calcOp: "yoy",
  },
  {
    virtualKey: cpiFredKey("CUSR0000SASLE", "yoy"),
    fredId: "CUSR0000SASLE",
    displayName: "CPI 核心服务 同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "yoy",
  },
  {
    virtualKey: cpiFredKey("CPIAUCSL", "mom"),
    fredId: "CPIAUCSL",
    displayName: "CPI（全部城市消费者）环比",
    panel: 4,
    axis: "left",
    chartType: "bar",
    color: "#ef6461",
    calcOp: "pctChange",
  },
  {
    virtualKey: cpiFredKey("CPILFESL", "mom"),
    fredId: "CPILFESL",
    displayName: "核心 CPI 环比",
    panel: 4,
    axis: "left",
    chartType: "bar",
    color: "#5f76b8",
    calcOp: "pctChange",
  },
];

/** 模板 ②：CPI 驱动 · 外生与政策（合并原 L4，不重复 Headline/Core） */
export const CPI_DRIVERS_SERIES: readonly CpiAnalysisSeriesDef[] = [
  {
    virtualKey: cpiFredKey("DCOILWTICO", "avg"),
    fredId: "DCOILWTICO",
    displayName: "WTI 原油现货（月均）",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: cpiFredKey("PPIFIS", "yoy"),
    fredId: "PPIFIS",
    displayName: "PPI 最终需求 同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "yoy",
  },
  {
    virtualKey: cpiFredKey("UNRATE", "level"),
    fredId: "UNRATE",
    displayName: "失业率",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#9da8b6",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: cpiFredKey("CES0500000003", "yoy"),
    fredId: "CES0500000003",
    displayName: "平均时薪 同比",
    panel: 3,
    axis: "right",
    chartType: "dashedLine",
    color: "#f4b165",
    calcOp: "yoy",
  },
  {
    virtualKey: cpiFredKey("T5YIE", "avg"),
    fredId: "T5YIE",
    displayName: "5Y 盈亏平衡通胀（月均）",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: cpiFredKey("PCEPILFE", "yoy"),
    fredId: "PCEPILFE",
    displayName: "核心 PCE 同比",
    panel: 4,
    axis: "right",
    chartType: "dashedLine",
    color: "#d89b4e",
    calcOp: "yoy",
  },
];

export const CPI_OVERVIEW_SLOT_TITLES: Record<number, string> = {
  0: "总水平：Headline vs Core",
  1: "边缘冲击：能源 vs 食品",
  2: "结构：OER vs 商品 vs 服务",
  3: "发布月动能：环比",
};

export const CPI_DRIVERS_SLOT_TITLES: Record<number, string> = {
  0: "供给：WTI 油价",
  1: "上游：PPI 最终需求",
  2: "劳动力：失业 vs 时薪",
  3: "政策锚：预期 vs 核心 PCE",
};

export const CPI_OVERVIEW_DESCRIPTION =
  "【第一步 · 通常够用】按图 1→4 回答：总通胀多高？差在能源/食品还是核心？粘性在 OER、商品还是服务？发布月补看环比。写清 1–2 条主因即可；若要追油价/PPI/工资/预期 → 加载「CPI 驱动 · 外生与政策」。";

export const CPI_DRIVERS_DESCRIPTION =
  "【第二步 · 按需】不重复 Headline/Core。按图 1→4 串联供给 → 上游 → 劳动力 → 政策锚，与总览结论合并成最终叙事。";

/** 按图位（slot 0–3）的分析思路，不再逐指标展开 */
export const CPI_OVERVIEW_CHART_INTRO: Record<string, string> = {
  "0":
    "对比 Headline 与 Core 同比：看谁更高、剪刀差是否在扩大。Headline 明显高于 Core → 看图 2 能源/食品；两者走势接近 → 直接看图 3 找结构性粘性。",
  "1":
    "能源与食品同比：解释 Headline−Core 差来自哪一侧。两项同向走强时差通常扩大；若本图已回落而图 1 仍偏高 → 核心粘性在图 3。",
  "2":
    "OER、核心商品、核心服务三条 YoY：Core 仍偏高时定位粘性来源。OER 显著高于商品/服务 → 住房拖累去通胀；商品反弹而服务仍高 → 商品周期；服务顽固偏高 → 加载驱动模板看图 3 劳动力。",
  "3":
    "发布月看 Headline/Core 环比（季调柱）。Core 环比连续 >0.3% 暗示去通胀放缓；Headline 极端值多来自能源。本图补「当月动能」，不重复 YoY 结论。",
};

export const CPI_DRIVERS_CHART_INTRO: Record<string, string> = {
  "0":
    "WTI 月均：通常领先 CPI 能源 1–2 个月。对照总览图 2 能源同比，判断后续 Headline 是否还有能源冲击。",
  "1":
    "PPI 最终需求同比：上游成本，常领先 CPI 核心商品 1–3 个月。PPI 走强且总览图 3 商品反弹 → 成本传导风险上升。",
  "2":
    "左轴失业率（水平 %）、右轴平均时薪同比：看劳动力松紧与工资压力。低失业 + 高时薪 → 核心服务通胀有支撑；与总览图 3 Core services 联动。",
  "3":
    "左轴 5Y 盈亏平衡通胀（月均）、右轴核心 PCE 同比：市场隐含通胀 vs Fed 锚。PCE 已降而 T5YIE 仍高 → 预期未锚定；二者趋同 → 政策路径更顺。",
};

export function cpiSelectedKeys(
  series: readonly CpiAnalysisSeriesDef[],
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

export function buildCpiSlotAssignment(
  series: readonly CpiAnalysisSeriesDef[],
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

export function buildCpiVisualMap(
  series: readonly CpiAnalysisSeriesDef[],
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

export function buildCpiFullCalcConfigMap(
  series: readonly CpiAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  return buildCpiSeriesCalcConfigMap(series);
}

export function buildCpiDefaultChartIntroNotes(
  chartIntro: Record<string, string>,
): Record<string, string> {
  return { ...chartIntro };
}

export function buildCpiBuiltinTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly CpiAnalysisSeriesDef[];
  slotTitles: Record<number, string>;
  derivedCalcs?: MacroDerivedCalc[];
  createdAtIso?: string;
}): MacroChartTemplate {
  const derived = opts.derivedCalcs ?? [];
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    chartIntroNotes: buildCpiDefaultChartIntroNotes(opts.chartIntroNotes),
    selectedKeys: cpiSelectedKeys(opts.series, derived),
    layoutMode: 4,
    slotAssignment: buildCpiSlotAssignment(opts.series, derived),
    seriesVisualMap: buildCpiVisualMap(opts.series, derived),
    seriesCalcConfigMap: buildCpiFullCalcConfigMap(opts.series),
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
    createdAtIso: opts.createdAtIso ?? "2026-06-07T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-cpi",
  };
}

export const BUILTIN_US_CPI_OVERVIEW_TEMPLATE = buildCpiBuiltinTemplate({
  id: "builtin-us-cpi-overview",
  name: "CPI 诊断 · 总览",
  description: CPI_OVERVIEW_DESCRIPTION,
  chartIntroNotes: CPI_OVERVIEW_CHART_INTRO,
  series: CPI_OVERVIEW_SERIES,
  slotTitles: CPI_OVERVIEW_SLOT_TITLES,
});

export const BUILTIN_US_CPI_DRIVERS_TEMPLATE = buildCpiBuiltinTemplate({
  id: "builtin-us-cpi-drivers",
  name: "CPI 驱动 · 外生与政策",
  description: CPI_DRIVERS_DESCRIPTION,
  chartIntroNotes: CPI_DRIVERS_CHART_INTRO,
  series: CPI_DRIVERS_SERIES,
  slotTitles: CPI_DRIVERS_SLOT_TITLES,
});

/** 全部内置 CPI 模板（2 图组，按分析顺序） */
export const BUILTIN_US_CPI_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_CPI_OVERVIEW_TEMPLATE,
  BUILTIN_US_CPI_DRIVERS_TEMPLATE,
];

export const BUILTIN_US_CPI_TEMPLATE_IDS = BUILTIN_US_CPI_TEMPLATES.map((t) => t.id);

function buildCpiVirtualKeyLabelMap(): ReadonlyMap<string, string> {
  const allSeries = [...CPI_OVERVIEW_SERIES, ...CPI_DRIVERS_SERIES];
  const m = new Map<string, string>();
  for (const row of allSeries) {
    m.set(row.virtualKey, row.displayName);
  }
  return m;
}

/** CPI 模板虚拟键 → 中文显示名（已选指标列表、图例等） */
export const CPI_VIRTUAL_KEY_LABELS = buildCpiVirtualKeyLabelMap();
