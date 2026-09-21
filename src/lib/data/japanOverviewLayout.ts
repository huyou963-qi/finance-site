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

/**
 * Japan_Overview.xlsx R2 列顺序（col 1–22）。
 * col 2–5、8–14、16–21 已被日本官方标准序列取代（历史保留、目录隐藏），见 japanOverviewStandardSeries.ts。
 */
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
