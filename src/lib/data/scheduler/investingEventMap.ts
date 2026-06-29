/**
 * @deprecated 请使用 teEventMap.ts（TradingEconomics 日历）
 */
export {
  TE_CALENDAR_BY_FRED as INVESTING_CALENDAR_BY_FRED,
  mergedTeCalendarByFred as mergedInvestingCalendarByFred,
  PROBE_ONLY_FRED_SERIES,
  type CalendarMatchSpec,
  subscriptionUsesCalendarSync,
  calendarSpecForSubscription,
  findNextCalendarRelease,
  teCountryCodesForSpec as countryIdsForSpec,
  collectCountryCodesFromSubscriptions,
} from "./teEventMap";
