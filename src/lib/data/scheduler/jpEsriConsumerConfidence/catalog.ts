export const JP_ESRI_CONSUMER_CONFIDENCE_PROVIDER = "jp_esri_consumer_confidence";
export const JP_ESRI_CONSUMER_CONFIDENCE_SOURCE_ID = "jp-esri-consumer-confidence";
export const JP_ESRI_CONSUMER_CONFIDENCE_PACKAGE_ID = "jp.esri.consumer_confidence";

export const JP_ESRI_CONSUMER_CONFIDENCE_PAGE_URL =
  "https://www.esri.cao.go.jp/en/stat/shouhi/shouhi-e.html";
export const JP_ESRI_CONSUMER_CONFIDENCE_FILE_URL =
  "https://www.esri.cao.go.jp/en/stat/shouhi/shouhi2.xlsx";
export const JP_ESRI_RELEASE_SCHEDULE_URL =
  "https://www.esri.cao.go.jp/en/stat/stat-schedule-e.html";

/**
 * Official seasonally adjusted levels for households of two or more persons.
 * Month-over-month change columns are deliberately excluded: they are derived
 * from the level series and belong in chart calculations rather than storage.
 */
export const JP_ESRI_CONSUMER_CONFIDENCE_SERIES = [
  {
    instrumentCode: "jpov_c15_consumer_conf_sa",
    column: 4,
    label: "消费者态度指数（季调、二人以上家庭）",
  },
  {
    instrumentCode: "esri_jp_consumer_conf_livelihood_sa",
    column: 6,
    label: "消费者意识：生活状况（季调、二人以上家庭）",
  },
  {
    instrumentCode: "esri_jp_consumer_conf_income_growth_sa",
    column: 8,
    label: "消费者意识：收入增长（季调、二人以上家庭）",
  },
  {
    instrumentCode: "esri_jp_consumer_conf_employment_sa",
    column: 10,
    label: "消费者意识：就业环境（季调、二人以上家庭）",
  },
  {
    instrumentCode: "esri_jp_consumer_conf_durable_goods_sa",
    column: 12,
    label: "消费者意识：耐用品购买时机（季调、二人以上家庭）",
  },
] as const;

export type JpEsriConsumerConfidenceSeries =
  (typeof JP_ESRI_CONSUMER_CONFIDENCE_SERIES)[number];

export function jpEsriConsumerConfidenceSeriesByCode(code: string) {
  return JP_ESRI_CONSUMER_CONFIDENCE_SERIES.find(
    (series) => series.instrumentCode === code,
  );
}
