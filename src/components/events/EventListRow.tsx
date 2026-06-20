"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { formatEventOccurredAt } from "@/lib/data/marketEvents";
import { EventImportanceBadge } from "@/components/events/EventImportanceBadge";
import { EventContentPopover } from "@/components/events/EventContentPopover";
import {
  eventDisplayContent,
  eventPreviewContent,
} from "@/lib/data/eventContentDisplay";

export type EventListRowProps = {
  event: MarketEventDto;
  compact?: boolean;
  nested?: boolean;
  isAdmin: boolean;
  highlighted?: boolean;
  onEdit: (e: MarketEventDto) => void;
  onDelete: (id: string) => void;
  rowRef?: (el: HTMLLIElement | null) => void;
};

export function EventListRow({
  event,
  compact,
  nested,
  isAdmin,
  highlighted,
  onEdit,
  onDelete,
  rowRef,
}: EventListRowProps) {
  const articleRef = useRef<HTMLElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

  const tags = [
    ...event.countries,
    ...event.industries.filter((t) => t !== "时代阶段"),
    ...event.assets.slice(0, compact ? 2 : 4),
  ];
  const fullContent = eventDisplayContent(event.content);
  const preview = eventPreviewContent(event.content);

  const cancelPopoverHide = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showPopover = () => {
    cancelPopoverHide();
    const el = articleRef.current;
    if (el) setPopoverAnchor(el.getBoundingClientRect());
  };

  const schedulePopoverHide = () => {
    cancelPopoverHide();
    hideTimerRef.current = setTimeout(() => setPopoverAnchor(null), 120);
  };

  useEffect(() => () => cancelPopoverHide(), []);

  return (
    <li
      ref={rowRef}
      data-event-id={event.id}
      className={`${nested ? "ml-4 border-l border-dotted border-slate-700/80 pl-2" : ""} ${
        highlighted ? "scroll-mt-1 scroll-mb-1" : ""
      }`}
    >
      <article
        ref={articleRef}
        className={`rounded border px-2 py-1.5 transition ${
          highlighted
            ? "border-cyan-600/70 bg-cyan-950/25 ring-1 ring-cyan-500/50"
            : "border-slate-800/90 bg-slate-950/50 hover:border-slate-700/90"
        }`}
        onMouseEnter={showPopover}
        onMouseLeave={schedulePopoverHide}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <time className="text-[10px] tabular-nums text-cyan-400/90">
                {formatEventOccurredAt(event)}
              </time>
              <EventImportanceBadge importance={event.importance} />
              {event.eventType ? (
                <span className="text-[10px] text-slate-500">{event.eventType}</span>
              ) : null}
              {tags.map((t) => (
                <span
                  key={`${event.id}-${t}`}
                  className="rounded bg-slate-900 px-1 py-0 text-[9px] text-slate-500"
                >
                  {t}
                </span>
              ))}
              {event.sourceUrl ? (
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-cyan-500/90 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={cancelPopoverHide}
                >
                  link
                </a>
              ) : null}
            </div>
            {event.title ? (
              <p className="mt-0.5 text-[11px] font-medium text-slate-100">{event.title}</p>
            ) : null}
            <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-slate-300">
              {preview}
            </p>
          </div>
          {isAdmin ? (
            <div className="flex shrink-0 flex-col gap-0.5">
              <button
                type="button"
                onClick={() => onEdit(event)}
                className="text-[10px] text-slate-500 hover:text-slate-200"
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => onDelete(event.id)}
                className="text-[10px] text-slate-500 hover:text-rose-300"
              >
                删除
              </button>
            </div>
          ) : null}
        </div>
      </article>
      <EventContentPopover
        anchor={popoverAnchor}
        content={fullContent}
        title={event.title}
        onDismiss={() => setPopoverAnchor(null)}
      />
    </li>
  );
}
