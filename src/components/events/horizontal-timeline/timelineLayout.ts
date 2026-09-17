import type { MarketEventDto } from "@/lib/data/marketEvents";
import {
  buildEventTimeline,
  formatEraDateRange,
  isEraHeaderEvent,
  parseEventMarkers,
  type TimelineEraGroup,
} from "@/lib/data/marketEventTimeline";
import { US_HISTORY_ERA_CATALOG } from "@/lib/data/usHistoryEraCatalog";
import {
  eraTimelineHeaderSections,
  eventPreviewContent,
  extractEventSection,
  type EventContentSection,
} from "@/lib/data/eventContentDisplay";

import {
  fractionalYear,
  TIMELINE_END_YEAR,
  TIMELINE_ORIGIN_YEAR,
} from "@/components/events/horizontal-timeline/timelinePacking";

export {
  BASE_PX_PER_YEAR,
  contentWidth,
  TIMELINE_END_YEAR,
  TIMELINE_ORIGIN_YEAR,
  yearToX,
} from "@/components/events/horizontal-timeline/timelinePacking";

export type EraBand = {
  id: string;
  label: string;
  tag: string;
  fromYear: number;
  toYear: number;
  color: string;
  /** 顶部介绍条不透明底色 */
  headerBg: string;
  /** @deprecated 使用 headerSections */
  summary?: string;
  headerSections?: EventContentSection[];
};

export type TimelineEventNode = {
  event: MarketEventDto;
  year: number;
  /** 小数年（精确到日），决定横坐标 */
  t: number;
  eraTag: string | null;
  summary: string;
  impact: string | null;
};

/** 与 GekkoTech 浅色 UI 协调的时代色带（fs-accent-soft / fs-elevated 交替） */
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
        headerSections: eraTimelineHeaderSections(g.era.content),
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
  bands: EraBand[],
): TimelineEventNode[] {
  const model = buildEventTimeline(events);
  const leafEvents = model.hasEraStructure
    ? model.groups.flatMap((g) => g.children)
    : events.filter((e) => !isEraHeaderEvent(e));

  const sorted = [...leafEvents].sort(
    (a, b) => fractionalYear(a.occurredAt) - fractionalYear(b.occurredAt) || a.id.localeCompare(b.id),
  );

  return sorted.map((event) => {
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
      t: fractionalYear(event.occurredAt),
      eraTag,
      summary:
        extractEventSection(event.content, "事件概述") ??
        eventPreviewContent(event.content, 100),
      impact: extractEventSection(event.content, "主要影响"),
    };
  });
}
