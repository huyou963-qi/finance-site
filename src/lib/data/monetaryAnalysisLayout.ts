import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

/**
 * 美国货币政策与金融条件 — 内置双模板
 *
 * Spec: docs/specs/us-monetary-financial.spec.md
 * 数据: monetaryFredSeedCatalog.ts（12 条新 seed + 3 条复用，全部已入库）
 * 文档: docs/US_MONETARY_ANALYSIS.md / .cursor/prompts/us-monetary-analysis-framework.md
 */

export type MonetaryCalcOp = "yoy" | "none";

export type MonetaryAnalysisSeriesDef = {
  virtualKey: string;
  fredId: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calcOp: MonetaryCalcOp;
  /** 日/周频序列月均对齐（frequency: month + avg） */
  resampleToMonth?: boolean;
  /** 月频序列季度对齐（与季频序列同图时用，frequency: quarter + end） */
  resampleToQuarter?: boolean;
};

export function monetaryFredKey(fredId: string, variant?: string): string {
  if (!variant || variant === "level") return `fred:${fredId}`;
  return `fred:${fredId}::${variant}`;
}

function calcConfigFor(row: MonetaryAnalysisSeriesDef): MacroSeriesCalcConfig {
  if (row.calcOp === "yoy") {
    return {
      op: "yoy",
      frequency: row.resampleToQuarter ? "quarter" : "month",
      unit: "keep",
      resampleMethod: "end",
    };
  }
  if (row.resampleToMonth) {
    return { op: "none", frequency: "month", unit: "keep", resampleMethod: "avg" };
  }
  if (row.resampleToQuarter) {
    return { op: "none", frequency: "quarter", unit: "keep", resampleMethod: "end" };
  }
  return { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
}

export function buildMonetarySeriesCalcConfigMap(
  series: readonly MonetaryAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const row of series) {
    out[row.virtualKey] = calcConfigFor(row);
  }
  return out;
}

/** 模板 ①：货币政策 · 立场与流动性 */
export const MONETARY_OVERVIEW_SERIES: readonly MonetaryAnalysisSeriesDef[] = [
  {
    virtualKey: monetaryFredKey("EFFR", "avg"),
    fredId: "EFFR",
    displayName: "有效联邦基金利率（月均）",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("DGS2", "avg"),
    fredId: "DGS2",
    displayName: "2Y 国债收益率（月均）",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("DFII10", "avg"),
    fredId: "DFII10",
    displayName: "10Y TIPS 实际收益率（月均）",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("T10YIE", "avg"),
    fredId: "T10YIE",
    displayName: "10Y 盈亏平衡通胀（月均）",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("WALCL", "avg"),
    fredId: "WALCL",
    displayName: "联储总资产（百万美元，月均）",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("RRPONTSYD", "avg"),
    fredId: "RRPONTSYD",
    displayName: "ON RRP 余额（十亿美元，月均）",
    panel: 3,
    axis: "right",
    chartType: "dashedLine",
    color: "#8f9bab",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("DGS10", "avg"),
    fredId: "DGS10",
    displayName: "10Y 国债收益率（月均）",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("T10Y3M", "avg"),
    fredId: "T10Y3M",
    displayName: "10Y-3M 利差（月均）",
    panel: 4,
    axis: "right",
    chartType: "dashedLine",
    color: "#f4b165",
    calcOp: "none",
    resampleToMonth: true,
  },
];

