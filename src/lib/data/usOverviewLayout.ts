import type { MacroSeriesChartType } from "@/lib/macroChartOption";

export type UsOverviewSeriesDef = {
  columnIndex: number;
  displayName: string;
  code: string;
  panel: 1 | 2 | 3 | 4 | 5 | 6;
  catalogCategory: string;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
};

/** US_Overview.xlsx R2 列顺序（col 1–28，无空列） */
export const US_OVERVIEW_SERIES: readonly UsOverviewSeriesDef[] = [
  {
    columnIndex: 1,
    displayName: "纳斯达克综合指数",
    code: "usov_c01_nasdaq",
    panel: 1,
    catalogCategory: "证券市场",
    axis: "right",
    chartType: "line",
    color: "#5f76b8",
  },
  {
    columnIndex: 2,
    displayName: "道琼斯工业平均指数",
    code: "usov_c02_dow",
    panel: 1,
    catalogCategory: "证券市场",
    axis: "right",
    chartType: "line",
    color: "#ef6461",
  },
  {
    columnIndex: 3,
    displayName: "标准普尔500指数",
    code: "usov_c03_sp500",
    panel: 1,
    catalogCategory: "证券市场",
    axis: "right",
    chartType: "line",
    color: "#5f76b8",
  },
  {
    columnIndex: 4,
    displayName: "SPX/GLD",
    code: "usov_c04_spx_gld",
    panel: 1,
    catalogCategory: "证券市场",
    axis: "left",
    chartType: "line",
    color: "#f2cf67",
  },
  {
    columnIndex: 5,
    displayName: "期货收盘价(连续):COMEX黄金",
    code: "usov_c05_comex_gold",
    panel: 1,
    catalogCategory: "综合",
    axis: "right",
    chartType: "line",
    color: "#d86a7a",
  },
  {
    columnIndex: 6,
    displayName: "期货结算价(连续):WTI原油",
    code: "usov_c06_wti",
    panel: 1,
    catalogCategory: "综合",
    axis: "right",
    chartType: "line",
    color: "#8f9bab",
  },
  {
    columnIndex: 7,
    displayName: "国债收益率:10年",
    code: "usov_c07_gs10",
    panel: 2,
    catalogCategory: "利率与债券",
    axis: "right",
    chartType: "line",
    color: "#f0d36d",
  },
  {
    columnIndex: 8,
    displayName: "国债收益率:2年",
    code: "usov_c08_gs2",
    panel: 2,
    catalogCategory: "利率与债券",
    axis: "right",
    chartType: "line",
    color: "#9da8b6",
  },
  {
    columnIndex: 9,
    displayName: "10年-2年",
    code: "usov_c09_10y2y",
    panel: 2,
    catalogCategory: "利率与债券",
    axis: "left",
    chartType: "line",
    color: "#d75a68",
  },
  {
    columnIndex: 10,
    displayName: "联邦基金目标利率",
    code: "usov_c10_fedfunds_target",
    panel: 2,
    catalogCategory: "银行与货币",
    axis: "right",
    chartType: "line",
    color: "#6f84c0",
  },
  {
    columnIndex: 11,
    displayName: "有效联邦基金利率(EFFR)",
    code: "usov_c11_effr",
    panel: 2,
    catalogCategory: "银行与货币",
    axis: "right",
    chartType: "line",
    color: "#4bc0c8",
  },
  {
    columnIndex: 12,
    displayName: "2年-EFFR",
    code: "usov_c12_2y_effr",
    panel: 2,
    catalogCategory: "利率与债券",
    axis: "left",
    chartType: "line",
    color: "#d75a68",
  },
  {
    columnIndex: 13,
    displayName: "GDP:不变价:季调:环比折年率",
    code: "usov_c13_gdp_qoq_saar",
    panel: 3,
    catalogCategory: "国民经济核算",
    axis: "left",
    chartType: "line",
    color: "#f1cd57",
  },
  {
    columnIndex: 14,
    displayName: "ISM:非制造业PMI",
    code: "usov_c14_ism_nm_pmi",
    panel: 3,
    catalogCategory: "景气调查",
    axis: "right",
    chartType: "line",
    color: "#56b6c2",
  },
  {
    columnIndex: 15,
    displayName: "供应管理协会(ISM):制造业PMI",
    code: "usov_c15_ism_mfg_pmi",
    panel: 3,
    catalogCategory: "景气调查",
    axis: "right",
    chartType: "line",
    color: "#56b6c2",
  },
  {
    columnIndex: 16,
    displayName: "CPI:同比",
    code: "usov_c16_cpi_yoy",
    panel: 5,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "line",
    color: "#a7b4c1",
  },
  {
    columnIndex: 17,
    displayName: "核心CPI:同比",
    code: "usov_c17_core_cpi_yoy",
    panel: 5,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "line",
    color: "#5f76b8",
  },
  {
    columnIndex: 18,
    displayName: "PCE:当月同比",
    code: "usov_c18_pce_yoy",
    panel: 5,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "line",
    color: "#d89b4e",
  },
  {
    columnIndex: 19,
    displayName: "核心PCE:当月同比",
    code: "usov_c19_core_pce_yoy",
    panel: 5,
    catalogCategory: "价格指数",
    axis: "left",
    chartType: "dashedLine",
    color: "#7fc8c5",
  },
  {
    columnIndex: 20,
    displayName: "失业率:季调",
    code: "usov_c20_unrate_sa",
    panel: 4,
    catalogCategory: "就业与工资",
    axis: "right",
    chartType: "line",
    color: "#f2cf67",
  },
  {
    columnIndex: 21,
    displayName: "失业率:季调:3月移动平均:算术平均",
    code: "usov_c21_unrate_sa_3mma",
    panel: 4,
    catalogCategory: "就业与工资",
    axis: "right",
    chartType: "line",
    color: "#d86a7a",
  },
  {
    columnIndex: 22,
    displayName: "新增非农就业人数:初值",
    code: "usov_c22_nfp",
    panel: 4,
    catalogCategory: "就业与工资",
    axis: "left",
    chartType: "line",
    color: "#9ea68b",
  },
  {
    columnIndex: 23,
    displayName: "所有联储银行:资产:总资产",
    code: "usov_c23_fed_assets",
    panel: 1,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#61dbe1",
  },
  {
    columnIndex: 24,
    displayName: "所有联储银行:资产:持有证券:美国国债",
    code: "usov_c24_fed_treasuries",
    panel: 6,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#8f74c8",
  },
  {
    columnIndex: 25,
    displayName: "持有证券:美国国债:环比增加",
    code: "usov_c25_fed_treasuries_wow",
    panel: 6,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#8f9bab",
  },
  {
    columnIndex: 26,
    displayName: "持有证券:美国国债:环比增加:MA4",
    code: "usov_c26_fed_treasuries_wow_ma4",
    panel: 6,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#6bcad1",
  },
  {
    columnIndex: 27,
    displayName: "Fed Net Liqudity",
    code: "usov_c27_fed_net_liquidity",
    panel: 1,
    catalogCategory: "银行与货币",
    axis: "left",
    chartType: "line",
    color: "#61dbe1",
  },
  {
    columnIndex: 28,
    displayName: "市盈率:标普500",
    code: "usov_c28_sp500_pe",
    panel: 1,
    catalogCategory: "证券市场",
    axis: "right",
    chartType: "line",
    color: "#5f76b8",
  },
] as const;

