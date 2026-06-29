/** 经济日历单条发布事件（解析后，源无关） */
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
  /** ISO 3166-1 alpha-2，如 US、JP */
  countryCodes?: string[];
};

export type FetchCalendarResult = {
  events: EconomicCalendarEvent[];
  source: string;
  warning?: string;
};
