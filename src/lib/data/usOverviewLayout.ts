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
  // col 4 SPX/GLD、12 2年-EFFR、25–27 国债环比/MA4/净流动性为计算型二次指标，已退役（retiredIndicators.ts）。
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
  // col 7–9（10年/2年国债收益率、10年-2年）已退役，由日频 fred:DGS10 / fred:DGS2 替代。
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
  // col 13/16–22/28（GDP、CPI/PCE 同比、失业率、新增非农、标普500 PE）已退役，
  // 由 usOverviewStandardSeries.ts 的标准指标替代；xlsx 重导入不再恢复这些列。
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
  return h === d;
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
