import { marketToMarker, type ChartEventMarker } from "@/lib/chart/eventMarkerModel";
export { marketToMarker, type ChartEventMarker, type ChartEventMarkerSource } from "@/lib/chart/eventMarkerModel";
import { expandEventAssetTags } from "./macroEventSurprise";
import type { EventImportance } from "@prisma/client";
import {
  parseScopeMode,
  resolveChartSymbolProfile,
  type EventScopeMode,
  type ExplicitEventTagFilters,
} from "@/lib/data/assetEventResolver";
import {
  eventTypeMatchesFamilies,
  eventTypeMatchesSelection,
  normalizeEventType,
  type EventTypeFamilyId,
  EVENT_TYPE_FAMILY_IDS,
} from "@/lib/data/eventTaxonomy";
import {
  listMarketEvents,
  EVENT_IMPORTANCE_ORDER,
  meetsMinImportance as meetsImp,
  normalizeAssetTag,
  type MarketEventDto,
} from "@/lib/data/marketEvents";
import {
  loadStockEvents,
  type StockEvent,
  type StockEventImportance,
  type StockEventType,
} from "@/lib/equity/stockEvents";
import { prisma } from "@/lib/prisma";
import { classifyMacroEventSurprise } from "@/lib/data/macroEventSurprise";

export type ChartMarkersQuery = {
  largeSurpriseOnly?: boolean;
  symbol: string;
  from?: string;
  to?: string;
  /** @deprecated 改用 scopeMode + 显式 tags */
  expand?: string;
  scopeMode?: EventScopeMode | string;
  assets?: string[];
  industries?: string[];
  countries?: string[];
  types?: string[];
  minImportance?: EventImportance;
  includeSec?: boolean;
  includeMarket?: boolean;
  limit?: number;
  offset?: number;
  relationMode?: "asset" | "industry" | "macro";
};

function stockImportanceToEvent(i: StockEventImportance): EventImportance {
  if (i === "high") return "HIGH";
  if (i === "medium") return "MEDIUM";
  return "LOW";
}

function stockTypeToEventType(t: StockEventType, items: string[]): string {
  if (t === "insider-plan") return "company.management";
  if (t === "earnings" || t === "annual") return "company.earnings";
  if (t === "split") return "company.corp_action";
  if (items.includes("5.02")) return "company.management";
  if (items.includes("2.01") || items.includes("1.01")) return "company.corp_action";
  return "company.filing";
}

function stockMarkerLabel(ev: StockEvent): string {
  if (ev.type === "insider-plan") return "持股计划";
  if (ev.type === "earnings") return "财报";
  if (ev.type === "annual") return "年报";
  if (ev.type === "split") return "拆分";
  if (ev.items.includes("2.02")) return "业绩";
  if (ev.items.includes("5.02")) return "高管";
  if (ev.items.includes("2.01") || ev.items.includes("1.01")) return "并购";
  return "披露";
}

function inRange(dateIso: string, from?: string, to?: string): boolean {
  const d = dateIso.slice(0, 10);
  if (from && d < from.slice(0, 10)) return false;
  if (to && d > to.slice(0, 10)) return false;
  return true;
}

function asFamilyIds(types?: string[]): EventTypeFamilyId[] | null {
  if (!types?.length) return null;
  const set = new Set(EVENT_TYPE_FAMILY_IDS as readonly string[]);
  const families = types.filter((t): t is EventTypeFamilyId => set.has(t));
  return families.length === types.length ? families : null;
}

function typeFilterOk(eventType: string, types?: string[]): boolean {
  const families = asFamilyIds(types);
  if (families) return eventTypeMatchesFamilies(eventType, families);
  return eventTypeMatchesSelection(eventType, types);
}

function resolveTagFilters(
  query: ChartMarkersQuery,
  symbol: string,
): ExplicitEventTagFilters {
  const assets = query.assets ?? [];
  const industries = query.industries ?? [];
  const countries = query.countries ?? [];
  // 相关维为空时回退本票，避免「仅国家」撑开全市场
  if (assets.length === 0 && industries.length === 0) {
    return {
      assets: [normalizeAssetTag(symbol)],
      industries: [],
      countries,
    };
  }
  return { assets, industries, countries };
}

export async function loadChartEventMarkers(
  query: ChartMarkersQuery,
): Promise<{
  markers: ChartEventMarker[];
  symbol: string;
  scopeMode: EventScopeMode;
}> {
  const result = await loadChartPanelEvents(query);
  return { markers: result.events.map(marketToMarker), symbol: result.symbol, scopeMode: result.scopeMode };
}

