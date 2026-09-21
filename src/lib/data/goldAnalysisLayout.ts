import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type { MacroDerivedCalc, MacroSeriesCalcConfig } from "@/lib/data/macroPresetTemplates";
import { GOLD_FUTURES_CODE, GOLD_SPOT_CODE } from "@/lib/data/scheduler/goldPrices/catalog";

export type GoldAnalysisSeriesDef = {
  /** xlsx 中的列序号（0 为时间列） */
  columnIndex: number;
  displayName: string;
  code: string;
  countryCode: string;
  countryNameZh: string;
  /** 图组面板（1–6）；null 表示导入但不在模板图表中绘制 */
  panel: 1 | 2 | 3 | 4 | 5 | 6 | null;
  catalogCategory: string;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  stackGroup?: string;
};

/** 黄金期货头寸.xlsx 工作表 R1 列顺序（col 1–28） */
export const GOLD_ANALYSIS_SERIES: readonly GoldAnalysisSeriesDef[] = [
  // col 1/2（COMEX 活跃合约、伦敦金现 IDC）已被标准序列取代（历史保留、目录隐藏），
  // 模板改用下方 GOLD_ANALYSIS_TEMPLATE_EXTRAS 的 comex_gold_futures / wgc_gold_price_usd。
  // col 3/7–11/16/25（期现差、库存/ETF/储备单位换算、环比、ETF 合计）为计算型二次指标，已退役
  // （retiredIndicators.ts）；期现差与库存环比见下方 GOLD_ANALYSIS_TEMPLATE_EXTRAS 的指标运算。
  {
    columnIndex: 6,
    displayName: "期货和期权(新版):管理基金:净持仓",
    code: "goldov_c06_mm_net",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 3,
    catalogCategory: "持仓",
    axis: "left",
    chartType: "line",
    color: "#d75a68",
  },
  {
    columnIndex: 17,
    displayName: "持有量:SPDR:黄金ETF",
    code: "goldov_c17_spdr_etf",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "line",
    color: "#f2cf67",
  },
  {
    columnIndex: 18,
    displayName: "iShares:黄金ETF:持有量(吨)",
    code: "goldov_c18_ishares_etf",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "line",
    color: "#6f84c0",
  },
  {
    columnIndex: 19,
    displayName: "GBS:持有量:黄金ETF",
    code: "goldov_c19_gbs_etf",
    countryCode: "GB",
    countryNameZh: "英国",
    panel: null,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "line",
    color: "#56b6c2",
  },
  {
    columnIndex: 20,
    displayName: "PHAU:持有量:黄金ETF",
    code: "goldov_c20_phau_etf",
    countryCode: "GB",
    countryNameZh: "英国",
    panel: null,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "line",
    color: "#8f74c8",
  },
  {
    columnIndex: 21,
    displayName: "SGBS:持有量:黄金ETF",
    code: "goldov_c21_sgbs_etf",
    countryCode: "CH",
    countryNameZh: "瑞士",
    panel: null,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "line",
    color: "#5cb85c",
  },
  {
    columnIndex: 22,
    displayName: "GOLD:黄金ETF:持有量(吨)",
    code: "goldov_c22_gold_etf",
    countryCode: "GB",
    countryNameZh: "英国",
    panel: null,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
  },
  {
    columnIndex: 23,
    displayName: "COMEX:库存量:黄金",
    code: "goldov_c23_comex_stock_oz",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 4,
    catalogCategory: "库存",
    axis: "left",
    chartType: "area",
    color: "#d9534f",
  },
  {
    columnIndex: 24,
    displayName: "全球:黄金储备量:当月值",
    code: "goldov_c24_global_reserve_tons",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 6,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "bar",
    color: "#e8a04e",
  },
  {
    columnIndex: 27,
    displayName: "期货结算价(连续):布伦特原油",
    code: "goldov_c27_brent",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "商品价格",
    axis: "left",
    chartType: "line",
    color: "#8f9bab",
  },
  // col 28「美国:实际利率」（世行年度，只到 2021）已被 fred:DFII10 取代，见 GOLD_ANALYSIS_TEMPLATE_EXTRAS
] as const;

