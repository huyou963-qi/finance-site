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
 * The optimized core scope keeps the nationwide headline only. Nationality
 * breakdowns were retired on 2026-09-14. Workbook year-over-year columns are
 * formula-derived and excluded.
 */
export const JP_JNTO_VISITOR_ARRIVALS_SERIES: readonly JpJntoVisitorArrivalsSeries[] = [
  {
    key: "total",
    instrumentCode: "jnto_jp_visitor_arrivals_total",
    label: "访日外客人数：总数",
    sourceRowLabel: "総数",
  },
] as const;

export const JP_JNTO_VISITOR_ARRIVALS_HISTORY_START = "2003-01-01";
