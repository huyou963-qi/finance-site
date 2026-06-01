import type { MacroSeriesChartType } from "@/lib/macroChartOption";

export type JapanOverviewSeriesDef = {
  columnIndex: number;
  displayName: string;
  code: string;
  /** 6 图布局槽位；null 表示仅入库/指标树，不进 Japan_Overview 模板图组 */
  panel: 1 | 2 | 3 | 4 | 5 | 6 | null;
  catalogCategory: string;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
};

/** Japan_Overview.xlsx R2 列顺序（col 1–22） */
export const JAPAN_OVERVIEW_SERIES: readonly JapanOverviewSeriesDef[] = [
  {
    columnIndex: 1,
    displayName: "东京日经225指数",
    code: "jpov_c01_nikkei225",
    panel: 1,
    catalogCategory: "证券市场",
    axis: "right",
    chartType: "line",
    color: "#5f76b8",
  },
  {
    columnIndex: 2,
    displayName: "GDP:现价",
    code: "jpov_c02_gdp_nominal",
    panel: 1,
    catalogCategory: "国民经济核算",
    axis: "right",
    chartType: "line",
    color: "#9f8fc7",
  },
  {
    columnIndex: 3,
    displayName: "GDP:不变价:当季同比",
    code: "jpov_c03_gdp_real_yoy_q",
    panel: 1,
    catalogCategory: "国民经济核算",
    axis: "left",
    chartType: "line",
    color: "#f39c3d",
  },
  {
    columnIndex: 4,
    displayName: "GDP:现价:当季同比",
    code: "jpov_c04_gdp_nom_yoy_q",
    panel: 1,
    catalogCategory: "国民经济核算",
    axis: "left",
    chartType: "line",
    color: "#2aa7b8",
  },
  {
    columnIndex: 5,
    displayName: "政策目标利率(基础货币)",
    code: "jpov_c05_boj_policy_rate",
    panel: 2,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#d75a68",
  },
  {
    columnIndex: 6,
    displayName: "国债利率:10年",
    code: "jpov_c06_jgb_10y",
    panel: 2,
    catalogCategory: "利率与债券",
    axis: "left",
    chartType: "line",
    color: "#f0d36d",
  },
  {
    columnIndex: 7,
    displayName: "国债利率:2年",
    code: "jpov_c07_jgb_2y",
    panel: 2,
    catalogCategory: "利率与债券",
    axis: "left",
    chartType: "line",
    color: "#9da8b6",
  },
  {
    columnIndex: 8,
    displayName: "国债利率:10年-2年",
    code: "jpov_c08_jgb_10y2y",
    panel: 2,
    catalogCategory: "利率与债券",
    axis: "left",
    chartType: "line",
    color: "#ef6461",
  },
  {
    columnIndex: 9,
    displayName: "CPI:当月同比",
    code: "jpov_c09_cpi_yoy",
    panel: 3,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "line",
    color: "#e3c44c",
  },
  {
    columnIndex: 10,
    displayName: "CPI:环比",
    code: "jpov_c10_cpi_mom",
    panel: null,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "dashedLine",
    color: "#a7b4c1",
  },
  {
    columnIndex: 11,
    displayName: "生产者价格指数:同比",
    code: "jpov_c11_ppi_yoy",
    panel: 3,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "line",
    color: "#66a090",
  },
  {
    columnIndex: 12,
    displayName: "生产者价格指数:环比",
    code: "jpov_c12_ppi_mom",
    panel: null,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "dashedLine",
    color: "#8fa2c5",
  },
  {
    columnIndex: 13,
    displayName: "经济观察家前景指数",
    code: "jpov_c13_economy_watch_outlook",
    panel: 6,
    catalogCategory: "景气调查",
    axis: "left",
    chartType: "line",
    color: "#56b6c2",
  },
  {
    columnIndex: 14,
    displayName: "经济观察家现况指数",
    code: "jpov_c14_economy_watch_current",
    panel: 6,
    catalogCategory: "景气调查",
    axis: "left",
    chartType: "line",
    color: "#67b36d",
  },
  {
    columnIndex: 15,
    displayName: "消费者信心指数:季调",
    code: "jpov_c15_consumer_conf_sa",
    panel: 6,
    catalogCategory: "景气调查",
    axis: "left",
    chartType: "line",
    color: "#3f4f86",
  },
  {
    columnIndex: 16,
    displayName: "平均余额:基础货币:同比",
    code: "jpov_c16_base_money_yoy",
    panel: 4,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#8e9bb2",
  },
  {
    columnIndex: 17,
    displayName: "平均余额:M1:同比",
    code: "jpov_c17_m1_yoy",
    panel: 4,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#d99545",
  },
  {
    columnIndex: 18,
    displayName: "平均余额:M2:同比",
    code: "jpov_c18_m2_yoy",
    panel: 4,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#8f79c4",
  },
  {
    columnIndex: 19,
    displayName: "日本央行:资产:总额:万亿",
    code: "jpov_c19_boj_assets_total",
    panel: 5,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#61dbe1",
  },
  {
    columnIndex: 20,
    displayName: "日本央行:资产:日本政府债券:万亿",
    code: "jpov_c20_boj_jgb_holdings",
    panel: 5,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#8f74c8",
  },
  {
    columnIndex: 21,
    displayName: "失业率:季调",
    code: "jpov_c21_unrate_sa",
    panel: 3,
    catalogCategory: "就业与工资",
    axis: "right",
    chartType: "line",
    color: "#f2cf67",
  },
  {
    columnIndex: 22,
    displayName: "占GDP比重:公共部门债务:一般政府",
    code: "jpov_c22_public_debt_gdp",
    panel: 5,
    catalogCategory: "财政",
    axis: "right",
    chartType: "line",
    color: "#d86a7a",
  },
] as const;

