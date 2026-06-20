/** US_Overview 序列 code → FRED series_id（探测与后续订阅用） */
export const USOV_FRED_SERIES_BY_CODE: Record<string, string> = {
  usov_c01_nasdaq: "NASDAQCOM",
  usov_c02_dow: "DJIA",
  usov_c03_sp500: "SP500",
  usov_c05_comex_gold: "GOLDAMGBD228NLBM",
  usov_c06_wti: "DCOILWTICO",
  usov_c07_gs10: "GS10",
  usov_c08_gs2: "GS2",
  usov_c09_10y2y: "T10Y2Y",
  usov_c10_fedfunds_target: "DFEDTARU",
  usov_c11_effr: "EFFR",
  usov_c16_cpi_yoy: "CPIAUCSL",
  usov_c17_core_cpi_yoy: "CPILFESL",
  usov_c18_pce_yoy: "PCEPI",
  usov_c19_core_pce_yoy: "PCEPILFE",
  usov_c20_unrate_sa: "UNRATE",
  usov_c21_unrate_sa_3mma: "UNRATE",
  usov_c22_nfp: "PAYEMS",
  usov_c23_fed_assets: "WALCL",
  usov_c24_fed_treasuries: "TREAST",
};

/** Phase 5：补全 Phase 2 未映射的 usov 直拉 FRED 序列 */
export const USOV_FRED_PHASE5_EXTRA: Record<string, string> = {
  usov_c13_gdp_qoq_saar: "A191RL1Q225SBEA",
  usov_c15_ism_mfg_pmi: "NAPM",
};

export function mergedUsovFredMap(): Record<string, string> {
  return { ...USOV_FRED_SERIES_BY_CODE, ...USOV_FRED_PHASE5_EXTRA };
}