export type GoldAnalysisTemplateExtra = {
  key: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4 | 5 | 6 | null;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calc?: MacroSeriesCalcConfig;
  derived?: MacroDerivedCalc;
};

/** 黄金模板中的指标运算（替代已退役的 xlsx 计算列；id 与 retiredIndicators.ts 一致） */
export const GOLD_ANALYSIS_TEMPLATE_EXTRAS: readonly GoldAnalysisTemplateExtra[] = [
  // 金价标准序列（goldPrices/catalog.ts），图位/样式沿用原 col 2 / col 1
  {
    key: `mds:${GOLD_SPOT_CODE}`,
    displayName: "伦敦金现(LBMA)",
    panel: 1,
    axis: "left",
    chartType: "line",
    color: "#4bc0c8",
  },
  {
    key: `mds:${GOLD_FUTURES_CODE}`,
    displayName: "COMEX黄金期货",
    panel: null,
    axis: "left",
    chartType: "line",
    color: "#d86a7a",
  },
  // 美国实际利率：10 年期 TIPS 收益率（日频），图位/样式沿用原 col 28
  {
    key: "fred:DFII10",
    displayName: "美国:10年期TIPS实际收益率",
    panel: 2,
    axis: "right",
    chartType: "line",
    color: "#8a6d3b",
  },
  {
    key: "mds:goldov_c23_comex_stock_oz::diff",
    displayName: "COMEX:库存量:黄金:环比增加",
    panel: 4,
    axis: "right",
    chartType: "line",
    color: "#8a6d3b",
    calc: { op: "diff", frequency: "keep", unit: "keep", resampleMethod: "end" },
  },
  {
    key: "calc:gold-basis",
    displayName: "期现差",
    panel: null,
    axis: "left",
    chartType: "line",
    color: "#9aa7b3",
    derived: {
      id: "gold-basis",
      name: "期现差",
      op: "sub",
      leftKey: `mds:${GOLD_FUTURES_CODE}`,
      rightKey: `mds:${GOLD_SPOT_CODE}`,
    },
  },
];

export const GOLD_ANALYSIS_BY_CODE = new Map(
  GOLD_ANALYSIS_SERIES.map((row) => [row.code, row]),
);

export function normalizeGoldName(name: string): string {
  return name
    .trim()
    .replace(/[：:]/g, ":")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export const GOLD_ANALYSIS_BY_DISPLAY = new Map(
  GOLD_ANALYSIS_SERIES.map((row) => [normalizeGoldName(row.displayName), row]),
);

export function goldAnalysisMdsKey(code: string): string {
  return `mds:${code}`;
}

export function goldAnalysisCodeFromMdsKey(key: string): string | null {
  if (!key.startsWith("mds:goldov_")) return null;
  return key.slice(4);
}

export const GOLD_ANALYSIS_CATEGORY_CODE_BY_NAME: Record<string, string> = {
  黄金价格: "gold_price",
  持仓: "gold_positions",
  库存: "gold_inventory",
  ETF与储备: "gold_etf_reserve",
  利率与通胀: "rates_inflation",
  商品价格: "commodities",
};

export const GOLD_ANALYSIS_CATEGORY_SORT_BY_NAME: Record<string, number> = {
  黄金价格: 10,
  持仓: 20,
  库存: 30,
  ETF与储备: 40,
  利率与通胀: 50,
  商品价格: 60,
};

export const GOLD_ANALYSIS_COUNTRY_BY_CODE: Record<string, string> = {
  US: "美国",
  GB: "英国",
  CH: "瑞士",
};

export function goldCategoryKey(countryCode: string, categoryName: string): string {
  const cc = countryCode.toLowerCase();
  const slug = GOLD_ANALYSIS_CATEGORY_CODE_BY_NAME[categoryName];
  if (!slug) throw new Error(`missing category slug: ${categoryName}`);
  return `${cc}:${categoryName}`;
}
