/** US_Overview 序列 code → FRED series_id（探测与后续订阅用） */
export const USOV_FRED_SERIES_BY_CODE: Record<string, string> = {
  usov_c01_nasdaq: "NASDAQCOM",
  usov_c02_dow: "DJIA",
  usov_c03_sp500: "SP500",
  // c05 COMEX 黄金改由 Yahoo GC=F 更新（FRED GOLDAMGBD228NLBM 已下架，HTTP 400）；
  // c07–c09 已退役（日频 xlsx 被挂月频 GS10/GS2），见 usOverviewStandardSeries.ts。
  usov_c06_wti: "DCOILWTICO",
  usov_c10_fedfunds_target: "DFEDTARU",
  usov_c11_effr: "EFFR",
  // c13/c16–c22 已退役（见 usOverviewStandardSeries.ts）：xlsx 预变换值与 FRED 水平值混存，
  // 2026-09-04 香港生产新增非农被写成水平值。标准指标直接用 sched_fred_*，勿再映射。
  usov_c23_fed_assets: "WALCL",
  usov_c24_fed_treasuries: "TREAST",
};

/** Phase 5：补全 Phase 2 未映射的 usov 直拉 FRED 序列（原 c13 GDP 已退役，改用 sched_fred_A191RL1Q225SBEA） */
export const USOV_FRED_PHASE5_EXTRA: Record<string, string> = {};

export function mergedUsovFredMap(): Record<string, string> {
  return { ...USOV_FRED_SERIES_BY_CODE, ...USOV_FRED_PHASE5_EXTRA };
}
