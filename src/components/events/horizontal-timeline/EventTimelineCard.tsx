"use client";

import { useEffect, useState } from "react";
import type { TimelineEventNode } from "@/components/events/horizontal-timeline/timelineLayout";
import { EventImportanceBadge } from "@/components/events/EventImportanceBadge";
import { formatEventOccurredAt } from "@/lib/data/marketEvents";
import { resolveEventTimelineImage, staticEventImage } from "@/lib/data/eventTimelineMedia";

/** 时间轴卡片配图：先用静态图库/主题规则，缺失时再异步解析维基缩略图 */
export function useTimelineEventImage(node: TimelineEventNode | null): string | null {
  const event = node?.event ?? null;
  const eraTag = node?.eraTag ?? null;
  const [imageUrl, setImageUrl] = useState<string | null>(() => (event ? staticEventImage(event) : null));

  useEffect(() => {
    if (!event) {
      setImageUrl(null);
      return;
    }
    const known = staticEventImage(event);
    if (known) {
      setImageUrl(known);
      return;
    }
    const ac = new AbortController();
    void resolveEventTimelineImage(
      {
        content: event.content,
        title: event.title,
        sourceUrl: event.sourceUrl,
        externalId: event.externalId,
        eraTag,
      },
      ac.signal,
    ).then((url) => {
      if (!ac.signal.aborted) setImageUrl(url);
    });
    return () => ac.abort();
  }, [event, eraTag]);

  return imageUrl;
}

function TimelineImage({ url, children }: { url: string | null; children?: React.ReactNode }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return (
    <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-fs-elevated">
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-fs-elevated text-[10px] text-fs-muted">
          历史影像
        </div>
      )}
      {children}
    </div>
  );
}

/** 卡片与主轴之间的连接线，横向位置跟随锚点（卡片可能为避让而偏移） */
function Stem({ length, offset }: { length: number; offset: number }) {
  return (
    <div className="relative w-full shrink-0" style={{ height: length }} aria-hidden>
      <span
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-fs-accent/45"
        style={{ left: offset }}
      />
    </div>
  );
}

export type EventTimelineCardProps = {
  node: TimelineEventNode;
  lane: "above" | "below";
  width: number;
  stemLength: number;
  stemOffset: number;
  selected: boolean;
  onSelect: () => void;
};

export function EventTimelineCard({
  node,
  lane,
  width,
  stemLength,
  stemOffset,
  selected,
  onSelect,
}: EventTimelineCardProps) {
  const { event, summary, impact } = node;
  const imageUrl = useTimelineEventImage(node);

  return (
    <div
      className={`group pointer-events-none relative flex h-full ${
        lane === "above" ? "flex-col justify-end" : "flex-col-reverse justify-end"
      }`}
      style={{ width }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`pointer-events-auto flex min-h-0 shrink flex-col overflow-hidden rounded-lg border bg-white text-left shadow-sm transition group-hover:shadow-md ${
          selected
            ? "border-fs-accent bg-fs-accent-soft/40 ring-1 ring-fs-accent/25"
            : "border-fs-border group-hover:border-fs-accent/35"
        }`}
      >
        <TimelineImage url={imageUrl}>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6">
            <time className="text-[10px] font-medium tabular-nums text-white/95">
              {formatEventOccurredAt(event)}
            </time>
          </div>
        </TimelineImage>
        <div className="min-h-0 space-y-1.5 overflow-hidden p-2.5">
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
      </button>
      <Stem length={stemLength} offset={stemOffset} />
    </div>
  );
}

const IMPORTANCE_DOT: Record<string, string> = {
  CRITICAL: "bg-rose-500",
  HIGH: "bg-amber-500",
  MEDIUM: "bg-sky-500",
  LOW: "bg-fs-muted",
};

export type EventTimelineClusterCardProps = {
  /** 按时间升序 */
  nodes: TimelineEventNode[];
  /** 封面事件（重要性最高者） */
  cover: TimelineEventNode;
  lane: "above" | "below";
  width: number;
  stemLength: number;
  stemOffset: number;
  canExpand: boolean;
  onExpand: () => void;
  onSelectEvent: (node: TimelineEventNode) => void;
};

/** 密集区域的聚合卡：展示数量、时间范围与前几条标题；点击放大展开 */
export function EventTimelineClusterCard({
  nodes,
  cover,
  lane,
  width,
  stemLength,
  stemOffset,
  canExpand,
  onExpand,
  onSelectEvent,
}: EventTimelineClusterCardProps) {
  const imageUrl = useTimelineEventImage(cover);
  const first = formatEventOccurredAt(nodes[0].event);
  const last = formatEventOccurredAt(nodes[nodes.length - 1].event);
  const range = first === last ? first : `${first} ~ ${last}`;
  const preview = nodes.length <= 4 ? nodes : [cover, ...nodes.filter((n) => n !== cover)].slice(0, 3);

  return (
    <div
      className={`group pointer-events-none relative flex h-full ${
        lane === "above" ? "flex-col justify-end" : "flex-col-reverse justify-end"
      }`}
      style={{ width }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onExpand();
          }
        }}
        className="pointer-events-auto relative flex min-h-0 shrink cursor-pointer flex-col pt-1.5"
      >
        {/* 叠放效果 */}
        <span
          className="absolute inset-x-2 top-0 h-3 rounded-t-lg border border-b-0 border-fs-border bg-fs-elevated"
          aria-hidden
        />
        <span
          className="absolute inset-x-1 top-1 h-3 rounded-t-lg border border-b-0 border-fs-border bg-white"
          aria-hidden
        />
        <div className="relative flex min-h-0 shrink flex-col overflow-hidden rounded-lg border border-fs-border bg-white shadow-sm transition group-hover:border-fs-accent/35 group-hover:shadow-md">
          <TimelineImage url={imageUrl}>
            <div className="absolute right-1.5 top-1.5 rounded-full bg-fs-accent px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white shadow">
              {nodes.length} 个事件
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6">
              <time className="text-[10px] font-medium tabular-nums text-white/95">{range}</time>
            </div>
          </TimelineImage>
          <ul className="min-h-0 space-y-1 overflow-hidden p-2.5">
            {preview.map((n) => (
              <li key={n.event.id}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent(n);
                  }}
                  className="flex w-full items-start gap-1.5 text-left text-[11px] leading-snug text-fs-text hover:text-fs-accent-text"
                >
                  <span
                    className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${IMPORTANCE_DOT[n.event.importance] ?? "bg-fs-muted"}`}
                  />
                  <span className="line-clamp-1">{n.event.title ?? "未命名事件"}</span>
                </button>
              </li>
            ))}
            <li className="pt-0.5 text-[10px] font-medium text-fs-accent-text">
              {canExpand
                ? `滚轮放大或点击展开${nodes.length > preview.length ? ` · 另有 ${nodes.length - preview.length} 条` : ""}`
                : "点击查看全部"}
            </li>
          </ul>
        </div>
      </div>
      <Stem length={stemLength} offset={stemOffset} />
    </div>
  );
}
