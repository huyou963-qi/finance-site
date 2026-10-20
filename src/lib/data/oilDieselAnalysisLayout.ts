import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";
import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroDerivedCalc,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";

/**
 * 原油与柴油短缺监测。
 *
 * 原始序列必须是已核实的 FRED/EIA key；裂解价差只在模板层计算，不写回数据库。
 */
export type OilDieselSeriesDef = {
  virtualKey: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4 | 5 | 6 | null;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calc: MacroSeriesCalcConfig;
};

const NONE_KEEP: MacroSeriesCalcConfig = {
  op: "none",
  frequency: "keep",
  unit: "keep",
  resampleMethod: "end",
};

const WTI = "fred:DCOILWTICO";
const BRENT = "fred:DCOILBRENTEU";
const ULSD_NYH = "fred:DDFUELNYH";
const BTS_FREIGHT = "fred:TSIFRGHT";
const CASS_SHIPMENTS = "fred:FRGSHPUSM649NCIS";
const DISTILLATE_STOCKS = "mds:eia_wpsr_wdistus1";
const ULSD_STOCKS = "mds:eia_wpsr_wd0st_nus_1";
const REFINERY_UTILIZATION = "mds:eia_wpsr_wpuleus3";
const DISTILLATE_SUPPLIED = "mds:eia_wpsr_wdiupus2";
const DISTILLATE_SUPPLIED_MA4 = "mds:eia_wpsr_wdiupus2::ma4";
const SPR_STOCKS = "mds:eia_wpsr_wcsstus1";

const MILLION_BARRELS: MacroSeriesCalcConfig = {
  ...NONE_KEEP,
  scale: 0.001,
  unitLabel: "百万桶",
};

const MILLION_BARRELS_PER_DAY: MacroSeriesCalcConfig = {
  ...NONE_KEEP,
  scale: 0.001,
  unitLabel: "百万桶/日",
};

export const OIL_DIESEL_RAW_SERIES: readonly OilDieselSeriesDef[] = [
  {
    virtualKey: WTI,
    displayName: "WTI 原油现货",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calc: NONE_KEEP,
  },
  {
    virtualKey: BRENT,
    displayName: "Brent 原油现货",
    panel: 1,
    axis: "left",
    chartType: "dashedLine",
    color: "#d89b4e",
    calc: NONE_KEEP,
  },
  {
    virtualKey: ULSD_NYH,
    displayName: "纽约港 ULSD 现货",
    panel: null,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: NONE_KEEP,
  },
  {
    virtualKey: BTS_FREIGHT,
    displayName: "BTS 货运运输服务指数",
    panel: 5,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calc: NONE_KEEP,
  },
  {
    virtualKey: CASS_SHIPMENTS,
    displayName: "Cass 货运量指数",
    panel: 5,
    axis: "left",
    chartType: "dashedLine",
    color: "#6ccad1",
    calc: NONE_KEEP,
  },
  {
    virtualKey: DISTILLATE_STOCKS,
    displayName: "美国馏分油总库存",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calc: MILLION_BARRELS,
  },
  {
    virtualKey: ULSD_STOCKS,
    displayName: "美国超低硫馏分油库存（≤15ppm）",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calc: MILLION_BARRELS,
  },
  {
    virtualKey: REFINERY_UTILIZATION,
    displayName: "美国炼厂产能利用率",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calc: NONE_KEEP,
  },
  {
    virtualKey: DISTILLATE_SUPPLIED,
    displayName: "美国馏分油表观需求（周值）",
    panel: 5,
    axis: "right",
    chartType: "line",
    color: "#ef6461",
    calc: MILLION_BARRELS_PER_DAY,
  },
  {
    virtualKey: DISTILLATE_SUPPLIED_MA4,
    displayName: "美国馏分油表观需求（4周均值）",
    panel: 5,
    axis: "right",
    chartType: "dashedLine",
    color: "#d89b4e",
    calc: {
      ...MILLION_BARRELS_PER_DAY,
      rollingWindow: 4,
    },
  },
  {
    virtualKey: SPR_STOCKS,
    displayName: "美国战略石油储备（SPR）",
    panel: 6,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calc: MILLION_BARRELS,
  },
];

export const OIL_DIESEL_DERIVED: readonly MacroDerivedCalc[] = [
  {
    id: "oil-diesel-ulsd-crack",
    leftKey: ULSD_NYH,
    rightKey: WTI,
    op: "sub",
    leftScale: 42,
    name: "ULSD 裂解价差（美元/桶）",
  },
];

