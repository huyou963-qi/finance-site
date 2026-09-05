/** TSA 安检出行人数抓取——仪器与数据源常量（seed / sync / verify / adapter 共用） */

export const TSA_PASSENGER_VOLUMES_SYNC_SCRIPT =
  "scripts/data-worker/sync-tsa-passenger-volumes.ts";

/** 官方页面无历史下载接口，回填深度以现存最早年度归档页为界（2019） */
export const TSA_PASSENGER_VOLUMES_FIRST_YEAR = 2019;

export const TSA_PASSENGER_VOLUMES_INSTRUMENT = {
  code: "tsa_checkpoint_travelers",
  name: "TSA 安检口日度旅客通过人数",
  displayName: "TSA 安检口日度旅客通过人数",
  unit: "人",
  freqLabel: "日",
  category: "物流与出行",
  countryCode: "US" as const,
} as const;

export const TSA_SOURCE = {
  id: "tsa-passenger-volumes",
  agencyId: "us-tsa",
  nameZh: "美国运输安全管理局",
  nameEn: "Transportation Security Administration",
  name: "TSA 安检口旅客通过量",
  baseUrl: "https://www.tsa.gov/travel/passenger-volumes",
  termsUrl: "https://www.tsa.gov/website-policies",
  websiteUrl: "https://www.tsa.gov/",
} as const;

/** 当年页面 URL（滚动窗口，M-F 上午 9 点前更新）；历史年度归档页 URL 模式一致，只加 /{year} */
export function tsaPassengerVolumesUrlForYear(year: number, currentYear: number): string {
  return year >= currentYear
    ? TSA_SOURCE.baseUrl
    : `${TSA_SOURCE.baseUrl}/${year}`;
}
