export const JGB_PAGE = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm";
export const JGB_CURRENT = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv";
export const JGB_HISTORY = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv";
export const JGB_TERMS = "https://www.mof.go.jp/english/about_mof/notice/index.html";
export const JGB_TENORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40] as const;
export const JGB_SERIES = JGB_TENORS.map((years) => ({
  years,
  code: years === 2 ? "jpov_c07_jgb_2y" : years === 10 ? "jpov_c06_jgb_10y" : `mof_jp_jgb_${years}y`,
  name: `日本：国债固定期限收益率：${years}年`,
}));