/** 模板 ②：金融条件 · 信贷与压力 */
export const MONETARY_CONDITIONS_SERIES: readonly MonetaryAnalysisSeriesDef[] = [
  {
    virtualKey: monetaryFredKey("NFCI", "avg"),
    fredId: "NFCI",
    displayName: "NFCI 金融条件指数（月均）",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("BAMLH0A0HYM2", "avg"),
    fredId: "BAMLH0A0HYM2",
    displayName: "高收益债 OAS（月均）",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("BAMLC0A0CM", "avg"),
    fredId: "BAMLC0A0CM",
    displayName: "投资级公司债 OAS（月均）",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: monetaryFredKey("DRTSCILM", "level"),
    fredId: "DRTSCILM",
    displayName: "SLOOS 工商贷款收紧净比例",
    panel: 3,
    axis: "left",
    chartType: "bar",
    color: "#9da8b6",
    calcOp: "none",
  },
  {
    virtualKey: monetaryFredKey("BUSLOANS", "yoy"),
    fredId: "BUSLOANS",
    displayName: "工商业贷款同比（季末）",
    panel: 3,
    axis: "right",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "yoy",
    resampleToQuarter: true,
  },
  {
    virtualKey: monetaryFredKey("DRCCLACBS", "level"),
    fredId: "DRCCLACBS",
    displayName: "信用卡拖欠率",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
  },
  {
    virtualKey: monetaryFredKey("DRBLACBS", "level"),
    fredId: "DRBLACBS",
    displayName: "工商业贷款拖欠率",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "none",
  },
];

export const MONETARY_OVERVIEW_SLOT_TITLES: Record<number, string> = {
  0: "L1 政策利率：有效 vs 市场定价",
  1: "L2 实际利率分解：TIPS vs 预期",
  2: "L3 量的工具：联储资产 vs RRP",
  3: "L4 期限结构：10Y vs 10Y-3M",
};

export const MONETARY_CONDITIONS_SLOT_TITLES: Record<number, string> = {
  0: "L5 金融条件：NFCI",
  1: "L6 信用利差：HY vs IG",
  2: "L7 银行信贷：SLOOS vs 贷款增速",
  3: "L8 信用质量：拖欠率",
};

export const MONETARY_OVERVIEW_DESCRIPTION =
  "【第一步 · 政策立场】按图 1→4 回答：政策多紧？紧缩来自实际利率还是通胀预期？QT 与体系流动性到哪一步？曲线定价的衰退风险多大？判断传导是否到位 → 加载「金融条件 · 信贷与压力」。";

export const MONETARY_CONDITIONS_DESCRIPTION =
  "【第二步 · 传导确认】按图 1→4 追踪政策向金融体系与实体信贷的传导：综合条件 → 信用定价 → 银行信贷量价 → 拖欠损伤。与立场模板结论合并成「政策-传导」完整叙事。";

/** 按图位（slot 0–3）的分析思路，不逐指标展开 */
export const MONETARY_OVERVIEW_CHART_INTRO: Record<string, string> = {
  "0":
    "有效联邦基金利率 vs 2Y 收益率：2Y 是市场对未来 ~2 年政策路径的定价。2Y 低于 EFFR → 市场定价降息（紧缩尾声）；2Y 高于 EFFR → 定价继续加息。剪刀差的方向通常先于政策转向。",
  "1":
    "10Y 名义收益率 ≈ TIPS 实际收益率 + 盈亏平衡通胀。紧缩若由实际利率上行驱动（TIPS↑）→ 实质性压制估值与地产；若由盈亏平衡走高驱动 → 去通胀域模板找原因。实际利率 >2% 属历史限制区。",
  "2":
    "左轴联储总资产（百万美元）、右轴 ON RRP 余额（十亿美元）：QT 进行中总资产下行；RRP 是体系冗余流动性的「缓冲垫」，RRP 接近零后继续 QT 将直接消耗银行准备金 → 对照模板 ② 图 1 NFCI 是否同步收紧。",
  "3":
    "左轴 10Y 收益率、右轴 10Y-3M 利差（0 以下为倒挂）：10Y-3M 是 NY Fed 衰退概率模型核心输入。注意解除倒挂的方式——短端下行解除 = 降息临近；长端上行解除 = 再通胀/期限溢价回归。与经济 Overview 的 10Y-2Y 互相印证。",
};

