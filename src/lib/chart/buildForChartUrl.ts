/**
 * 构建行情联动事件列表 URL（与 EventPanel / MarketsEventShelf 共用）。
 */
import { ALL_EVENT_TYPE_FAMILY_IDS } from "@/lib/data/eventTaxonomy";
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
    largeSurpriseOnly: filters.largeSurpriseOnly ? "1" : "0",
    minImportance: filters.minImportance,
    limit: "2000",
  });
  if (filters.relationMode) sp.set("relationMode", filters.relationMode);
  if (filters.assets.length) sp.set("assets", filters.assets.join(","));
  if (filters.industries.length)
    sp.set("industries", filters.industries.join(","));
  if (filters.countries.length)
    sp.set("countries", filters.countries.join(","));
  const types = typeFamiliesToQueryPrefixes(filters.typeFamilies);
  if (types?.length) sp.set("types", types.join(","));
  return `/api/events/for-chart?${sp.toString()}`;
}

/** Source switches and client content conditions must not remove observable candidates. */
export function buildChartCandidateUrl(symbol: string, from: string, to: string, filters: EventViewFilterState): string {
  return buildForChartUrl(symbol, from, to, {
    ...filters, minImportance: "LOW", typeFamilies: [...ALL_EVENT_TYPE_FAMILY_IDS],
    largeSurpriseOnly: false, includeMarket: true, includeSec: true,
  });
}
