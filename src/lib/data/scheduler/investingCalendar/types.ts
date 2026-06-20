/** Investing.com 经济日历单条发布事件（解析后） */
export type EconomicCalendarEvent = {
  eventId: string;
  title: string;
  countryCode: string | null;
  /** 官方计划发布时间（UTC） */
  releaseAt: Date;
  importance: number | null;
  currency: string | null;
};

export type FetchCalendarOptions = {
  dateFrom: Date;
  dateTo: Date;
  /** Investing.com country id，如 US=5 */
  countryIds?: number[];
  timeZone?: number;
};

export type FetchCalendarResult = {
  events: EconomicCalendarEvent[];
  source: "investing_filtered" | "investing_ssl" | "empty";
  warning?: string;
};
