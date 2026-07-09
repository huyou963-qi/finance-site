import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroSeriesCalcConfig,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";
import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";

/**
 * 美国对外部门与美元 — 内置双模板
 *
 * Spec: docs/specs/us-external-dollar.spec.md
 * 数据: externalDollarFredSeedCatalog.ts（10 条新 seed + DTWEXBGS 复用进模板）
 */

export type ExternalDollarCalcOp = "yoy" | "none";

export type ExternalDollarAnalysisSeriesDef = {
  virtualKey: string;
  fredId: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calcOp: ExternalDollarCalcOp;
  /** 日频序列月均对齐 */
  resampleToMonth?: boolean;
};

export function externalDollarFredKey(fredId: string, variant?: string): string {
  if (!variant || variant === "level") return `fred:${fredId}`;
  return `fred:${fredId}::${variant}`;
}

function calcConfigFor(row: ExternalDollarAnalysisSeriesDef): MacroSeriesCalcConfig {
  if (row.calcOp === "yoy") {
    return { op: "yoy", frequency: "month", unit: "keep", resampleMethod: "end" };
  }
  if (row.resampleToMonth) {
    return { op: "none", frequency: "month", unit: "keep", resampleMethod: "avg" };
  }
  return { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
}

export function buildExternalDollarSeriesCalcConfigMap(
  series: readonly ExternalDollarAnalysisSeriesDef[],
): MacroSeriesCalcConfigMap {
  const out: MacroSeriesCalcConfigMap = {};
  for (const row of series) out[row.virtualKey] = calcConfigFor(row);
  return out;
}

/** 模板 ①：对外 · 美元与贸易流量 */
export const EXTERNAL_DOLLAR_OVERVIEW_SERIES: readonly ExternalDollarAnalysisSeriesDef[] = [
  {
    virtualKey: externalDollarFredKey("DTWEXBGS", "avg"),
    fredId: "DTWEXBGS",
    displayName: "美元名义广义指数（月均）",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: externalDollarFredKey("DTWEXAFEGS", "avg"),
    fredId: "DTWEXAFEGS",
    displayName: "AFE 美元指数（月均）",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: externalDollarFredKey("DTWEXEMEGS", "avg"),
    fredId: "DTWEXEMEGS",
    displayName: "EME 美元指数（月均）",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "none",
    resampleToMonth: true,
  },
  {
    virtualKey: externalDollarFredKey("BOPGSTB", "level"),
    fredId: "BOPGSTB",
    displayName: "商品与服务贸易差额",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "none",
  },
  {
    virtualKey: externalDollarFredKey("BOPTEXP", "yoy"),
    fredId: "BOPTEXP",
    displayName: "出口（BOP）同比",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "yoy",
  },
  {
    virtualKey: externalDollarFredKey("BOPTIMP", "yoy"),
    fredId: "BOPTIMP",
    displayName: "进口（BOP）同比",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#8f9bab",
    calcOp: "yoy",
  },
];

/** 模板 ②：对外 · 外部均衡与贸易条件 */
export const EXTERNAL_DOLLAR_BALANCE_SERIES: readonly ExternalDollarAnalysisSeriesDef[] = [
  {
    virtualKey: externalDollarFredKey("IEABC", "level"),
    fredId: "IEABC",
    displayName: "经常账户余额",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#ef6461",
    calcOp: "none",
  },
  {
    virtualKey: externalDollarFredKey("IIPUSNETIQ", "level"),
    fredId: "IIPUSNETIQ",
    displayName: "净国际投资头寸",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
    calcOp: "none",
  },
  {
    virtualKey: externalDollarFredKey("IQ", "yoy"),
    fredId: "IQ",
    displayName: "出口价格指数同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
    calcOp: "yoy",
  },
  {
    virtualKey: externalDollarFredKey("IR", "yoy"),
    fredId: "IR",
    displayName: "进口价格指数同比",
    panel: 3,
    axis: "left",
    chartType: "line",
    color: "#6ccad1",
    calcOp: "yoy",
  },
  {
    virtualKey: externalDollarFredKey("W369RG3Q066SBEA", "level"),
    fredId: "W369RG3Q066SBEA",
    displayName: "贸易条件指数",
    panel: 4,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    calcOp: "none",
  },
];

export const EXTERNAL_DOLLAR_OVERVIEW_SLOT_TITLES: Record<number, string> = {
  0: "L1 美元广义：贸易加权",
  1: "L2 美元结构：发达 vs 新兴",
  2: "L3 贸易差额：商品与服务",
  3: "L4 贸易流量：出口 vs 进口",
};

export const EXTERNAL_DOLLAR_BALANCE_SLOT_TITLES: Record<number, string> = {
  0: "L5 经常账户",
  1: "L6 净国际投资头寸",
  2: "L7 贸易价格：出口 vs 进口",
  3: "L8 贸易条件",
};

export const EXTERNAL_DOLLAR_OVERVIEW_DESCRIPTION =
  "【第一步 · 汇率与流量】按图 1→4：广义美元 → 发达/新兴结构 → 贸易差额 → 进出口同比。判断美元周期与贸易动能 → 加载「对外 · 外部均衡与贸易条件」。";

export const EXTERNAL_DOLLAR_BALANCE_DESCRIPTION =
  "【第二步 · 均衡与价格】按图 1→4：经常账户 → 净国际头寸 → 进出口价格同比 → 贸易条件。回答外部融资需求与相对价格冲击。";

export const EXTERNAL_DOLLAR_OVERVIEW_CHART_INTRO: Record<string, string> = {
  "0":
    "广义美元月均：升=美元强（压制出口、利好进口与压低进口通胀）；降=美元弱。先定汇率大方向，再看图 2 结构、图 3–4 流量是否验证。",
  "1":
    "AFE vs EME 美元指数：对发达与新兴升贬是否同步。EME 单独走强常对应新兴风险偏好/商品周期；与图 1 背离时看主导驱动在哪一侧。",
  "2":
    "商品与服务贸易差额（百万美元，负=逆差）：扩大=外需拖累或内需吸进口；收窄=外需改善或内需降温。对照图 4 看出口还是进口主导。",
  "3":
    "出口/进口（BOP）同比：出口↑进口平=外需驱动改善；进口↑出口平=内需/库存驱动逆差扩大。与 Overview 实际进出口（NIPA）互相印证。",
};

export const EXTERNAL_DOLLAR_BALANCE_CHART_INTRO: Record<string, string> = {
  "0":
    "经常账户余额：逆差=需外部融资。与 ① 图 3 贸易差额同向时确认商品服务主导；背离则看收入账户。",
  "1":
    "净国际投资头寸：净负债存量。估值效应可短期改善头寸而不改流量；持续恶化+经常账户逆差扩大=外部脆弱性上升。",
  "2":
    "出口/进口价格指数同比：进口价格↑传导国内通胀（对照通胀域）；出口价格↑改善贸易条件。剪刀差方向先于图 4。",
  "3":
    "贸易条件指数：出口相对进口价格。改善=实际购买力上升；恶化常伴随能源进口冲击。与图 3 价格同比互证。",
};

export function externalDollarSelectedKeys(
  series: readonly ExternalDollarAnalysisSeriesDef[],
): string[] {
  return series.map((r) => r.virtualKey);
}

export function buildExternalDollarSlotAssignment(
  series: readonly ExternalDollarAnalysisSeriesDef[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const row of series) out[row.virtualKey] = row.panel - 1;
  return out;
}

export function buildExternalDollarVisualMap(
  series: readonly ExternalDollarAnalysisSeriesDef[],
): Record<
  string,
  { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string; showEndLabel: boolean }
> {
  const out: Record<
    string,
    { axis: "left" | "right"; chartType: MacroSeriesChartType; color: string; showEndLabel: boolean }
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

export function buildExternalDollarBuiltinTemplate(opts: {
  id: string;
  name: string;
  description: string;
  chartIntroNotes: Record<string, string>;
  series: readonly ExternalDollarAnalysisSeriesDef[];
  slotTitles: Record<number, string>;
  createdAtIso?: string;
}): MacroChartTemplate {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    chartIntroNotes: { ...opts.chartIntroNotes },
    selectedKeys: externalDollarSelectedKeys(opts.series),
    layoutMode: 4,
    slotAssignment: buildExternalDollarSlotAssignment(opts.series),
    seriesVisualMap: buildExternalDollarVisualMap(opts.series),
    seriesCalcConfigMap: buildExternalDollarSeriesCalcConfigMap(opts.series),
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
    createdAtIso: opts.createdAtIso ?? "2026-07-09T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-external-dollar",
  };
}

export const BUILTIN_US_EXTERNAL_DOLLAR_OVERVIEW_TEMPLATE = buildExternalDollarBuiltinTemplate({
  id: "builtin-us-external-dollar-overview",
  name: "对外 · 美元与贸易流量",
  description: EXTERNAL_DOLLAR_OVERVIEW_DESCRIPTION,
  chartIntroNotes: EXTERNAL_DOLLAR_OVERVIEW_CHART_INTRO,
  series: EXTERNAL_DOLLAR_OVERVIEW_SERIES,
  slotTitles: EXTERNAL_DOLLAR_OVERVIEW_SLOT_TITLES,
});

export const BUILTIN_US_EXTERNAL_DOLLAR_BALANCE_TEMPLATE = buildExternalDollarBuiltinTemplate({
  id: "builtin-us-external-dollar-balance",
  name: "对外 · 外部均衡与贸易条件",
  description: EXTERNAL_DOLLAR_BALANCE_DESCRIPTION,
  chartIntroNotes: EXTERNAL_DOLLAR_BALANCE_CHART_INTRO,
  series: EXTERNAL_DOLLAR_BALANCE_SERIES,
  slotTitles: EXTERNAL_DOLLAR_BALANCE_SLOT_TITLES,
});

export const BUILTIN_US_EXTERNAL_DOLLAR_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_EXTERNAL_DOLLAR_OVERVIEW_TEMPLATE,
  BUILTIN_US_EXTERNAL_DOLLAR_BALANCE_TEMPLATE,
];

export const BUILTIN_US_EXTERNAL_DOLLAR_TEMPLATE_IDS = BUILTIN_US_EXTERNAL_DOLLAR_TEMPLATES.map(
  (t) => t.id,
);

function buildExternalDollarVirtualKeyLabelMap(): ReadonlyMap<string, string> {
  const all = [...EXTERNAL_DOLLAR_OVERVIEW_SERIES, ...EXTERNAL_DOLLAR_BALANCE_SERIES];
  const m = new Map<string, string>();
  for (const row of all) m.set(row.virtualKey, row.displayName);
  return m;
}

/** 对外部门模板虚拟键 → 中文显示名 */
export const EXTERNAL_DOLLAR_VIRTUAL_KEY_LABELS = buildExternalDollarVirtualKeyLabelMap();
