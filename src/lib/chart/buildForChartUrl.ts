/**
 * 构建行情联动事件列表 URL（与 EventPanel / MarketsEventShelf 共用）。
 */
import {
  typeFamiliesToQueryPrefixes,
  type EventViewFilterState,
} from "@/lib/chart/eventViewFilters";

export function buildForChartUrl(
  symbol: string,
  rangeFrom: string,
  rangeTo: string,
  filters: EventViewFilterState,
): string {
  const sp = new URLSearchParams({
    symbol,
    from: rangeFrom,
    to: rangeTo,
    scopeMode: filters.scopeMode,
    includeSec: filters.includeSec ? "1" : "0",
    includeMarket: filters.includeMarket ? "1" : "0",
    minImportance: filters.minImportance,
    limit: "2000",
  });
  if (filters.assets.length) sp.set("assets", filters.assets.join(","));
  if (filters.industries.length)
    sp.set("industries", filters.industries.join(","));
  if (filters.countries.length)
    sp.set("countries", filters.countries.join(","));
  const types = typeFamiliesToQueryPrefixes(filters.typeFamilies);
  if (types?.length) sp.set("types", types.join(","));
  return `/api/events/for-chart?${sp.toString()}`;
}
