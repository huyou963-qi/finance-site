/** Japan Tourism Agency (JTA) national tourism core.  No origin or prefecture splits. */
export const JP_TOURISM_CORE_PROVIDER = "jp_tourism_core";
export const JP_TOURISM_CORE_SYNC_SCRIPT = "scripts/data-worker/sync-jp-tourism-core.ts";

export const JP_JTA_INBOUND_CONSUMPTION_PAGE_URL =
  "https://www.mlit.go.jp/kankocho/tokei_hakusyo/gaikokujinshohidoko.html";
export const JP_JTA_ACCOMMODATION_PAGE_URL =
  "https://www.mlit.go.jp/kankocho/tokei_hakusyo/shukuhakutokei.html";
export const JP_JTA_RELEASE_CALENDAR_URL =
  "https://www.mlit.go.jp/kankocho/tokei_hakusyo/kohyoyoteibi.html";

export const JP_TOURISM_CORE_SERIES = [
  {
    instrumentCode: "jta_jp_inbound_travel_spending_total",
    sourceId: "jp-jta-inbound-consumption",
    packageId: "jp.jta.inbound_consumption",
    label: "访日外国人旅行消费额：总额",
    unit: "亿日元",
    frequency: "季",
    // The archive starts in 2019.  JTA did not publish standalone quarterly
    // result summaries through the pandemic interruption; the resumed run is
    // continuous from 2022 Q2.  Older annual charts are not spliced in.
    historyStart: "2019-01-01",
    category: "对外与汇率",
    subcategory: "入境旅游",
  },
  {
    instrumentCode: "jta_jp_foreign_guest_nights_total",
    sourceId: "jp-jta-accommodation-statistics",
    packageId: "jp.jta.accommodation_statistics",
    label: "外国人延泊数：全国",
    unit: "人泊",
    frequency: "月",
    historyStart: "2011-01-01",
    category: "对外与汇率",
    subcategory: "入境旅游",
  },
] as const;

export type JpTourismCoreSeries = (typeof JP_TOURISM_CORE_SERIES)[number];