export const JAPAN_OVERVIEW_CHART_SERIES = JAPAN_OVERVIEW_SERIES.filter(
  (row): row is JapanOverviewSeriesDef & { panel: 1 | 2 | 3 | 4 | 5 | 6 } =>
    row.panel !== null,
);

export const JAPAN_OVERVIEW_BY_CODE = new Map(JAPAN_OVERVIEW_SERIES.map((row) => [row.code, row]));

export const JAPAN_OVERVIEW_BY_DISPLAY = new Map(
  JAPAN_OVERVIEW_SERIES.map((row) => [normalizeJapanOverviewName(row.displayName), row]),
);

export function normalizeJapanOverviewName(name: string): string {
  return name
    .trim()
    .replace(/[：:]/g, ":")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function japanOverviewMdsKey(code: string): string {
  return `mds:${code}`;
}

export function japanOverviewCodeFromMdsKey(key: string): string | null {
  if (!key.startsWith("mds:jpov_")) return null;
  return key.slice(4);
}

export function japanOverviewPanelFromCode(code: string): number {
  return JAPAN_OVERVIEW_BY_CODE.get(code)?.panel ?? 1;
}

export const JAPAN_OVERVIEW_CATEGORY_CODE_BY_NAME: Record<string, string> = {
  国民经济核算: "national_accounts",
  工业: "industry",
  价格指数: "price_index",
  就业与工资: "employment",
  银行与货币: "banking_money",
  利率与债券: "rates_bonds",
  证券市场: "securities",
  景气调查: "business_survey",
  国内贸易与消费: "domestic_trade",
  固定资产投资: "fixed_investment",
  固定资产与地产: "real_estate",
  对外贸易与汇率: "trade_fx",
  财政: "fiscal",
  综合: "general",
};

export const JAPAN_OVERVIEW_CATEGORY_SORT_BY_NAME: Record<string, number> = {
  国民经济核算: 10,
  工业: 20,
  价格指数: 30,
  就业与工资: 40,
  银行与货币: 50,
  利率与债券: 60,
  财政: 65,
  对外贸易与汇率: 70,
  国内贸易与消费: 80,
  固定资产投资: 90,
  固定资产与地产: 100,
  景气调查: 110,
  证券市场: 120,
  综合: 130,
};
