import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

/**
 * 美国住房与地产 — 内置双模板
 *
 * Spec: docs/specs/us-housing.spec.md
 * 数据: housingFredSeedCatalog.ts（10 条新 seed + 1 条复用 CSUSHPINSA）
 * 注：EXHOSLUSM495S（成屋销售）因 NAR 许可，FRED 仅回约 1 年（13 期），
 *     已入库并持续累积，但暂不进默认模板（数据充足后再纳入）。
 */

export type HousingCalcOp = "yoy" | "none";

export type HousingAnalysisSeriesDef = {
  virtualKey: string;
  fredId: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calcOp: HousingCalcOp;
  /** 周频序列月均对齐（frequency: month + avg） */
  resampleToMonth?: boolean;
};

export function housingFredKey(fredId: string, variant?: string): string {
  if (!variant || variant === "level") return `fred:${fredId}`;
  return `fred:${fredId}::${variant}`;
}

function calcConfigFor(row: HousingAnalysisSeriesDef): MacroSeriesCalcConfig {
  if (row.calcOp === "yoy") {
    return { op: "yoy", frequency: "month", unit: "keep", resampleMethod: "end" };
  }
  if (row.resampleToMonth) {
    return { op: "none", frequency: "month", unit: "keep", resampleMethod: "avg" };
  }
  return { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
}

export function buildHousingSeriesCalcConfigMap(
  series: readonly HousingAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const row of series) out[row.virtualKey] = calcConfigFor(row);
  return out;
}

/** 模板 ①：住房 · 供需与景气（量端） */
export const HOUSING_ACTIVITY_SERIES: readonly HousingAnalysisSeriesDef[] = [
  {
    virtualKey: housingFredKey("PERMIT", "yoy"),
    fredId: "PERMIT",
    displayName: "建筑许可 同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "yoy",
  },
  {
    virtualKey: housingFredKey("HOUST1F", "yoy"),
    fredId: "HOUST1F",
    displayName: "单户新屋开工 同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "yoy",
  },
  {
    virtualKey: housingFredKey("HSN1F", "yoy"),
    fredId: "HSN1F",
    displayName: "新屋销售 同比",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "yoy",
  },
  {
    virtualKey: housingFredKey("MSACSR", "level"),
    fredId: "MSACSR",
    displayName: "新屋可售月数",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "none",
  },
  {
    virtualKey: housingFredKey("COMPUTSA", "yoy"),
    fredId: "COMPUTSA",
    displayName: "住房完工 同比",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "yoy",
  },
];

/** 模板 ②：住房 · 价格与融资（价端） */
export const HOUSING_PRICE_FINANCE_SERIES: readonly HousingAnalysisSeriesDef[] = [
  {
    virtualKey: housingFredKey("CSUSHPINSA", "yoy"),
    fredId: "CSUSHPINSA",
    displayName: "Case-Shiller 全国房价 同比",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "yoy",
  },
  {
    virtualKey: housingFredKey("MORTGAGE30US", "avg"),
    fredId: "MORTGAGE30US",
    displayName: "30Y 抵押利率（月均）",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: housingFredKey("MORTGAGE15US", "avg"),
    fredId: "MORTGAGE15US",
    displayName: "15Y 抵押利率（月均）",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: housingFredKey("RHORUSQ156N", "level"),
    fredId: "RHORUSQ156N",
    displayName: "自有住房率",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "none",
  },
  {
    virtualKey: housingFredKey("DRSFRMACBS", "level"),
    fredId: "DRSFRMACBS",
    displayName: "单户住宅抵押贷款拖欠率",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "none",
  },
];

export const HOUSING_ACTIVITY_SLOT_TITLES: Record<number, string> = {
  0: "L1 领先：许可 vs 单户开工",
  1: "L2 销售：新屋销售",
  2: "L3 库存：新屋可售月数",
  3: "L4 完工：住房完工",
};

export const HOUSING_PRICE_FINANCE_SLOT_TITLES: Record<number, string> = {
  0: "L5 房价：Case-Shiller",
  1: "L6 融资：30Y vs 15Y 抵押利率",
  2: "L7 自有住房率",
  3: "L8 信用：单户抵押贷款拖欠率",
};

export const HOUSING_ACTIVITY_DESCRIPTION =
  "【第一步 · 量端】按图 1→4 走地产链：许可/开工（领先）→ 新屋销售 → 库存月数 → 完工。判断周期在扩张/见顶/收缩哪一段 → 加载「住房 · 价格与融资」看价与利率。";

export const HOUSING_PRICE_FINANCE_DESCRIPTION =
  "【第二步 · 价端】按图 1→4 走价与融资：Case-Shiller 房价 → 抵押利率 → 自有率 → 单户抵押拖欠率。回答利率压制强度与信用风险，与量端合并成完整地产判断。";

