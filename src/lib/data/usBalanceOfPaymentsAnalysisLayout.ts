import { DEFAULT_MACRO_CHART_DISPLAY_CONFIG } from "@/lib/macroChartOption";
import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type {
  MacroChartTemplate,
  MacroSeriesCalcConfigMap,
} from "@/lib/data/macroPresetTemplates";

/**
 * 美国国际收支 — 内置四图模板
 *
 * Spec: docs/specs/us-balance-of-payments.spec.md
 * 数据: usBalanceOfPaymentsFredSeedCatalog.ts（12 条 BEA/FRED 季度序列）
 */

export type UsBalanceOfPaymentsAnalysisSeriesDef = {
  virtualKey: string;
  fredId: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  stackGroup?: string;
  lineWidth?: number;
};

export function usBalanceOfPaymentsFredKey(fredId: string): string {
  return `fred:${fredId}`;
}

export const US_BALANCE_OF_PAYMENTS_SERIES: readonly UsBalanceOfPaymentsAnalysisSeriesDef[] = [
  {
    virtualKey: usBalanceOfPaymentsFredKey("IEABCS"),
    fredId: "IEABCS",
    displayName: "服务差额",
    panel: 1,
    axis: "left",
    chartType: "bar",
    color: "#5f76b8",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IEABCPI"),
    fredId: "IEABCPI",
    displayName: "初次收入差额",
    panel: 1,
    axis: "left",
    chartType: "bar",
    color: "#6ccad1",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IEABCSI"),
    fredId: "IEABCSI",
    displayName: "二次收入差额",
    panel: 1,
    axis: "left",
    chartType: "bar",
    color: "#d89b4e",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IEAA"),
    fredId: "IEAA",
    displayName: "美国取得对外金融资产（不含衍生品）",
    panel: 2,
    axis: "left",
    chartType: "bar",
    color: "#6ccad1",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IEAI"),
    fredId: "IEAI",
    displayName: "美国发生对外金融负债（不含衍生品）",
    panel: 2,
    axis: "left",
    chartType: "bar",
    color: "#ef6461",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IEANLF"),
    fredId: "IEANLF",
    displayName: "金融账户净借贷",
    panel: 2,
    axis: "left",
    chartType: "line",
    color: "#3e4d83",
    lineWidth: 2.4,
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IEAIDI"),
    fredId: "IEAIDI",
    displayName: "直接投资负债流量",
    panel: 3,
    axis: "left",
    chartType: "stackBar",
    color: "#6ccad1",
    stackGroup: "us-bop-liability-flow",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IEAIPI"),
    fredId: "IEAIPI",
    displayName: "证券投资负债流量",
    panel: 3,
    axis: "left",
    chartType: "stackBar",
    color: "#5f76b8",
    stackGroup: "us-bop-liability-flow",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IEAIOI"),
    fredId: "IEAIOI",
    displayName: "其他投资负债流量",
    panel: 3,
    axis: "left",
    chartType: "stackBar",
    color: "#d89b4e",
    stackGroup: "us-bop-liability-flow",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IIPDIRELMVQ"),
    fredId: "IIPDIRELMVQ",
    displayName: "直接投资负债存量（市场价值）",
    panel: 4,
    axis: "left",
    chartType: "stackArea",
    color: "#6ccad1",
    stackGroup: "us-bop-liability-stock",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IIPPORTLQ"),
    fredId: "IIPPORTLQ",
    displayName: "证券投资负债存量",
    panel: 4,
    axis: "left",
    chartType: "stackArea",
    color: "#5f76b8",
    stackGroup: "us-bop-liability-stock",
  },
  {
    virtualKey: usBalanceOfPaymentsFredKey("IIPOTHELQ"),
    fredId: "IIPOTHELQ",
    displayName: "其他投资负债存量",
    panel: 4,
    axis: "left",
    chartType: "stackArea",
    color: "#d89b4e",
    stackGroup: "us-bop-liability-stock",
  },
] as const;

export const US_BALANCE_OF_PAYMENTS_SLOT_TITLES: Record<number, string> = {
  0: "经常账户非货物项：服务、初次收入与二次收入",
  1: "跨境资金两端：资产取得、负债发生与净借贷",
  2: "外部融资流量结构：直接、证券与其他投资",
  3: "外部负债存量结构：直接、证券与其他投资",
};