export const US_OVERVIEW_BY_CODE = new Map(US_OVERVIEW_SERIES.map((row) => [row.code, row]));

export const US_OVERVIEW_BY_DISPLAY = new Map(
  US_OVERVIEW_SERIES.map((row) => [normalizeUsOverviewName(row.displayName), row]),
);

export function normalizeUsOverviewName(name: string): string {
  return name
    .trim()
    .replace(/[：:]/g, ":")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 兼容 xlsx 中的拼写差异 */
export function matchUsOverviewHeader(headerName: string, def: UsOverviewSeriesDef): boolean {
  const h = normalizeUsOverviewName(headerName);
  const d = normalizeUsOverviewName(def.displayName);
  if (h === d) return true;
  if (def.code === "usov_c27_fed_net_liquidity") {
    return /fednetliq/i.test(h.replace(/[^a-z0-9]/gi, ""));
  }
  return false;
}

export function usOverviewMdsKey(code: string): string {
  return `mds:${code}`;
}

export function usOverviewCodeFromMdsKey(key: string): string | null {
  if (!key.startsWith("mds:usov_")) return null;
  return key.slice(4);
}

export function usOverviewPanelFromCode(code: string): number {
  return US_OVERVIEW_BY_CODE.get(code)?.panel ?? 1;
}

export const US_OVERVIEW_CATEGORY_CODE_BY_NAME: Record<string, string> = {
  国民经济核算: "national_accounts",
  工业: "industry",
  价格指数: "price_index",
  就业与工资: "employment",
  银行与货币: "banking_money",
  利率与债券: "rates_bonds",
  证券市场: "securities",
  景气调查: "business_survey",
  国内贸易与消费: "domestic_trade",
  固定资产与地产: "real_estate",
  对外贸易与汇率: "trade_fx",
  综合: "general",
};

export const US_OVERVIEW_CATEGORY_SORT_BY_NAME: Record<string, number> = {
  国民经济核算: 10,
  工业: 20,
  价格指数: 30,
  就业与工资: 40,
  银行与货币: 50,
  利率与债券: 60,
  对外贸易与汇率: 70,
  国内贸易与消费: 80,
  固定资产与地产: 90,
  景气调查: 100,
  证券市场: 110,
  综合: 120,
};
