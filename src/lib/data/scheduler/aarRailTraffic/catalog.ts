/** AAR 铁路装车量抓取——仪器与数据源常量（seed / sync / verify / adapter 共用） */

export const AAR_RAIL_TRAFFIC_SYNC_SCRIPT = "scripts/data-worker/sync-aar-rail-traffic.ts";

export const AAR_NEWS_ARCHIVE_URL = "https://www.aar.org/aar_news/weekly-rail-traffic-data/";
export const AAR_DATA_CENTER_URL = "https://www.aar.org/data-center/";

/** 每周新闻稿正文格式（regex 锚点）已核实自 2019-01 起稳定，早于此的归档标题格式不同，
 * 未核实其正文结构，回填深度上限定为 2019-01-01（如实记录，非页面限制而是解析置信度限制）。 */
export const AAR_RAIL_TRAFFIC_FIRST_WEEK_ENDING = "2019-01-01";

export type AarRailTrafficSeriesKey = "carloads" | "intermodal";

export type AarRailTrafficSeriesConfig = {
  seriesKey: AarRailTrafficSeriesKey;
  /** scrape.provider 分发用 */
  provider: "aar_rail_carloads" | "aar_rail_intermodal";
  instrumentCode: string;
  name: string;
  displayName: string;
  unit: string;
  freqLabel: "周";
  category: string;
  countryCode: "US";
  officialUrl: string;
  /** 值域校验（sanity check，宽松边界，只为拦截解析错误） */
  valueRange: readonly [number, number];
};

export const AAR_RAIL_TRAFFIC_SERIES: readonly AarRailTrafficSeriesConfig[] = [
  {
    seriesKey: "carloads",
    provider: "aar_rail_carloads",
    instrumentCode: "aar_us_rail_carloads_weekly",
    name: "AAR 美国铁路周度装车量（Carloads）",
    displayName: "AAR 美国铁路周度装车量",
    unit: "车",
    freqLabel: "周",
    category: "物流与出行",
    countryCode: "US",
    officialUrl: AAR_NEWS_ARCHIVE_URL,
    valueRange: [50_000, 500_000],
  },
  {
    seriesKey: "intermodal",
    provider: "aar_rail_intermodal",
    instrumentCode: "aar_us_rail_intermodal_weekly",
    name: "AAR 美国铁路周度多式联运量（Intermodal）",
    displayName: "AAR 美国铁路周度多式联运量",
    unit: "标准箱/挂车",
    freqLabel: "周",
    category: "物流与出行",
    countryCode: "US",
    officialUrl: AAR_NEWS_ARCHIVE_URL,
    valueRange: [50_000, 500_000],
  },
] as const;

export function aarRailTrafficSeriesByProvider(
  provider: string,
): AarRailTrafficSeriesConfig | undefined {
  return AAR_RAIL_TRAFFIC_SERIES.find((s) => s.provider === provider);
}

export function aarRailTrafficSeriesByCode(
  instrumentCode: string,
): AarRailTrafficSeriesConfig | undefined {
  return AAR_RAIL_TRAFFIC_SERIES.find((s) => s.instrumentCode === instrumentCode);
}

export const AAR_SOURCE = {
  id: "aar-rail-traffic",
  agencyId: "us-aar",
  nameZh: "美国铁路协会",
  nameEn: "Association of American Railroads",
  name: "AAR 美国铁路周度装车量/多式联运量",
  baseUrl: AAR_NEWS_ARCHIVE_URL,
  termsUrl: "https://www.aar.org/terms-of-use/",
  websiteUrl: "https://www.aar.org/",
} as const;
