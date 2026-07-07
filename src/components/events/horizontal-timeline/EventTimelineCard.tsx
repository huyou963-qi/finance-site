"use client";

import { useEffect, useState } from "react";
import type { TimelineEventNode } from "@/components/events/horizontal-timeline/timelineLayout";
import { EventImportanceBadge } from "@/components/events/EventImportanceBadge";
import { formatEventOccurredAt } from "@/lib/data/marketEvents";
import {
  catalogEventImage,
  eventSeedKey,
  resolveEventTimelineImage,
} from "@/lib/data/eventTimelineMedia";

export type EventTimelineCardProps = {
  node: TimelineEventNode;
  scale: number;
  selected: boolean;
  stemLength?: number;
  /** 上方卡片：连接线自动填满至主轴 */
  stemFlex?: boolean;
  onSelect: () => void;
};

export function EventTimelineCard({
  node,
  scale,
  selected,
  stemLength = 40,
  stemFlex = false,
  onSelect,
}: EventTimelineCardProps) {
  const { event, summary, impact, eraTag } = node;
  const seedKey = eventSeedKey(event.content);
  const [imageUrl, setImageUrl] = useState<string | null>(() => catalogEventImage(seedKey));
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
    const cached = catalogEventImage(eventSeedKey(event.content));
    if (cached) {
      setImageUrl(cached);
      return;
    }
    const ac = new AbortController();
    const load = async () => {
      const url = await resolveEventTimelineImage(
        {
          content: event.content,
          title: event.title,
          sourceUrl: event.sourceUrl,
          eraTag,
        },
        ac.signal,
      );
      setImageUrl(url);
    };
    void load();
    return () => ac.abort();
  }, [event.id, event.content, event.sourceUrl, event.title, eraTag]);

  const cardW = Math.max(168, Math.min(220, 200 * scale));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex w-full text-left transition-shadow ${
        node.lane === "above" ? "h-full flex-col" : "flex-col-reverse"
      }`}
      style={{ width: cardW }}
    >
      <div
        className={`shrink-0 overflow-hidden rounded-lg border bg-white shadow-sm transition group-hover:shadow-md ${
          selected
            ? "border-fs-accent bg-fs-accent-soft/40 ring-1 ring-fs-accent/25"
            : "border-fs-border group-hover:border-fs-accent/35"
        }`}
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-fs-elevated">
          {imageUrl && !imageBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageBroken(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-fs-elevated text-[10px] text-fs-muted">
              历史影像
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6">
            <time className="text-[10px] font-medium tabular-nums text-white/95">
              {formatEventOccurredAt(event)}
            </time>
          </div>
        </div>
        <div className="space-y-1.5 p-2.5">
          <div className="flex flex-wrap items-center gap-1">
            <EventImportanceBadge importance={event.importance} />
            {event.eventType ? (
              <span className="text-[9px] text-fs-muted">{event.eventType}</span>
            ) : null}
          </div>
          <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-fs-text">
            {event.title ?? "未命名事件"}
          </h3>
          <p className="line-clamp-2 text-[10px] leading-relaxed text-fs-secondary">{summary}</p>
          {impact ? (
            <p className="line-clamp-2 border-l-2 border-fs-accent/40 pl-1.5 text-[10px] leading-relaxed text-fs-secondary">
              <span className="font-medium text-fs-accent-text">影响 </span>
              {impact}
            </p>
          ) : null}
        </div>
      </div>

      {/* 连接线：卡片 ↔ 主轴锚点 */}
      <div
        className={`mx-auto w-0.5 shrink-0 rounded-full bg-fs-accent/45 ${
          stemFlex ? "min-h-3 flex-1" : ""
        }`}
        style={stemFlex ? undefined : { height: stemLength }}
        aria-hidden
      />
    </button>
  );
}
