export const JP_CYCLE_LABOR_SOURCE_ID = "jp-cycle-labor-official";
export const JP_CYCLE_LABOR_PACKAGE_ID = "jp.cycle_labor.monthly";

export const JP_ESRI_CI_URL = "https://www.esri.cao.go.jp/en/stat/di/di-e.html";
export const JP_ESRI_CI_FILE_URL = "https://www.esri.cao.go.jp/jp/stat/di/0907ci.xlsx";
export const JP_LFS_SA_URL = "https://www.stat.go.jp/data/roudou/2.html";
export const JP_LFS_SA_FILE_URL = "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000031831358&fileKind=0";
export const JP_JOB_RATIO_URL = "https://www.mhlw.go.jp/toukei/list/114-1.html";
export const JP_JOB_RATIO_FILE_URL = "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040492553&fileKind=0";

export const JP_CYCLE_LABOR_SERIES = [
  { instrumentCode: "esri_jp_ci_leading", source: "ci", column: 3, label: "景气动向指数：先行CI（2020=100）", unit: "指数", category: "国民经济", subgroup: "景气循环" },
  { instrumentCode: "esri_jp_ci_coincident", source: "ci", column: 4, label: "景气动向指数：一致CI（2020=100）", unit: "指数", category: "国民经济", subgroup: "景气循环" },
  { instrumentCode: "esri_jp_ci_lagging", source: "ci", column: 5, label: "景气动向指数：滞后CI（2020=100）", unit: "指数", category: "国民经济", subgroup: "景气循环" },
  { instrumentCode: "jp_stat_lfs_unemployment_rate_sa", source: "unemployment", column: 19, label: "完全失业率（全国、季调）", unit: "%", category: "人口与就业", subgroup: "劳动力市场" },
  { instrumentCode: "jp_mhlw_active_job_openings_ratio_sa", source: "jobRatio", column: 20, label: "有效求人倍率（全国、含兼职、季调）", unit: "倍", category: "人口与就业", subgroup: "劳动力市场" },
] as const;

export type JpCycleLaborSeries = (typeof JP_CYCLE_LABOR_SERIES)[number];

export function buildJpCycleLaborMetadata(series: JpCycleLaborSeries) {
  const source = series.source === "ci"
    ? { name: "日本内阁府经济社会综合研究所（ESRI）", url: JP_ESRI_CI_URL, file: JP_ESRI_CI_FILE_URL }
    : series.source === "unemployment"
      ? { name: "日本总务省统计局 / e-Stat", url: JP_LFS_SA_URL, file: JP_LFS_SA_FILE_URL }
      : { name: "日本厚生劳动省 / e-Stat", url: JP_JOB_RATIO_URL, file: JP_JOB_RATIO_FILE_URL };
  return {
    countryCode: "JP", countryNameZh: "日本", catalogKey: `mds:${series.instrumentCode}`,
    catalogCategory: series.category, catalogSubcategory: series.subgroup, catalogSubgroup: series.subgroup,
    displayName: series.label, sourceTag: "jp-cycle-labor", bootstrapOnly: false,
    source: source.name, officialUrl: source.url, sourceUrl: source.url, unit: series.unit,
    freqLabel: "月", seasonalAdjustment: "SA", geography: "日本全国",
    scrape: { provider: "jp_cycle_labor", series: series.source },
    fetchAcquisition: { status: "known", method: "official_xlsx", methodLabel: "官方长期时序 Excel", fetchUrl: source.file, officialUrl: source.url },
    sourceUpdateNote: "完整回读官方长期时序表以捕获修订。CI 使用内阁府已发布的 2020=100 复合指数；劳动力调查和求人倍率均只取全国、季调、总项。季调历史会被官方回溯修订，版本账本仅证明抓取时点可见，不代表历史首发 PIT。",
    attribution: `Source: ${source.name}. Chinese labels translated by finance-site.`,
  };
}
