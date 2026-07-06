"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { formatEventOccurredAt } from "@/lib/data/marketEvents";
import { EventImportanceBadge } from "@/components/events/EventImportanceBadge";
import { eventHoverCardSections } from "@/lib/data/eventContentDisplay";

const CARD_W = 420;
const CARD_MAX_H = 480;
const VIEWPORT_PAD = 12;

function cardStyle(anchor: DOMRect): CSSProperties {
  const maxH = Math.min(CARD_MAX_H, window.innerHeight * 0.6);
  const spaceBelow = window.innerHeight - anchor.bottom;
  const showAbove = spaceBelow < maxH + 56 && anchor.top > spaceBelow;

  let left = anchor.left;
  if (left + CARD_W > window.innerWidth - VIEWPORT_PAD) {
    left = window.innerWidth - CARD_W - VIEWPORT_PAD;
  }
  left = Math.max(VIEWPORT_PAD, left);

  if (showAbove) {
    return {
      position: "fixed",
      left,
      bottom: window.innerHeight - anchor.top + 8,
      width: CARD_W,
      maxHeight: Math.min(maxH, anchor.top - VIEWPORT_PAD - 8),
      zIndex: 9999,
    };
  }

  return {
    position: "fixed",
    left,
    top: anchor.bottom + 8,
    width: CARD_W,
    maxHeight: Math.min(maxH, spaceBelow - VIEWPORT_PAD - 8),
    zIndex: 9999,
  };
}

function EventTag({ children }: { children: string }) {
  return (
    <span className="rounded bg-fs-bg/80 px-1.5 py-0.5 text-[10px] text-fs-muted ring-1 ring-fs-border/60">
      {children}
    </span>
  );
}

export type EventHoverCardProps = {
  event: MarketEventDto;
  anchor: DOMRect | null;
  onDismiss: () => void;
  onOpenDetail: () => void;
};

export function EventHoverCard({
  event,
  anchor,
  onDismiss,
  onOpenDetail,
}: EventHoverCardProps) {
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showFade, setShowFade] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tags = [
    ...event.countries,
    ...event.industries.filter((t) => t !== "时代阶段"),
    ...event.assets.slice(0, 6),
  ];
  const { primary, extraCount } = eventHoverCardSections(event.content);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(onDismiss, 250);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setShowFade(el.scrollHeight > el.clientHeight + 4);
    check();
    el.addEventListener("scroll", check);
    return () => el.removeEventListener("scroll", check);
  }, [anchor, event.id, primary.length]);

  useLayoutEffect(() => () => cancelHide(), []);

  if (!mounted || !anchor) return null;

  return createPortal(
    <div
      role="dialog"
      aria-label={event.title ? `事件预览：${event.title}` : "事件预览"}
      className="flex flex-col overflow-hidden rounded-lg border border-fs-border bg-fs-elevated text-[11px] leading-relaxed text-fs-text shadow-2xl ring-1 ring-fs-border/80"
      style={cardStyle(anchor)}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      <div className="shrink-0 border-b border-fs-border/80 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <time className="text-[10px] tabular-nums text-cyan-400/95">
            {formatEventOccurredAt(event)}
          </time>
          <EventImportanceBadge importance={event.importance} />
          {event.eventType ? <EventTag>{event.eventType}</EventTag> : null}
        </div>
        {event.title ? (
          <h3 className="mt-1.5 text-sm font-semibold leading-snug text-fs-text">{event.title}</h3>
        ) : null}
        {tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((t) => (
              <EventTag key={t}>{t}</EventTag>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {primary.length === 0 ? (
          <p className="text-fs-muted">暂无正文</p>
        ) : (
          <div className="space-y-3">
            {primary.map((sec) => (
              <div key={sec.title}>
                <p className="text-[10px] font-medium uppercase tracking-wide text-fs-muted">
                  {sec.title}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-fs-secondary">
                  {sec.body}
                </p>
              </div>
            ))}
            {extraCount > 0 ? (
              <p className="text-[10px] text-fs-muted">还有 {extraCount} 个段落，点击查看全文</p>
            ) : null}
          </div>
        )}
        {showFade ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-fs-elevated to-transparent"
            aria-hidden
          />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-fs-border/80 px-3 py-2">
        <button
          type="button"
          onClick={onOpenDetail}
          className="text-[11px] font-medium text-fs-accent-text hover:underline"
        >
          查看全文
        </button>
        {event.sourceUrl ? (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-cyan-500/90 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            延伸阅读 ↗
          </a>
        ) : (
          <span className="text-[10px] text-fs-muted">点击进入全文</span>
        )}
      </div>
    </div>,
    document.body,
  );
}
