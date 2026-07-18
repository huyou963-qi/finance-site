"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { formatEventOccurredAt } from "@/lib/data/marketEvents";
import { eventTypeLabel } from "@/lib/data/eventTaxonomy";
import { EventImportanceBadge } from "@/components/events/EventImportanceBadge";
import { EventDetailDrawer } from "@/components/events/EventDetailDrawer";
import { EventHoverCard } from "@/components/events/EventHoverCard";
import { eventPreviewContent } from "@/lib/data/eventContentDisplay";

function isSecDerivedEvent(event: MarketEventDto): boolean {
  return event.sourceKind === "sec" || event.id.startsWith("stock:");
}

const HOVER_OPEN_MS = 400;

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
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const secDerived = isSecDerivedEvent(event);
  const tags = [
    ...event.countries,
    ...event.industries.filter((t) => t !== "时代阶段"),
    ...event.assets.slice(0, compact ? 2 : 4),
  ];
  const preview = eventPreviewContent(event.content);

  const cancelTimers = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  };

  const dismissHover = () => {
    setHoverAnchor(null);
  };

  const scheduleHoverHide = () => {
    cancelTimers();
    hideTimerRef.current = setTimeout(dismissHover, 250);
  };

  const scheduleHoverShow = () => {
    if (drawerOpen) return;
    cancelTimers();
    openTimerRef.current = setTimeout(() => {
      const el = articleRef.current;
      if (el) setHoverAnchor(el.getBoundingClientRect());
    }, HOVER_OPEN_MS);
  };

  const openDrawer = () => {
    cancelTimers();
    setHoverAnchor(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => () => cancelTimers(), []);

  return (
    <li
      ref={rowRef}
      data-event-id={event.id}
      className={`${nested ? "ml-4 border-l border-dotted border-fs-border/80 pl-2" : ""} ${
        highlighted ? "scroll-mt-1 scroll-mb-1" : ""
      }`}
    >
      <article
        ref={articleRef}
        className={`cursor-pointer rounded border px-2 py-1.5 transition ${
          highlighted
            ? "border-cyan-600/70 bg-cyan-950/25 ring-1 ring-cyan-500/50"
            : drawerOpen
              ? "border-fs-accent/40 bg-fs-accent-soft/20"
              : "border-fs-border/90 bg-fs-elevated hover:border-fs-accent/30"
        }`}
        onMouseEnter={scheduleHoverShow}
        onMouseLeave={scheduleHoverHide}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,button")) return;
          openDrawer();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDrawer();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={event.title ? `查看事件：${event.title}` : "查看事件详情"}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <time className="text-[10px] tabular-nums text-fs-accent-text">
                {formatEventOccurredAt(event)}
              </time>
              <EventImportanceBadge importance={event.importance} />
              {secDerived ? (
                <span className="rounded border border-fs-border bg-fs-elevated px-1 py-0 text-[9px] font-medium text-fs-secondary">
                  SEC
                </span>
              ) : event.sourceKind === "ai_skill" ? (
                <span className="rounded border border-fs-border bg-fs-elevated px-1 py-0 text-[9px] text-fs-muted">
                  录入
                </span>
              ) : null}
              {event.eventType ? (
                <span className="text-[10px] text-fs-muted">
                  {eventTypeLabel(event.eventType)}
                </span>
              ) : null}
              {tags.map((t) => (
                <span
                  key={`${event.id}-${t}`}
                  className="rounded bg-fs-elevated px-1 py-0 text-[9px] text-fs-muted"
                >
                  {t}
                </span>
              ))}
              {event.sourceUrl ? (
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-fs-accent-text hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={cancelTimers}
                >
                  link
                </a>
              ) : null}
            </div>
            {event.title ? (
              <p className="mt-0.5 text-[11px] font-medium text-fs-text">{event.title}</p>
            ) : null}
            <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-fs-secondary">
              {preview}
            </p>
            <p className="mt-1 text-[9px] text-fs-muted">悬停预览 · 点击查看全文</p>
          </div>
          {isAdmin && !secDerived ? (
            <div className="flex shrink-0 flex-col gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(event);
                }}
                className="text-[10px] text-fs-muted hover:text-fs-text"
              >
                编辑
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(event.id);
                }}
                className="text-[10px] text-fs-muted hover:text-fs-negative"
              >
                删除
              </button>
            </div>
          ) : null}
        </div>
      </article>

      <EventHoverCard
        event={event}
        anchor={hoverAnchor}
        onDismiss={() => setHoverAnchor(null)}
        onOpenDetail={openDrawer}
      />

      <EventDetailDrawer event={drawerOpen ? event : null} onClose={closeDrawer} />
    </li>
  );
}