export const MONETARY_CONDITIONS_CHART_INTRO: Record<string, string> = {
  "0":
    "NFCI：0 = 历史平均金融条件，>0 偏紧、<0 偏松。政策加息后 NFCI 若不升（股市走强、利差收窄对冲），说明传导被市场抵消，紧缩「不解渴」→ Fed 倾向更鹰。",
  "1":
    "高收益 vs 投资级 OAS：风险定价温度计。HY 单独走阔 = 尾部信用担忧；HY/IG 同步走阔 = 系统性避险（对照图 1 确认）。利差处于历史低位时警惕自满——对政策冲击最脆弱。",
  "2":
    "左轴 SLOOS 收紧净比例（季，柱）、右轴工商业贷款同比（季末对齐）：SLOOS 领先贷款增速约 2–4 个季度，收紧比例冲高预告未来信贷收缩；贷款同比转负历史上多伴随衰退。量价互证：SLOOS 紧 + 图 2 利差阔 = 传导到位。",
  "3":
    "信用卡 vs 工商业贷款拖欠率：紧缩的滞后损伤，周期最后确认。信用卡通常先于工商贷款恶化（居民端先受伤）；两者同升且图 3 贷款收缩 → 信用周期下行确认，政策转向压力最大。",
};

export function monetarySelectedKeys(
  series: readonly MonetaryAnalysisSeriesDef[],
): string[] {
  return series.map((r) => r.virtualKey);
}

export function buildMonetarySlotAssignment(
  series: readonly MonetaryAnalysisSeriesDef[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of series) {
    out[row.virtualKey] = row.panel - 1;
  }
  return out;
}

export function buildMonetaryVisualMap(
  series: readonly MonetaryAnalysisSeriesDef[],
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
  return out;
}

export function buildMonetaryBuiltinTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly MonetaryAnalysisSeriesDef[];
  slotTitles: Record<number, string>;
  createdAtIso?: string;
}): MacroChartTemplate {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    chartIntroNotes: { ...opts.chartIntroNotes },
    selectedKeys: monetarySelectedKeys(opts.series),
    layoutMode: 4,
    slotAssignment: buildMonetarySlotAssignment(opts.series),
    seriesVisualMap: buildMonetaryVisualMap(opts.series),
    seriesCalcConfigMap: buildMonetarySeriesCalcConfigMap(opts.series),
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
    createdAtIso: opts.createdAtIso ?? "2026-07-04T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-monetary",
  };
}

export const BUILTIN_US_MONETARY_OVERVIEW_TEMPLATE = buildMonetaryBuiltinTemplate({
  id: "builtin-us-monetary-overview",
  name: "货币政策 · 立场与流动性",
  description: MONETARY_OVERVIEW_DESCRIPTION,
  chartIntroNotes: MONETARY_OVERVIEW_CHART_INTRO,
  series: MONETARY_OVERVIEW_SERIES,
  slotTitles: MONETARY_OVERVIEW_SLOT_TITLES,
});

export const BUILTIN_US_MONETARY_CONDITIONS_TEMPLATE = buildMonetaryBuiltinTemplate({
  id: "builtin-us-monetary-conditions",
  name: "金融条件 · 信贷与压力",
  description: MONETARY_CONDITIONS_DESCRIPTION,
  chartIntroNotes: MONETARY_CONDITIONS_CHART_INTRO,
  series: MONETARY_CONDITIONS_SERIES,
  slotTitles: MONETARY_CONDITIONS_SLOT_TITLES,
});

/** 全部内置货币政策与金融条件模板（2 图组，按分析顺序） */
export const BUILTIN_US_MONETARY_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_MONETARY_OVERVIEW_TEMPLATE,
  BUILTIN_US_MONETARY_CONDITIONS_TEMPLATE,
];

export const BUILTIN_US_MONETARY_TEMPLATE_IDS = BUILTIN_US_MONETARY_TEMPLATES.map(
  (t) => t.id,
);

function buildMonetaryVirtualKeyLabelMap(): ReadonlyMap<string, string> {
  const allSeries = [...MONETARY_OVERVIEW_SERIES, ...MONETARY_CONDITIONS_SERIES];
  const m = new Map<string, string>();
  for (const row of allSeries) {
    m.set(row.virtualKey, row.displayName);
  }
  return m;
}

/** 货币模板虚拟键 → 中文显示名（已选指标列表、图例等） */
export const MONETARY_VIRTUAL_KEY_LABELS = buildMonetaryVirtualKeyLabelMap();
