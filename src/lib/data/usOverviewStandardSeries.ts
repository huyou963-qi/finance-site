import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type { MacroDerivedCalc, MacroSeriesCalcConfig } from "@/lib/data/macroPresetTemplates";

/**
 * US_Overview 中不符合项目入库标准的 9 条 xlsx 序列已退役（2026-09-11）。
 *
 * 这些序列来源标注为「美国劳工部 / 美国经济分析局 / Wind」，是 xlsx 导入的月末日期预变换值，
 * 又被调度器挂上 FRED 原始订阅写入月初水平值，两套口径混存（新增非农被写成 ~15 万的水平值）。
 * 标准替代：复用已按 Agent B 流程入库的 `sched_fred_*`（`fred:<ID>[::变换]` 虚拟键 +
 * seriesCalcConfig 在图表侧计算），或新接入的 multpl 抓取序列；`null` 表示无标准替代，
 * 从模板中移除（3 月移动平均无对应计算算子，其源 UNRATE 已入库）。
 */
export type UsOverviewReplacement = {
  key: string;
  calc: MacroSeriesCalcConfig;
};

const NONE: MacroSeriesCalcConfig = { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
const YOY_MONTH: MacroSeriesCalcConfig = { op: "yoy", frequency: "month", unit: "keep", resampleMethod: "end" };
const DIFF_MONTH: MacroSeriesCalcConfig = { op: "diff", frequency: "month", unit: "keep", resampleMethod: "end" };
const PCT_KEEP: MacroSeriesCalcConfig = { op: "pctChange", frequency: "keep", unit: "keep", resampleMethod: "end" };

export const US_SP500_PE_CODE = "us_sp500_pe";

export const RETIRED_USOV_REPLACEMENTS: Readonly<Record<string, UsOverviewReplacement | null>> = {
  // 2026-09-11 第二批：日频 xlsx 收益率被挂上 FRED 月频 GS10/GS2 订阅（月初值混入日频、日值停在 2026-05）；
  // 改用日频 H.15 DGS10/DGS2。10年-2年按用户要求直接删除（不再单列期限利差）。
  usov_c07_gs10: { key: "fred:DGS10", calc: NONE },
  usov_c08_gs2: { key: "fred:DGS2", calc: NONE },
  usov_c09_10y2y: null,
  usov_c13_gdp_qoq_saar: { key: "fred:A191RL1Q225SBEA", calc: NONE },
  usov_c16_cpi_yoy: { key: "fred:CPIAUCSL::yoy", calc: YOY_MONTH },
  usov_c17_core_cpi_yoy: { key: "fred:CPILFESL::yoy", calc: YOY_MONTH },
  usov_c18_pce_yoy: { key: "fred:PCEPI::yoy", calc: YOY_MONTH },
  usov_c19_core_pce_yoy: { key: "fred:PCEPILFE::yoy", calc: YOY_MONTH },
  usov_c20_unrate_sa: { key: "fred:UNRATE", calc: NONE },
  usov_c21_unrate_sa_3mma: null,
  usov_c22_nfp: { key: "fred:PAYEMS::diff", calc: DIFF_MONTH },
  usov_c28_sp500_pe: { key: `mds:${US_SP500_PE_CODE}`, calc: NONE },
};

export const RETIRED_USOV_CODES = Object.keys(RETIRED_USOV_REPLACEMENTS);

export type UsOverviewStandardSeriesDef = {
  key: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4 | 5 | 6;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calc: MacroSeriesCalcConfig;
};

/** 内置 US_Overview 模板中替代退役 xlsx 序列的标准指标（图位/样式沿用原列） */
export const US_OVERVIEW_STANDARD_SERIES: readonly UsOverviewStandardSeriesDef[] = [
  { key: "fred:DGS10", displayName: "10Y 国债收益率", panel: 2, axis: "right", chartType: "line", color: "#f0d36d", calc: NONE },
  { key: "fred:DGS2", displayName: "2Y 国债收益率", panel: 2, axis: "right", chartType: "line", color: "#9da8b6", calc: NONE },
  { key: "fred:A191RL1Q225SBEA", displayName: "实际GDP环比折年率", panel: 3, axis: "left", chartType: "line", color: "#f1cd57", calc: NONE },
  { key: "fred:UNRATE", displayName: "失业率", panel: 4, axis: "right", chartType: "line", color: "#f2cf67", calc: NONE },
  { key: "fred:PAYEMS::diff", displayName: "新增非农就业人数", panel: 4, axis: "left", chartType: "bar", color: "#9ea68b", calc: DIFF_MONTH },
  { key: "fred:CPIAUCSL::yoy", displayName: "CPI 同比", panel: 5, axis: "left", chartType: "line", color: "#a7b4c1", calc: YOY_MONTH },
  { key: "fred:CPILFESL::yoy", displayName: "核心CPI 同比", panel: 5, axis: "left", chartType: "line", color: "#5f76b8", calc: YOY_MONTH },
  { key: "fred:PCEPI::yoy", displayName: "PCE 同比", panel: 5, axis: "left", chartType: "line", color: "#d89b4e", calc: YOY_MONTH },
  { key: "fred:PCEPILFE::yoy", displayName: "核心PCE 同比", panel: 5, axis: "left", chartType: "dashedLine", color: "#7fc8c5", calc: YOY_MONTH },
  { key: `mds:${US_SP500_PE_CODE}`, displayName: "标普500市盈率", panel: 1, axis: "right", chartType: "line", color: "#5f76b8", calc: NONE },
  // 原计算型列 c25「持有国债环比增加」→ 基础序列 c24 + 指标运算环比%
  { key: "mds:usov_c24_fed_treasuries::pct", displayName: "持有国债 环比%", panel: 6, axis: "left", chartType: "line", color: "#8f9bab", calc: PCT_KEEP },
];

export const US_OVERVIEW_STANDARD_BY_KEY = new Map(US_OVERVIEW_STANDARD_SERIES.map((row) => [row.key, row]));

export type UsOverviewDerivedDef = {
  calc: MacroDerivedCalc;
  panel: 1 | 2 | 3 | 4 | 5 | 6;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
};

/** 原 xlsx 计算型列（SPX/GLD、2年-EFFR、Fed 净流动性）改为指标运算，id 与 retiredIndicators.ts 一致 */
export const US_OVERVIEW_STANDARD_DERIVED: readonly UsOverviewDerivedDef[] = [
  {
    calc: { id: "usov-spx-gld", name: "SPX/GLD", op: "div", leftKey: "mds:usov_c03_sp500", rightKey: "mds:usov_c05_comex_gold" },
    panel: 1, axis: "left", chartType: "line", color: "#f2cf67",
  },
  {
    calc: { id: "usov-fed-net-liquidity", name: "Fed Net Liquidity", op: "sub", leftKey: "mds:usov_c23_fed_assets", rightKey: "mds:usov_c24_fed_treasuries" },
    panel: 1, axis: "left", chartType: "line", color: "#61dbe1",
  },
  {
    calc: { id: "usov-2y-effr", name: "2年-EFFR", op: "sub", leftKey: "fred:DGS2", rightKey: "mds:usov_c11_effr" },
    panel: 2, axis: "left", chartType: "line", color: "#d75a68",
  },
];

