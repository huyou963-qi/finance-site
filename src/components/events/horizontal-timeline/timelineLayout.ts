import type { MarketEventDto } from "@/lib/data/marketEvents";
import {
  buildEventTimeline,
  formatEraDateRange,
  isEraHeaderEvent,
  parseEventMarkers,
  type TimelineEraGroup,
} from "@/lib/data/marketEventTimeline";
import { US_HISTORY_ERA_CATALOG } from "@/lib/data/usHistoryEraCatalog";
import { eventPreviewContent, extractEventSection } from "@/lib/data/eventContentDisplay";

export const TIMELINE_ORIGIN_YEAR = 1776;
export const TIMELINE_END_YEAR = 2026;
export const BASE_PX_PER_YEAR = 14;

export type EraBand = {
  id: string;
  label: string;
  tag: string;
  fromYear: number;
  toYear: number;
  color: string;
  /** 顶部介绍条不透明底色 */
  headerBg: string;
  summary?: string;
};

export type TimelineEventNode = {
  event: MarketEventDto;
  year: number;
  x: number;
  lane: "above" | "below";
  eraTag: string | null;
  summary: string;
  impact: string | null;
};

/** 与 Finova 浅色 UI 协调的时代色带（fs-accent-soft / fs-elevated 交替） */
const ERA_COLORS = [
  "rgba(231, 243, 255, 0.95)",
  "rgba(247, 247, 245, 1)",
  "rgba(231, 243, 255, 0.75)",
  "rgba(247, 247, 245, 1)",
  "rgba(231, 243, 255, 0.85)",
  "rgba(247, 247, 245, 1)",
  "rgba(231, 243, 255, 0.7)",
  "rgba(247, 247, 245, 1)",
  "rgba(231, 243, 255, 0.9)",
  "rgba(247, 247, 245, 1)",
  "rgba(231, 243, 255, 0.8)",
  "rgba(247, 247, 245, 1)",
  "rgba(231, 243, 255, 0.85)",
  "rgba(247, 247, 245, 1)",
];

const ERA_HEADER_BGS = ["#e7f3ff", "#f7f7f5"] as const;

function parseYear(iso: string): number {
  const y = Number(iso.slice(0, 4));
  return Number.isFinite(y) ? y : TIMELINE_ORIGIN_YEAR;
}

function eraEndYear(dateTo: string): number {
  const raw = dateTo.trim();
  if (raw === "present" || raw === "今") return TIMELINE_END_YEAR;
  return parseYear(raw);
}

export function yearToX(year: number, pxPerYear: number): number {
  return (year - TIMELINE_ORIGIN_YEAR) * pxPerYear;
}

export function contentWidth(pxPerYear: number): number {
  return yearToX(TIMELINE_END_YEAR, pxPerYear) + 120;
}

export function buildEraBands(groups: TimelineEraGroup[]): EraBand[] {
  if (groups.length > 0) {
    return groups.map((g, i) => {
      const meta = g.meta;
      const fromYear = meta.eraDateFrom ? parseYear(meta.eraDateFrom) : parseYear(g.era.occurredAt);
      const toYear = meta.eraDateTo ? eraEndYear(meta.eraDateTo) : fromYear + 20;
      const tag = meta.eraTag ?? g.era.industries.find((t) => t !== "时代阶段") ?? g.era.title ?? "时代";
      return {
        id: g.era.id,
        label: g.era.title ?? formatEraDateRange(meta, g.era),
        tag,
        fromYear,
        toYear,
        color: ERA_COLORS[i % ERA_COLORS.length],
        headerBg: ERA_HEADER_BGS[i % ERA_HEADER_BGS.length],
        summary: eventPreviewContent(g.era.content, 120),
      };
    });
  }

  return US_HISTORY_ERA_CATALOG.map((e, i) => ({
    id: e.seedKey,
    label: e.tag,
    tag: e.tag,
    fromYear: parseYear(e.dateFrom),
    toYear: eraEndYear(e.dateTo),
    color: ERA_COLORS[i % ERA_COLORS.length],
    headerBg: ERA_HEADER_BGS[i % ERA_HEADER_BGS.length],
  }));
}

function eraTagForYear(year: number, bands: EraBand[]): string | null {
  for (const b of bands) {
    if (year >= b.fromYear && year <= b.toYear) return b.tag;
  }
  return null;
}

export function buildTimelineEventNodes(
  events: MarketEventDto[],
  pxPerYear: number,
  bands: EraBand[],
): TimelineEventNode[] {
  const model = buildEventTimeline(events);
  const leafEvents = model.hasEraStructure
    ? model.groups.flatMap((g) => g.children)
    : events.filter((e) => !isEraHeaderEvent(e));

  const sorted = [...leafEvents].sort(
    (a, b) => parseYear(a.occurredAt) - parseYear(b.occurredAt) || a.id.localeCompare(b.id),
  );

  return sorted.map((event, idx) => {
    const year = parseYear(event.occurredAt);
    const meta = parseEventMarkers(event.content);
    const parentTag = meta.eraParent
      ? bands.find((b) => b.id.includes(meta.eraParent!) || b.tag === meta.eraParent)?.tag
      : null;
    const eraTag =
      parentTag ??
      event.industries.find((t) => t !== "时代阶段") ??
      eraTagForYear(year, bands);

    return {
      event,
      year,
      x: yearToX(year, pxPerYear),
      lane: idx % 2 === 0 ? "above" : "below",
      eraTag,
      summary:
        extractEventSection(event.content, "事件概述") ??
        eventPreviewContent(event.content, 100),
      impact: extractEventSection(event.content, "主要影响"),
    };
  });
}

export function tickYears(pxPerYear: number): { year: number; x: number; major: boolean }[] {
  const step = pxPerYear >= 18 ? 10 : pxPerYear >= 10 ? 25 : pxPerYear >= 5 ? 50 : 100;
  const ticks: { year: number; x: number; major: boolean }[] = [];
  for (let y = TIMELINE_ORIGIN_YEAR; y <= TIMELINE_END_YEAR; y += step) {
    ticks.push({ year: y, x: yearToX(y, pxPerYear), major: y % 50 === 0 });
  }
  return ticks;
}
