import type { MacroChartTemplate } from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";
import { MACRO_REGIME_SERIES } from "@/lib/data/macroRegimeBands";

export const BUILTIN_US_REGIME_TEMPLATE: MacroChartTemplate = {
  id: "builtin-us-macro-regime",
  name: "宏观 Regime · 增长与通胀四象限",
  description:
    "量化页与宏观页共用 mds.MacroRegime：蓝线为增长 z，橙线为通胀动量 z；背景色带为增长方向 × 通胀方向的 Dalio 四象限。全程近似 PIT，月度生产任务更新后两处同步生效。",
  chartIntroNotes: {
    "0": "增长 z 由就业、实际收入、工业生产与 ISM 调查四块等权合成；通胀动量 z 由 CPI/PCE 同比的 3 个月变化合成。色带含义见图下四象限图例。",
  },
  indicatorIntroNotes: {
    [MACRO_REGIME_SERIES.growthZ.key]: "增长 z：就业、收入、生产、调查四块滚动标准化后的等权合成。",
    [MACRO_REGIME_SERIES.inflationMomZ.key]: "通胀动量 z：CPI 与 PCE 同比变化动量的滚动标准化合成。",
  },
  selectedKeys: [MACRO_REGIME_SERIES.growthZ.key, MACRO_REGIME_SERIES.inflationMomZ.key],
  layoutMode: 1,
  slotAssignment: {
    [MACRO_REGIME_SERIES.growthZ.key]: 0,
    [MACRO_REGIME_SERIES.inflationMomZ.key]: 0,
  },
  seriesVisualMap: {
    [MACRO_REGIME_SERIES.growthZ.key]: { axis: "left", chartType: "line", color: "#3987e5", showEndLabel: true },
    [MACRO_REGIME_SERIES.inflationMomZ.key]: { axis: "left", chartType: "line", color: "#c98500", showEndLabel: true },
  },
  displayConfig: {
    ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG,
    showRegimeShading: true,
    lineSmooth: false,
    showSymbols: false,
    xLabelRotate: 0,
    slotTitles: { 0: "宏观 Regime：增长 z 与通胀动量 z" },
  },
  createdAtIso: "2026-09-02T00:00:00.000Z",
  builtIn: true,
  folderId: "folder-builtin-us-cycle-risk",
};

export const REGIME_VIRTUAL_KEY_LABELS = new Map<string, string>([
  [MACRO_REGIME_SERIES.growthZ.key, MACRO_REGIME_SERIES.growthZ.label],
  [MACRO_REGIME_SERIES.inflationMomZ.key, MACRO_REGIME_SERIES.inflationMomZ.label],
]);
