import type { MacroSeriesChartType } from "@/lib/macroChartOption";

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
  {
    columnIndex: 1,
    displayName: "期货收盘价(活跃合约):COMEX黄金",
    code: "goldov_c01_comex_active",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "黄金价格",
    axis: "left",
    chartType: "line",
    color: "#d86a7a",
  },
  {
    columnIndex: 2,
    displayName: "伦敦金现:IDC",
    code: "goldov_c02_london_gold",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 1,
    catalogCategory: "黄金价格",
    axis: "left",
    chartType: "line",
    color: "#4bc0c8",
  },
  {
    columnIndex: 3,
    displayName: "期现差",
    code: "goldov_c03_basis",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "黄金价格",
    axis: "left",
    chartType: "line",
    color: "#9aa7b3",
  },
  {
    columnIndex: 4,
    displayName: "期货和期权(新版):管理基金:多头持仓",
    code: "goldov_c04_mm_long",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 3,
    catalogCategory: "持仓",
    axis: "left",
    chartType: "stackBar",
    color: "#5cb85c",
    stackGroup: "gold-mm",
  },
  {
    columnIndex: 5,
    displayName: "期货和期权(新版):管理基金:空头持仓",
    code: "goldov_c05_mm_short",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 3,
    catalogCategory: "持仓",
    axis: "left",
    chartType: "stackBar",
    color: "#9aa7b3",
    stackGroup: "gold-mm",
  },
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
    columnIndex: 7,
    displayName: "COMEX:库存量:黄金:百万",
    code: "goldov_c07_comex_stock",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 4,
    catalogCategory: "库存",
    axis: "left",
    chartType: "area",
    color: "#d9534f",
  },
  {
    columnIndex: 8,
    displayName: "COMEX:库存量:黄金:百万:环比增加",
    code: "goldov_c08_comex_stock_wow",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 4,
    catalogCategory: "库存",
    axis: "right",
    chartType: "line",
    color: "#8a6d3b",
  },
  {
    columnIndex: 9,
    displayName: "总:黄金ETF:持有量(百万盎司)",
    code: "goldov_c09_etf_holding",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 5,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "area",
    color: "#8f74c8",
  },
  {
    columnIndex: 10,
    displayName: "总:黄金ETF:持有量(百万盎司):环比增加",
    code: "goldov_c10_etf_holding_wow",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 5,
    catalogCategory: "ETF与储备",
    axis: "right",
    chartType: "line",
    color: "#5b8fc9",
  },
  {
    columnIndex: 11,
    displayName: "全球:黄金储备:当月值:(百万盎司)",
    code: "goldov_c11_global_reserve",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 6,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "bar",
    color: "#e8a04e",
  },
  {
    columnIndex: 12,
    displayName: "有效联邦基金利率(EFFR)",
    code: "goldov_c12_effr",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "利率与通胀",
    axis: "right",
    chartType: "line",
    color: "#6bcad1",
  },
  {
    columnIndex: 13,
    displayName: "国债收益率:10年",
    code: "goldov_c13_gs10",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 2,
    catalogCategory: "利率与通胀",
    axis: "right",
    chartType: "line",
    color: "#3e4d83",
  },
  {
    columnIndex: 14,
    displayName: "CPI:季调:同比",
    code: "goldov_c14_cpi_sa_yoy",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 2,
    catalogCategory: "利率与通胀",
    axis: "right",
    chartType: "line",
    color: "#d86a7a",
  },
  {
    columnIndex: 15,
    displayName: "PPI:所有商品:非季调:同比",
    code: "goldov_c15_ppi_yoy",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "利率与通胀",
    axis: "right",
    chartType: "line",
    color: "#a7b4c1",
  },
  {
    columnIndex: 16,
    displayName: "总:黄金ETF:持有量(吨):环比增加",
    code: "goldov_c16_etf_tons_wow",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "ETF与储备",
    axis: "right",
    chartType: "line",
    color: "#5b8fc9",
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
    panel: null,
    catalogCategory: "库存",
    axis: "left",
    chartType: "line",
    color: "#d9534f",
  },
  {
    columnIndex: 24,
    displayName: "全球:黄金储备量:当月值",
    code: "goldov_c24_global_reserve_tons",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "bar",
    color: "#e8a04e",
  },
  {
    columnIndex: 25,
    displayName: "总:黄金ETF:持有量(吨)",
    code: "goldov_c25_etf_holding_tons",
    countryCode: "US",
    countryNameZh: "美国",
    panel: null,
    catalogCategory: "ETF与储备",
    axis: "left",
    chartType: "line",
    color: "#8f74c8",
  },
  {
    columnIndex: 26,
    displayName: "美元指数",
    code: "goldov_c26_dxy",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 1,
    catalogCategory: "黄金价格",
    axis: "right",
    chartType: "line",
    color: "#d75a68",
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
  {
    columnIndex: 28,
    displayName: "美国:实际利率",
    code: "goldov_c28_real_rate",
    countryCode: "US",
    countryNameZh: "美国",
    panel: 2,
    catalogCategory: "利率与通胀",
    axis: "right",
    chartType: "line",
    color: "#8a6d3b",
  },
] as const;

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