export const OIL_DIESEL_SLOT_TITLES: Record<number, string> = {
  0: "1 原油价格：WTI vs Brent",
  1: "2 成品油裂解：ULSD−WTI",
  2: "3 库存：馏分油总量 vs ULSD",
  3: "4 炼厂：产能利用率",
  4: "5 需求 / 货运：馏分油 vs 货运指数",
  5: "6 战略储备：SPR",
};

export const OIL_DIESEL_CHART_INTRO: Record<string, string> = {
  "0": "WTI 代表美国内陆原油，Brent 代表全球海运原油。两者同时抬升更像全球供给冲击；Brent 相对更强通常提示海运与地缘风险溢价。",
  "1": "ULSD 裂解价差 = 42×纽约港 ULSD（美元/加仑）−WTI（美元/桶），只在模板显示层按同日数据计算。价差急升而原油平稳，更接近炼化或柴油局部短缺。",
  "2": "总馏分油库存与 ≤15ppm ULSD 库存同时下降，且裂解价差走阔，才是柴油紧张增强的组合信号。单周库存受季节与物流扰动，避免孤立解读。",
  "3": "炼厂利用率用于定位炼化瓶颈：利用率下降且裂解走阔，常见于检修、事故或区域炼能受限；高利用率下仍短缺则需检查需求与物流。",
  "4": "馏分油 product supplied 同时展示官方周值和模板层 4 周均值；BTS 与 Cass 是较慢的月度货运需求代理。货运转弱但裂解仍走阔时，优先检查供给端。",
  "5": "SPR 是政策缓冲垫，不等于商业库存。释放可缓解原油端压力，但未必同步解决炼厂产能或柴油品种短缺。",
};

/** 已知但本批未锁定官方 series code 的补充项；不以猜测 key 进入模板。 */
export const OIL_DIESEL_UNRESOLVED_PANELS = [
  "库存补充：商业原油库存（当前模板已覆盖馏分油总库存与 ULSD 库存）",
  "炼厂补充：原油投入量（当前模板已覆盖炼厂产能利用率）",
] as const;

function selectedKeys(): string[] {
  return OIL_DIESEL_RAW_SERIES.map((row) => row.virtualKey);
}

function slotAssignment(): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of OIL_DIESEL_RAW_SERIES) {
    out[row.virtualKey] = row.panel == null ? null : row.panel - 1;
  }
  out["calc:oil-diesel-ulsd-crack"] = 1;
  return out;
}

function visualMap() {
  const out: Record<
    string,
    {
      axis: "left" | "right";
      chartType: MacroSeriesChartType;
      color: string;
      showEndLabel: boolean;
    }
  > = {};
  for (const row of OIL_DIESEL_RAW_SERIES) {
    out[row.virtualKey] = {
      axis: row.axis,
      chartType: row.chartType,
      color: row.color,
      showEndLabel: true,
    };
  }
  out["calc:oil-diesel-ulsd-crack"] = {
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    showEndLabel: true,
  };
  return out;
}

function calcConfigMap(): MacroSeriesCalcConfigMap {
  return Object.fromEntries(
    OIL_DIESEL_RAW_SERIES.map((row) => [row.virtualKey, row.calc]),
  );
}

export const BUILTIN_US_OIL_DIESEL_TEMPLATE: MacroChartTemplate = {
  id: "builtin-us-oil-diesel-monitor",
  name: "原油与柴油短缺监测",
  description:
    "六层观察：原油价格 → 成品油裂解 → 库存 → 炼厂 → 需求/货运 → 战略储备。先区分原油冲击、炼化瓶颈与需求变化，再判断短缺是否扩散。",
  chartIntroNotes: { ...OIL_DIESEL_CHART_INTRO },
  selectedKeys: selectedKeys(),
  layoutMode: 6,
  slotAssignment: slotAssignment(),
  seriesVisualMap: visualMap(),
  seriesCalcConfigMap: calcConfigMap(),
  derivedCalcs: [...OIL_DIESEL_DERIVED],
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
    slotTitles: OIL_DIESEL_SLOT_TITLES,
  },
  createdAtIso: "2026-10-04T00:00:00.000Z",
  builtIn: true,
  folderId: "folder-builtin-us-oil-diesel",
};

export const BUILTIN_US_OIL_DIESEL_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_OIL_DIESEL_TEMPLATE,
];

export const BUILTIN_US_OIL_DIESEL_TEMPLATE_IDS =
  BUILTIN_US_OIL_DIESEL_TEMPLATES.map((template) => template.id);

export const OIL_DIESEL_VIRTUAL_KEY_LABELS = new Map(
  OIL_DIESEL_RAW_SERIES.map((row) => [row.virtualKey, row.displayName]),
);
