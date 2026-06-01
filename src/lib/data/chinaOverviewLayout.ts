import type { MacroSeriesChartType } from "@/lib/macroChartOption";

export type ChinaOverviewSeriesDef = {
  columnIndex: number;
  displayName: string;
  code: string;
  panel: 1 | 2 | 3 | 4 | 5 | 6;
  /** 指标树主题分类（与宏观目录其他国家指标一致） */
  catalogCategory: string;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
};

/** China_Overview.xlsx R2 列顺序（col 1–21）与附图 6 图布局一一对应 */
export const CHINA_OVERVIEW_SERIES: readonly ChinaOverviewSeriesDef[] = [
  {
    columnIndex: 1,
    displayName: "GDP:不变价:当季同比",
    code: "chov_c01_gdp_real_yoy_q",
    panel: 1,
    catalogCategory: "国民经济核算",
    axis: "left",
    chartType: "line",
    color: "#f39c3d",
  },
  {
    columnIndex: 2,
    displayName: "GDP:现价:当季同比",
    code: "chov_c02_gdp_nom_yoy_q",
    panel: 1,
    catalogCategory: "国民经济核算",
    axis: "left",
    chartType: "line",
    color: "#2aa7b8",
  },
  {
    columnIndex: 3,
    displayName: "用电量:当月同比",
    code: "chov_c03_electricity_yoy_m",
    panel: 1,
    catalogCategory: "能源",
    axis: "right",
    chartType: "line",
    color: "#9aa6b8",
  },
  {
    columnIndex: 4,
    displayName: "万得全A指数:收盘价",
    code: "chov_c04_wind_alla_close",
    panel: 2,
    catalogCategory: "证券市场",
    axis: "right",
    chartType: "line",
    color: "#d35454",
  },
  {
    columnIndex: 5,
    displayName: "制造业PMI",
    code: "chov_c05_mfg_pmi",
    panel: 2,
    catalogCategory: "景气调查",
    axis: "left",
    chartType: "line",
    color: "#3f4f86",
  },
  {
    columnIndex: 6,
    displayName: "非制造业PMI:商务活动",
    code: "chov_c06_nm_pmi",
    panel: 2,
    catalogCategory: "景气调查",
    axis: "left",
    chartType: "line",
    color: "#67b36d",
  },
  {
    columnIndex: 7,
    displayName: "CPI:当月同比",
    code: "chov_c07_cpi_yoy_m",
    panel: 3,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "line",
    color: "#e3c44c",
  },
  {
    columnIndex: 8,
    displayName: "PPI:全部工业品:当月同比",
    code: "chov_c08_ppi_yoy_m",
    panel: 3,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "line",
    color: "#66a090",
  },
  {
    columnIndex: 9,
    displayName: "M1:同比",
    code: "chov_c09_m1_yoy",
    panel: 4,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#d99545",
  },
  {
    columnIndex: 10,
    displayName: "M2:同比",
    code: "chov_c10_m2_yoy",
    panel: 4,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#8e9bb2",
  },
  {
    columnIndex: 11,
    displayName: "M2-M1",
    code: "chov_c11_m2_minus_m1",
    panel: 4,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#f39c3d",
  },
  {
    columnIndex: 12,
    displayName: "社会融资规模存量:同比",
    code: "chov_c12_sf_stock_yoy",
    panel: 4,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#8f79c4",
  },
  {
    columnIndex: 13,
    displayName: "货币当局:总资产:同比",
    code: "chov_c13_pbc_assets_yoy",
    panel: 4,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#b9c2cf",
  },
  {
    columnIndex: 14,
    displayName: "规模以上工业增加值:累计同比",
    code: "chov_c14_ind_va_yoy",
    panel: 5,
    catalogCategory: "工业",
    axis: "left",
    chartType: "line",
    color: "#f0a45f",
  },
  {
    columnIndex: 15,
    displayName: "工业企业:营业收入:累计同比",
    code: "chov_c15_ind_rev_yoy",
    panel: 5,
    catalogCategory: "工业",
    axis: "left",
    chartType: "line",
    color: "#68a89d",
  },
  {
    columnIndex: 16,
    displayName: "工业企业:利润总额:累计同比",
    code: "chov_c16_ind_profit_yoy",
    panel: 5,
    catalogCategory: "工业",
    axis: "left",
    chartType: "line",
    color: "#c07f7f",
  },
  {
    columnIndex: 17,
    displayName: "社会消费品零售总额:累计同比",
    code: "chov_c17_retail_yoy",
    panel: 6,
    catalogCategory: "国内贸易与消费",
    axis: "left",
    chartType: "line",
    color: "#5d77b5",
  },
  {
    columnIndex: 18,
    displayName: "固定资产投资完成额:累计同比",
    code: "chov_c18_fai_yoy",
    panel: 6,
    catalogCategory: "固定资产投资",
    axis: "left",
    chartType: "line",
    color: "#d2be72",
  },
  {
    columnIndex: 19,
    displayName: "房地产开发投资完成额:累计同比",
    code: "chov_c19_rei_yoy",
    panel: 6,
    catalogCategory: "固定资产与地产",
    axis: "left",
    chartType: "line",
    color: "#6ba58f",
  },
  {
    columnIndex: 20,
    displayName: "中国:国债到期收益率:10年",
    code: "chov_c20_cn_10y_yield",
    panel: 1,
    catalogCategory: "利率与债券",
    axis: "left",
    chartType: "line",
    color: "#9f8fc7",
  },
  {
    columnIndex: 21,
    displayName: "滚动市盈率(TTM):万得全A指数",
    code: "chov_c21_wind_alla_pe_ttm",
    panel: 2,
    catalogCategory: "证券市场",
    axis: "right",
    chartType: "line",
    color: "#2d7ea1",
  },
] as const;

