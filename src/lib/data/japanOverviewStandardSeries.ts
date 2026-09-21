import type { MacroSeriesChartType } from "@/lib/macroChartOption";
import type { MacroDerivedCalc, MacroSeriesCalcConfig } from "@/lib/data/macroPresetTemplates";

/**
 * Japan_Overview xlsx 列 → 已接入的日本官方标准序列（2026-09-21）。
 *
 * 这些 jpov_* 是 xlsx 一次性导入、从未接网络源的拼接列，多数停在 2026-04/05；其中同比/环比/利差
 * 本就是二次指标（AGENTS.md「宏观数据库约束」）。项目里已有同口径的官方自动源，故模板改用
 * 标准基础序列 + 指标运算，旧列只隐藏不删（历史保留，见 retiredIndicators.ts）。
 *
 * 2015 年起逐月核对（旧列 vs 标准序列现算）：
 * - 基础货币/M1/M2 同比、企业物价同比/环比、失业率：几乎逐值相等（差 ≤0.05）；
 * - CPI 同比/环比：平均差 0.05（官方指数取整所致）；
 * - GDP 同比：平均差 ≈0.12（旧列为原值同比，标准序列为季调年率同比）；GDP 现价：旧列 = 年率 / 4；
 * - 景气观察者：平均差 ≈0.9（旧列为原数列，标准序列为季调）；
 * - 政策利率：旧列只记到 2025-12 的 0.75%，漏掉 2026 年加息；改用 BOJ 无担保隔夜拆借利率月均；
 * - 日本银行资产：旧列为旬报（万亿日元），标准序列为 BOJ 勘定月末（亿日元）。
 *
 * 不迁移：c01 日经 225（改由行情接口 ^N225 续接，历史与 Yahoo 585/585 逐日相等）、
 * c06/c07 国债利率（财务省源在更新）、c15 消费者信心（ESRI 源在更新）、c22 政府债务（IMF 年度）。
 */
export type JapanOverviewReplacement = { key: string; calc: MacroSeriesCalcConfig };

