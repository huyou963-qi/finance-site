import type { EventImportance } from "@prisma/client";
import {
  defaultMarkerLabel,
  markerColorFor,
  markerShapeFor,
  normalizeEventType,
  type MarkerShape,
} from "@/lib/data/eventTaxonomy";
import {
  eventHitsAssetContext,
  parseExpandLevel,
  resolveAssetEventContext,
  type EventExpandLevel,
} from "@/lib/data/assetEventResolver";
import {
  listMarketEvents,
  meetsMinImportance as meetsImp,
  type MarketEventDto,
} from "@/lib/data/marketEvents";
import {
  loadStockEvents,
  type StockEvent,
  type StockEventImportance,
  type StockEventType,
} from "@/lib/equity/stockEvents";
import { prisma } from "@/lib/prisma";

export type ChartEventMarkerSource = "stock_derived" | "market_event";

export type ChartEventMarker = {
  id: string;
  time: number;
  label: string;
  shape: MarkerShape;
  color: string;
  importance: EventImportance;
  eventType: string;
  scope: string;
  title: string;
  source: ChartEventMarkerSource;
  sourceUrl?: string | null;
};

export type ChartMarkersQuery = {
  symbol: string;
  from?: string;
  to?: string;
  expand?: string;
  types?: string[];
  minImportance?: EventImportance;
  includeSec?: boolean;
  includeMarket?: boolean;
  limit?: number;
};

function stockImportanceToEvent(i: StockEventImportance): EventImportance {
  if (i === "high") return "HIGH";
  if (i === "medium") return "MEDIUM";
  return "LOW";
}

function stockTypeToEventType(t: StockEventType, items: string[]): string {
  if (t === "earnings" || t === "annual") return "company.earnings";
  if (t === "split") return "company.corp_action";
  if (items.includes("5.02")) return "company.management";
  if (items.includes("2.01") || items.includes("1.01")) return "company.corp_action";
  return "company.filing";
}

function stockMarkerLabel(ev: StockEvent): string {
  if (ev.type === "earnings") return "财报";
  if (ev.type === "annual") return "年报";
  if (ev.type === "split") return "拆分";
  if (ev.items.includes("2.02")) return "业绩";
  if (ev.items.includes("5.02")) return "高管";
  if (ev.items.includes("2.01") || ev.items.includes("1.01")) return "并购";
  return "披露";
}

function isoDateToUnixSec(isoDate: string): number {
  const d = isoDate.slice(0, 10);
  return Math.floor(Date.parse(`${d}T00:00:00.000Z`) / 1000);
}

function inRange(dateIso: string, from?: string, to?: string): boolean {
  const d = dateIso.slice(0, 10);
  if (from && d < from.slice(0, 10)) return false;
  if (to && d > to.slice(0, 10)) return false;
  return true;
}

function stockToMarker(ev: StockEvent, symbol: string): ChartEventMarker {
  const eventType = stockTypeToEventType(ev.type, ev.items);
  const importance = stockImportanceToEvent(ev.importance);
  return {
    id: `stock:${ev.type}:${symbol}:${ev.date}:${ev.form ?? ""}:${ev.items.join(",")}`,
    time: isoDateToUnixSec(ev.date),
    label: stockMarkerLabel(ev),
    shape: markerShapeFor(eventType),
    color: markerColorFor(eventType, importance),
    importance,
    eventType,
    scope: "COMPANY",
    title: ev.titleZh,
    source: "stock_derived",
    sourceUrl: ev.url,
  };
}

function marketToMarker(ev: MarketEventDto): ChartEventMarker {
  const eventType = normalizeEventType(ev.eventType) ?? ev.eventType ?? "other";
  const label =
    ev.markerLabel?.trim() ||
    defaultMarkerLabel(eventType) ||
    (ev.title?.slice(0, 4) ?? "事件");
  return {
    id: ev.id,
    time: isoDateToUnixSec(ev.occurredAt),
    label: label.slice(0, 4),
    shape: markerShapeFor(eventType),
    color: markerColorFor(eventType, ev.importance),
    importance: ev.importance,
    eventType,
    scope: ev.scope,
    title: ev.title?.trim() || ev.content.slice(0, 80),
    source: "market_event",
    sourceUrl: ev.sourceUrl,
  };
}

function typeFilterOk(eventType: string, types?: string[]): boolean {
  if (!types?.length) return true;
  return types.some((t) => {
    const want = normalizeEventType(t) ?? t;
    return eventType === want || eventType.startsWith(`${want}.`) || want.startsWith(eventType);
  });
}

/** 同日去重：stock_derived 优先 */
function dedupeSameDay(markers: ChartEventMarker[]): ChartEventMarker[] {
  const byDayType = new Map<string, ChartEventMarker>();
  const sorted = [...markers].sort((a, b) => {
    if (a.source === "stock_derived" && b.source !== "stock_derived") return -1;
    if (b.source === "stock_derived" && a.source !== "stock_derived") return 1;
    return b.importance.localeCompare(a.importance);
  });
  for (const m of sorted) {
    const day = new Date(m.time * 1000).toISOString().slice(0, 10);
    const key = `${day}:${normalizeEventType(m.eventType) ?? m.eventType}`;
    if (!byDayType.has(key)) byDayType.set(key, m);
  }
  return [...byDayType.values()].sort((a, b) => a.time - b.time);
}

export async function loadChartEventMarkers(
  query: ChartMarkersQuery,
): Promise<{ markers: ChartEventMarker[]; expand: EventExpandLevel; symbol: string }> {
  const expand = parseExpandLevel(query.expand);
  const ctx = await resolveAssetEventContext(query.symbol, expand);
  const includeSec = query.includeSec !== false;
  const includeMarket = query.includeMarket !== false;
  const minImp = query.minImportance ?? "MEDIUM";
  const limit = Math.min(500, Math.max(1, query.limit ?? 200));

  const out: ChartEventMarker[] = [];

  if (includeSec) {
    const row = await prisma.equitySecurity.findUnique({
      where: { symbol: ctx.symbol },
      select: { cik: true },
    });
    const stockEvents = await loadStockEvents(ctx.symbol, {
      cik: row?.cik ?? null,
      limit: 200,
    });
    for (const ev of stockEvents) {
      if (!inRange(ev.date, query.from, query.to)) continue;
      const m = stockToMarker(ev, ctx.symbol);
      if (!meetsImp(m.importance, minImp)) continue;
      if (!typeFilterOk(m.eventType, query.types)) continue;
      out.push(m);
    }
  }

  if (includeMarket) {
    const { events } = await listMarketEvents({
      from: query.from,
      to: query.to,
      limit: 2000,
    });
    for (const ev of events) {
      if (ev.eventType === "时代阶段" || ev.eventType === "era") continue;
      if (!eventHitsAssetContext(ev, ctx)) continue;
      if (!meetsImp(ev.importance, minImp)) continue;
      const eventType = normalizeEventType(ev.eventType) ?? ev.eventType ?? "other";
      if (!typeFilterOk(eventType, query.types)) continue;
      out.push(marketToMarker(ev));
    }
  }

  const markers = dedupeSameDay(out).slice(0, limit);
  return { markers, expand, symbol: ctx.symbol };
}
