export const JP_JNTO_VISITOR_ARRIVALS_PAGE_URL =
  "https://www.jnto.go.jp/statistics/data/visitors-statistics/";

export const JP_JNTO_VISITOR_ARRIVALS_SCHEDULE_URL =
  "https://www.jnto.go.jp/statistics/data/20260617.pdf";

export const JP_JNTO_VISITOR_ARRIVALS_PROVIDER = "jp_jnto_visitor_arrivals";
export const JP_JNTO_VISITOR_ARRIVALS_SOURCE_ID = "jp-jnto-visitor-arrivals";
export const JP_JNTO_VISITOR_ARRIVALS_PACKAGE_ID = "jp.jnto.visitor_arrivals";
export const JP_JNTO_VISITOR_ARRIVALS_SYNC_SCRIPT =
  "scripts/data-worker/sync-jp-jnto-visitor-arrivals.ts";

export const JP_JNTO_NEXT_PUBLISHED_RELEASE_AT = "2026-09-16T07:15:00.000Z";

export type JpJntoVisitorArrivalsSeries = {
  key: string;
  instrumentCode: string;
  label: string;
  sourceRowLabel: string;
};

/**
 * The first JNTO macro batch keeps the headline and five strategically relevant
 * nationality markets. The source defines these as nationality, not country of
 * departure. Workbook year-over-year columns are formula-derived and excluded.
 */
export const JP_JNTO_VISITOR_ARRIVALS_SERIES: readonly JpJntoVisitorArrivalsSeries[] = [
  {
    key: "total",
    instrumentCode: "jnto_jp_visitor_arrivals_total",
    label: "访日外客人数：总数",
    sourceRowLabel: "総数",
  },
  {
    key: "south_korea",
    instrumentCode: "jnto_jp_visitor_arrivals_south_korea",
    label: "访日外客人数：韩国籍",
    sourceRowLabel: "韓国",
  },
  {
    key: "china",
    instrumentCode: "jnto_jp_visitor_arrivals_china",
    label: "访日外客人数：中国籍",
    sourceRowLabel: "中国",
  },
  {
    key: "taiwan",
    instrumentCode: "jnto_jp_visitor_arrivals_taiwan",
    label: "访日外客人数：台湾",
    sourceRowLabel: "台湾",
  },
  {
    key: "hong_kong",
    instrumentCode: "jnto_jp_visitor_arrivals_hong_kong",
    label: "访日外客人数：香港",
    sourceRowLabel: "香港",
  },
  {
    key: "united_states",
    instrumentCode: "jnto_jp_visitor_arrivals_united_states",
    label: "访日外客人数：美国籍",
    sourceRowLabel: "米国",
  },
] as const;

export const JP_JNTO_VISITOR_ARRIVALS_HISTORY_START = "2003-01-01";