/** 按图位（slot 0–3）的分析思路，不逐指标展开 */
export const HOUSING_ACTIVITY_CHART_INTRO: Record<string, string> = {
  "0":
    "建筑许可领先开工约 1–2 月、领先房价与 GDP 2–4 季度。许可同比转负 = 周期见顶最早信号；与单户开工背离时以许可为准。",
  "1":
    "新屋销售（Census，领先、利率最敏感）同比：购房需求的前哨。销售同比先反弹/先转弱，指示后续开工与房价方向。",
  "2":
    "新屋可售月数：<4 供不应求（支撑房价与新开工），>6 过剩（压价、去库存）。库存月数跳升常先于开工下滑。",
  "3":
    "住房完工同比：滞后开工约 6–12 月，反映在建产能释放。完工高位而图 2 销售转弱 → 短期供给压力、利空房价。",
};

export const HOUSING_PRICE_FINANCE_CHART_INTRO: Record<string, string> = {
  "0":
    "Case-Shiller 全国房价同比：地产财富效应与 CPI 住房（滞后 12–18 月）的领先量。同比转负历史少见，是深度调整信号。",
  "1":
    "30Y/15Y 抵押利率（月均）：购房月供核心。利率↑压制需求（对照 ① 图 2 新屋销售）；30Y-15Y 利差反映期限与风险偏好。",
  "2":
    "自有住房率：结构性需求与可负担性。利率高企 + 房价高 → 自有率见顶回落、租房需求上升。",
  "3":
    "单户住宅抵押贷款拖欠率：信用质量、周期最后确认。与货币域信用卡/工商拖欠对照，抬头 = 地产信用周期下行。",
};

export function housingSelectedKeys(series: readonly HousingAnalysisSeriesDef[]): string[] {
  return series.map((r) => r.virtualKey);
}

export function buildHousingSlotAssignment(
  series: readonly HousingAnalysisSeriesDef[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of series) out[row.virtualKey] = row.panel - 1;
  return out;
}

export function buildHousingVisualMap(series: readonly HousingAnalysisSeriesDef[]): Record<
  string,
  { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string; showEndLabel: boolean }
> {
  const out: Record<
    string,
    { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string; showEndLabel: boolean }
  > = {};
  for (const row of series) {
    out[row.virtualKey] = { axis: row.axis, chartType: row.chartType, color: row.color, showEndLabel: true };
  }
  return out;
}

export function buildHousingBuiltinTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly HousingAnalysisSeriesDef[];
  slotTitles: Record<number, string>;
  createdAtIso?: string;
}): MacroChartTemplate {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    chartIntroNotes: { ...opts.chartIntroNotes },
    selectedKeys: housingSelectedKeys(opts.series),
    layoutMode: 4,
    slotAssignment: buildHousingSlotAssignment(opts.series),
    seriesVisualMap: buildHousingVisualMap(opts.series),
    seriesCalcConfigMap: buildHousingSeriesCalcConfigMap(opts.series),
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
    createdAtIso: opts.createdAtIso ?? "2026-07-05T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-housing",
  };
}

export const BUILTIN_US_HOUSING_ACTIVITY_TEMPLATE = buildHousingBuiltinTemplate({
  id: "builtin-us-housing-activity",
  name: "住房 · 供需与景气",
  description: HOUSING_ACTIVITY_DESCRIPTION,
  chartIntroNotes: HOUSING_ACTIVITY_CHART_INTRO,
  series: HOUSING_ACTIVITY_SERIES,
  slotTitles: HOUSING_ACTIVITY_SLOT_TITLES,
});

export const BUILTIN_US_HOUSING_PRICE_FINANCE_TEMPLATE = buildHousingBuiltinTemplate({
  id: "builtin-us-housing-price-finance",
  name: "住房 · 价格与融资",
  description: HOUSING_PRICE_FINANCE_DESCRIPTION,
  chartIntroNotes: HOUSING_PRICE_FINANCE_CHART_INTRO,
  series: HOUSING_PRICE_FINANCE_SERIES,
  slotTitles: HOUSING_PRICE_FINANCE_SLOT_TITLES,
});

export const BUILTIN_US_HOUSING_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_HOUSING_ACTIVITY_TEMPLATE,
  BUILTIN_US_HOUSING_PRICE_FINANCE_TEMPLATE,
];

export const BUILTIN_US_HOUSING_TEMPLATE_IDS = BUILTIN_US_HOUSING_TEMPLATES.map((t) => t.id);

function buildHousingVirtualKeyLabelMap(): ReadonlyMap<string, string> {
  const all = [...HOUSING_ACTIVITY_SERIES, ...HOUSING_PRICE_FINANCE_SERIES];
  const m = new Map<string, string>();
  for (const row of all) m.set(row.virtualKey, row.displayName);
  return m;
}

/** 住房模板虚拟键 → 中文显示名 */
export const HOUSING_VIRTUAL_KEY_LABELS = buildHousingVirtualKeyLabelMap();