export const CHINA_OVERVIEW_BY_COLUMN = new Map(
  CHINA_OVERVIEW_SERIES.map((row) => [row.columnIndex, row]),
);

export const CHINA_OVERVIEW_BY_CODE = new Map(CHINA_OVERVIEW_SERIES.map((row) => [row.code, row]));

export const CHINA_OVERVIEW_BY_DISPLAY = new Map(
  CHINA_OVERVIEW_SERIES.map((row) => [normalizeChinaOverviewName(row.displayName), row]),
);

export function normalizeChinaOverviewName(name: string): string {
  return name
    .trim()
    .replace(/[：:]/g, ":")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function chinaOverviewMdsKey(code: string): string {
  return `mds:${code}`;
}

export function chinaOverviewCodeFromMdsKey(key: string): string | null {
  if (!key.startsWith("mds:chov_")) return null;
  return key.slice(4);
}

export function chinaOverviewColumnFromCode(code: string): number {
  const m = /^chov_c(\d+)_/i.exec(code);
  if (!m) return 999;
  return Number(m[1]);
}

export function chinaOverviewPanelFromCode(code: string): number {
  return CHINA_OVERVIEW_BY_CODE.get(code)?.panel ?? 1;
}

/** Prisma MacroCategory.code 后缀（挂在 macro_country_cn 下） */
export const CHINA_OVERVIEW_CATEGORY_CODE_BY_NAME: Record<string, string> = {
  国民经济核算: "national_accounts",
  工业: "industry",
  能源: "energy",
  价格指数: "price_index",
  银行与货币: "banking_money",
  利率与债券: "rates_bonds",
  证券市场: "securities",
  景气调查: "business_survey",
  国内贸易与消费: "domestic_trade",
  固定资产投资: "fixed_investment",
  固定资产与地产: "real_estate",
};

export const CHINA_OVERVIEW_CATEGORY_SORT_BY_NAME: Record<string, number> = {
  国民经济核算: 10,
  工业: 20,
  能源: 25,
  价格指数: 30,
  银行与货币: 40,
  利率与债券: 50,
  证券市场: 60,
  景气调查: 70,
  国内贸易与消费: 80,
  固定资产投资: 90,
  固定资产与地产: 100,
};
