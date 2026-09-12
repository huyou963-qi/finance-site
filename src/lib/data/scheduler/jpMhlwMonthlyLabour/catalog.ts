export const JP_MHLW_MONTHLY_LABOUR_PROVIDER = "jp_mhlw_monthly_labour";
export const JP_MHLW_MONTHLY_LABOUR_SOURCE_ID = "jp-mhlw-monthly-labour";
export const JP_MHLW_MONTHLY_LABOUR_PACKAGE_ID = "jp.mhlw.monthly_labour";

export const JP_MHLW_MONTHLY_LABOUR_LIST_URL =
  "https://www.e-stat.go.jp/stat-search/files?cycle=0&layout=datalist&page=1&tclass1=000001035519&tclass2=000001144287&tclass3val=0&toukei=00450071&tstat=000001011791";

export const JP_MHLW_MONTHLY_LABOUR_SERIES = [
  {
    instrumentCode: "mhlw_jp_mls_total_cash_earnings_index",
    tableNo: "7",
    tableTitle: "現金給与総額　指数及び増減率－就業形態計（５人以上）",
    sourceTitle: "賃金指数(Wage indices)　現金給与総額(Total cash earnings)",
    label: "每月勤劳统计：现金工资总额指数",
    statInfIdAtOnboarding: "000032189720",
  },
  {
    instrumentCode: "mhlw_jp_mls_scheduled_cash_earnings_index",
    tableNo: "19",
    tableTitle: "所定内給与　指数及び増減率－就業形態計（５人以上）",
    sourceTitle: "賃金指数(Wage indices)　所定内給与(Scheduled cash earnings)",
    label: "每月勤劳统计：所定内工资指数",
    statInfIdAtOnboarding: "000032189732",
  },
  {
    instrumentCode: "mhlw_jp_mls_real_total_cash_earnings_index_cpi_all",
    tableNo: "25-2",
    tableTitle:
      "実質賃金（現金給与総額） 指数及び増減率－就業形態計（５人以上）（調査産業計）－消費者物価指数（総合）による",
    sourceTitle:
      "実質賃金指数(Real wage indices)　現金給与総額(Total cash earnings)　消費者物価指数（総合）による(Deflated by CPI for All items)",
    label: "每月勤劳统计：实际现金工资总额指数（CPI总项平减）",
    statInfIdAtOnboarding: "000040277106",
  },
  {
    instrumentCode: "mhlw_jp_mls_total_hours_index",
    tableNo: "29",
    tableTitle: "総実労働時間　指数及び増減率－就業形態計（５人以上）",
    sourceTitle: "労働時間指数(Hours worked indices)　総実労働時間(Total hours worked)",
    label: "每月勤劳统计：总实际工时指数",
    statInfIdAtOnboarding: "000032189742",
  },
  {
    instrumentCode: "mhlw_jp_mls_overtime_hours_index",
    tableNo: "41",
    tableTitle: "所定外労働時間　指数及び増減率－就業形態計（５人以上）",
    sourceTitle:
      "労働時間指数(Hours worked indices)　所定外労働時間(Non-scheduled hours worked)",
    label: "每月勤劳统计：加班工时指数",
    statInfIdAtOnboarding: "000032189754",
  },
  {
    instrumentCode: "mhlw_jp_mls_regular_employment_index",
    tableNo: "1",
    tableTitle: "常用雇用　指数及び増減率－就業形態計（５人以上）",
    sourceTitle: "常用雇用指数(Regular employment indices)",
    label: "每月勤劳统计：常用雇员指数",
    statInfIdAtOnboarding: "000032189714",
  },
] as const;

export type JpMhlwMonthlyLabourSeries =
  (typeof JP_MHLW_MONTHLY_LABOUR_SERIES)[number];

export function jpMhlwMonthlyLabourSeriesByCode(code: string) {
  return JP_MHLW_MONTHLY_LABOUR_SERIES.find((series) => series.instrumentCode === code);
}

export function jpMhlwMonthlyLabourDownloadUrl(statInfId: string) {
  if (!/^\d{12}$/.test(statInfId)) throw new Error(`invalid e-Stat statInfId: ${statInfId}`);
  return `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${statInfId}&fileKind=4`;
}