const NONE: MacroSeriesCalcConfig = { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
const YOY_MONTH: MacroSeriesCalcConfig = { op: "yoy", frequency: "month", unit: "keep", resampleMethod: "end" };
const YOY_QUARTER: MacroSeriesCalcConfig = { op: "yoy", frequency: "quarter", unit: "keep", resampleMethod: "end" };
const PCT_KEEP: MacroSeriesCalcConfig = { op: "pctChange", frequency: "keep", unit: "keep", resampleMethod: "end" };

export const JAPAN_OVERVIEW_SUPERSEDED: Readonly<Record<string, JapanOverviewReplacement>> = {
  jpov_c02_gdp_nominal: { key: "mds:esri_jp_gdp_gdp_nominal_saar", calc: NONE },
  jpov_c03_gdp_real_yoy_q: { key: "mds:esri_jp_gdp_gdp_real_saar::yoy", calc: YOY_QUARTER },
  jpov_c04_gdp_nom_yoy_q: { key: "mds:esri_jp_gdp_gdp_nominal_saar::yoy", calc: YOY_QUARTER },
  jpov_c05_boj_policy_rate: { key: "mds:boj_jp_uncollateralized_overnight_call_rate_monthly_average", calc: NONE },
  jpov_c09_cpi_yoy: { key: "mds:jp_estat_cpi_2025_national_all::yoy", calc: YOY_MONTH },
  jpov_c10_cpi_mom: { key: "mds:jp_estat_cpi_2025_national_all::pct", calc: PCT_KEEP },
  jpov_c11_ppi_yoy: { key: "mds:boj_jp_cgpi::yoy", calc: YOY_MONTH },
  jpov_c12_ppi_mom: { key: "mds:boj_jp_cgpi::pct", calc: PCT_KEEP },
  jpov_c13_economy_watch_outlook: { key: "mds:cao_jp_watchers_outlook_total_di_sa", calc: NONE },
  jpov_c14_economy_watch_current: { key: "mds:cao_jp_watchers_current_total_di_sa", calc: NONE },
  jpov_c16_base_money_yoy: { key: "mds:boj_jp_monetary_base::yoy", calc: YOY_MONTH },
  jpov_c17_m1_yoy: { key: "mds:boj_jp_m1::yoy", calc: YOY_MONTH },
  jpov_c18_m2_yoy: { key: "mds:boj_jp_m2::yoy", calc: YOY_MONTH },
  jpov_c19_boj_assets_total: { key: "mds:boj_jp_accounts_total_assets", calc: NONE },
  jpov_c20_boj_jgb_holdings: { key: "mds:boj_jp_accounts_jgs_holdings", calc: NONE },
  jpov_c21_unrate_sa: { key: "mds:jp_stat_lfs_unemployment_rate_sa", calc: NONE },
};

export type JapanOverviewStandardSeriesDef = {
  key: string;
  displayName: string;
  panel: 1 | 2 | 3 | 4 | 5 | 6;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
  calc: MacroSeriesCalcConfig;
};

/** 内置 Japan_Overview 模板里替代旧列的标准指标（图位/样式沿用原列；原不画的环比列不进模板） */
export const JAPAN_OVERVIEW_STANDARD_SERIES: readonly JapanOverviewStandardSeriesDef[] = [
  { key: "mds:esri_jp_gdp_gdp_nominal_saar", displayName: "GDP:名义季调年率", panel: 1, axis: "right", chartType: "line", color: "#9f8fc7", calc: NONE },
  { key: "mds:esri_jp_gdp_gdp_real_saar::yoy", displayName: "实际GDP 同比", panel: 1, axis: "left", chartType: "line", color: "#f39c3d", calc: YOY_QUARTER },
  { key: "mds:esri_jp_gdp_gdp_nominal_saar::yoy", displayName: "名义GDP 同比", panel: 1, axis: "left", chartType: "line", color: "#2aa7b8", calc: YOY_QUARTER },
  { key: "mds:boj_jp_uncollateralized_overnight_call_rate_monthly_average", displayName: "无担保隔夜拆借利率(月均)", panel: 2, axis: "left", chartType: "line", color: "#d75a68", calc: NONE },
  { key: "mds:jp_estat_cpi_2025_national_all::yoy", displayName: "CPI 同比", panel: 3, axis: "left", chartType: "line", color: "#e3c44c", calc: YOY_MONTH },
  { key: "mds:boj_jp_cgpi::yoy", displayName: "企业物价指数 同比", panel: 3, axis: "left", chartType: "line", color: "#66a090", calc: YOY_MONTH },
  { key: "mds:jp_stat_lfs_unemployment_rate_sa", displayName: "失业率:季调", panel: 3, axis: "right", chartType: "line", color: "#f2cf67", calc: NONE },
  { key: "mds:boj_jp_monetary_base::yoy", displayName: "基础货币 同比", panel: 4, axis: "left", chartType: "line", color: "#8e9bb2", calc: YOY_MONTH },
  { key: "mds:boj_jp_m1::yoy", displayName: "M1 同比", panel: 4, axis: "left", chartType: "line", color: "#d99545", calc: YOY_MONTH },
  { key: "mds:boj_jp_m2::yoy", displayName: "M2 同比", panel: 4, axis: "left", chartType: "line", color: "#8f79c4", calc: YOY_MONTH },
  { key: "mds:boj_jp_accounts_total_assets", displayName: "日本银行:资产总额", panel: 5, axis: "left", chartType: "line", color: "#61dbe1", calc: NONE },
  { key: "mds:boj_jp_accounts_jgs_holdings", displayName: "日本银行:持有日本政府证券", panel: 5, axis: "left", chartType: "line", color: "#8f74c8", calc: NONE },
  { key: "mds:cao_jp_watchers_outlook_total_di_sa", displayName: "景气观察者:先行判断DI(季调)", panel: 6, axis: "left", chartType: "line", color: "#56b6c2", calc: NONE },
  { key: "mds:cao_jp_watchers_current_total_di_sa", displayName: "景气观察者:现状判断DI(季调)", panel: 6, axis: "left", chartType: "line", color: "#67b36d", calc: NONE },
];

export const JAPAN_OVERVIEW_STANDARD_BY_KEY = new Map(JAPAN_OVERVIEW_STANDARD_SERIES.map((row) => [row.key, row]));

export type JapanOverviewDerivedDef = {
  calc: MacroDerivedCalc;
  panel: 1 | 2 | 3 | 4 | 5 | 6;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
};

/** 原 col 8「国债利率:10年-2年」改为指标运算，id 与 retiredIndicators.ts 一致 */
export const JAPAN_OVERVIEW_STANDARD_DERIVED: readonly JapanOverviewDerivedDef[] = [
  {
    calc: { id: "jpov-jgb-10y2y", name: "国债利率:10年-2年", op: "sub", leftKey: "mds:jpov_c06_jgb_10y", rightKey: "mds:jpov_c07_jgb_2y" },
    panel: 2, axis: "left", chartType: "line", color: "#ef6461",
  },
];
