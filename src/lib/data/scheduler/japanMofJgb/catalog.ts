export const JGB_PAGE = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm";
export const JGB_CURRENT = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv";
export const JGB_HISTORY = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv";
export const JGB_TERMS = "https://www.mof.go.jp/english/about_mof/notice/index.html";
// Core curve nodes only. Intermediate maturities were retired on 2026-09-14.
export const JGB_TENORS = [2, 5, 10, 20, 30, 40] as const;
export const JGB_SERIES = JGB_TENORS.map((years) => ({
  years,
  code: years === 2 ? "jpov_c07_jgb_2y" : years === 10 ? "jpov_c06_jgb_10y" : `mof_jp_jgb_${years}y`,
  name: `日本：国债固定期限收益率：${years}年`,
}));