function stockToPanelEvent(ev: StockEvent, symbol: string): MarketEventDto {
  const eventType = stockTypeToEventType(ev.type, ev.items);
  const importance = stockImportanceToEvent(ev.importance);
  const day = ev.date.slice(0, 10);
  const contentParts = [
    ev.titleZh,
    ev.form ? `表格：${ev.form}` : null,
    ev.items.length ? `Items：${ev.items.join(", ")}` : null,
    ev.splitRatio ? `拆股比例：${ev.splitRatio}` : null,
    ev.metrics
      ? `营收 ${ev.metrics.revenue ?? "—"} · EPS ${ev.metrics.eps ?? "—"}`
      : null,
  ].filter(Boolean);
  const now = new Date().toISOString();
  return {
    id: `stock:${ev.type}:${symbol}:${day}:${ev.form ?? ""}:${ev.items.join(",")}:${ev.url ?? ev.splitRatio ?? ""}`,
    title: ev.titleZh,
    content: contentParts.join("\n"),
    occurredAt: `${day}T12:00:00.000Z`,
    datePrecision: "DATE",
    importance,
    eventType,
    scope: "COMPANY",
    countries: ["US"],
    industries: [],
    assets: [normalizeAssetTag(symbol)],
    macroKeys: [],
    persons: [],
    institutions: [],
    tags: [],
    payload: {
      stockType: ev.type,
      form: ev.form,
      items: ev.items,
      metrics: ev.metrics,
      splitRatio: ev.splitRatio,
      reaction: ev.reaction,
    },
    markerLabel: stockMarkerLabel(ev),
    sourceKind: "sec",
    externalId: `sec:${ev.type}:${symbol}:${day}:${ev.url ?? ev.form ?? ev.splitRatio ?? ""}`,
    sourceUrl: ev.url,
    isPublic: true,
    createdById: "system",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 侧栏列表同源流：SEC stockEvents + MarketEvent（含时代），按 scopeMode + 显式 tags 裁剪。
 * 重要性/类型亦可在服务端预筛（与图表标记对齐）；客户端仍可再筛 search/人物等。
 */
export async function loadChartPanelEvents(query: {
  largeSurpriseOnly?: boolean;
  symbol: string;
  from?: string;
  to?: string;
  scopeMode?: EventScopeMode | string;
  assets?: string[];
  industries?: string[];
  countries?: string[];
  types?: string[];
  minImportance?: EventImportance;
  includeSec?: boolean;
  includeMarket?: boolean;
  limit?: number;
  offset?: number;
  relationMode?: "asset" | "industry" | "macro";
  /** @deprecated */
  expand?: string;
  /** @deprecated 旧 mode；chart/symbol → follow，range → range */
  mode?: string;
}): Promise<{
  events: MarketEventDto[];
  symbol: string;
  scopeMode: EventScopeMode;
  profileKind: string;
  total: number;
  hasMore: boolean;
}> {
  const profile = await resolveChartSymbolProfile(query.symbol);
  const scopeMode = parseScopeMode(query.scopeMode ?? query.mode);
  const tags = resolveTagFilters(query, profile.symbol);
  if (query.relationMode !== "asset" && !query.industries?.length && profile.kind === "equity") tags.industries = profile.industries;
  const includeSec = query.includeSec !== false && !query.largeSurpriseOnly;
  const includeMarket = query.includeMarket !== false;
  const minImp = query.minImportance;

  const out: MarketEventDto[] = [];
  let total = 0;
  let hasMore = false;

  if (includeSec) {
    const row = await prisma.equitySecurity.findUnique({
      where: { symbol: profile.symbol },
      select: { cik: true },
    });
    const stockEvents = await loadStockEvents(profile.symbol, {
      cik: row?.cik ?? null,
      limit: 200,
      from: query.from,
      to: query.to,
    });
    for (const ev of stockEvents) {
      if (!inRange(ev.date, query.from, query.to)) continue;
      const panel = stockToPanelEvent(ev, profile.symbol);
      if (minImp && !meetsImp(panel.importance, minImp)) continue;
      if (
        query.types?.length &&
        !typeFilterOk(panel.eventType ?? "other", query.types)
      )
        continue;
      out.push({ ...panel, matchReasons: ["当前资产的 SEC 披露"] });
    }
  }

  if (includeMarket) {
    const macroContext = query.relationMode === "macro" || (!query.relationMode && ["index", "macro_asset", "sector_etf"].includes(profile.kind));
    const relevance = { assets: expandEventAssetTags(query.relationMode === "asset" && !tags.assets?.length ? [profile.symbol] : tags.assets ?? [profile.symbol]), industries: query.relationMode === "asset" ? [] : (tags.industries ?? []), macroCountries: macroContext ? profile.countries : [] };
    const result = await listMarketEvents({
      from: query.from, to: query.to, countries: tags.countries,
      chartRelevance: relevance, includeEraHeaders: false,
      importance: minImp ? (Object.keys(EVENT_IMPORTANCE_ORDER) as EventImportance[]).filter(i => meetsImp(i, minImp)) : undefined,
      limit: 2000, offset: query.offset ?? 0,
    });
    const events = result.events;
    total = result.total;
    hasMore = (query.offset ?? 0) + Math.min(2000, events.length) < total;
    for (const ev of events) {

      if (minImp && !meetsImp(ev.importance, minImp)) continue;
      const eventType = normalizeEventType(ev.eventType) ?? ev.eventType ?? "other";
      if (query.types?.length && !typeFilterOk(eventType, query.types)) continue;
      if (query.largeSurpriseOnly && (eventType !== "macro.release" || classifyMacroEventSurprise(ev.payload).level !== "large")) continue;
      const matchReasons: string[] = [];
      if (ev.assets.some(a => relevance.assets.includes(a))) matchReasons.push("直接资产关联");
      if (ev.industries.some(i => relevance.industries.some(c => i.startsWith(c) || c.startsWith(i)))) matchReasons.push("行业关联");
      if (!matchReasons.length && relevance.macroCountries?.length) matchReasons.push("宏观地区与事件类型规则");
      out.push({ ...ev, matchReasons });
    }
  }

  // Preserve source records here; the chart projection alone deduplicates matching facts.
  const records = out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));

  return {
    events: records,
    total, hasMore,
    symbol: profile.symbol,
    scopeMode,
    profileKind: profile.kind,
  };
}