export const US_BALANCE_OF_PAYMENTS_DESCRIPTION =
  "从经常账户的非货物缓冲、跨境资金的资产负债两端、外部融资的工具结构和外部负债存量四步，判断美国对外融资依赖的来源、稳定性与潜在脆弱点。";

export const US_BALANCE_OF_PAYMENTS_CHART_INTRO: Record<string, string> = {
  "0":
    "先看服务顺差能否覆盖初次收入和二次收入的净流出。服务顺差扩大通常改善非货物经常项目；初次收入由顺差转为逆差，意味着美国海外资产收益相对外国持有美国资产的收益优势减弱。该图需与既有经常账户总差额、贸易差额联读。",
  "1":
    "资产取得增加表示美国居民增加海外资产、形成金融流出；负债发生增加表示境外投资者增加美国资产、形成金融流入。官方金融账户净借贷综合资产、负债和衍生品净交易：正值为净贷出，负值为净借入。",
  "2":
    "直接投资通常期限更长、黏性更高；证券投资对收益率、风险偏好和资产价格更敏感；其他投资主要含存贷款、贷款和贸易信贷，短期跳升常提示银行与美元流动性渠道在主导。负值表示撤资或负债净偿还。",
  "3":
    "证券投资负债占比较高意味着美国依靠深厚资本市场吸收全球储蓄，同时负债市值更受利率和资产价格重估影响；其他投资上升则提高银行融资与短期流动性敏感度。存量变化还包含价格、汇率及其他调整。",
};

export function buildUsBalanceOfPaymentsSeriesCalcConfigMap(): MacroSeriesCalcConfigMap {
  return Object.fromEntries(
    US_BALANCE_OF_PAYMENTS_SERIES.map((row) => [
      row.virtualKey,
      { op: "none", frequency: "keep", unit: "keep", resampleMethod: "end" },
    ]),
  );
}

export function buildUsBalanceOfPaymentsBuiltinTemplate(): MacroChartTemplate {
  const slotAssignment: Record<string, number> = {};
  const seriesVisualMap: MacroChartTemplate["seriesVisualMap"] = {};
  for (const row of US_BALANCE_OF_PAYMENTS_SERIES) {
    slotAssignment[row.virtualKey] = row.panel - 1;
    seriesVisualMap[row.virtualKey] = {
      axis: row.axis,
      chartType: row.chartType,
      color: row.color,
      showEndLabel: row.chartType === "line",
      ...(row.stackGroup ? { stackGroup: row.stackGroup } : {}),
      ...(row.lineWidth ? { lineWidth: row.lineWidth } : {}),
    };
  }
  return {
    id: "builtin-us-balance-of-payments-overview",
    name: "国际收支 · 经常账户结构与外部融资",
    description: US_BALANCE_OF_PAYMENTS_DESCRIPTION,
    chartIntroNotes: { ...US_BALANCE_OF_PAYMENTS_CHART_INTRO },
    selectedKeys: US_BALANCE_OF_PAYMENTS_SERIES.map((row) => row.virtualKey),
    layoutMode: 4,
    slotAssignment,
    seriesVisualMap,
    seriesCalcConfigMap: buildUsBalanceOfPaymentsSeriesCalcConfigMap(),
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
      areaOpacity: 0.28,
      slotTitles: US_BALANCE_OF_PAYMENTS_SLOT_TITLES,
    },
    createdAtIso: "2026-08-12T00:00:00.000Z",
    builtIn: true,
    folderId: "folder-builtin-us-balance-of-payments",
  };
}

export const BUILTIN_US_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE =
  buildUsBalanceOfPaymentsBuiltinTemplate();

export const BUILTIN_US_BALANCE_OF_PAYMENTS_TEMPLATES: readonly MacroChartTemplate[] = [
  BUILTIN_US_BALANCE_OF_PAYMENTS_OVERVIEW_TEMPLATE,
];

export const BUILTIN_US_BALANCE_OF_PAYMENTS_TEMPLATE_IDS =
  BUILTIN_US_BALANCE_OF_PAYMENTS_TEMPLATES.map((template) => template.id);

export const US_BALANCE_OF_PAYMENTS_VIRTUAL_KEY_LABELS = new Map(
  US_BALANCE_OF_PAYMENTS_SERIES.map((row) => [row.virtualKey, row.displayName]),
);
