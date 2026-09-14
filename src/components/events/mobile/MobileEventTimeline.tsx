"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventImportance, MarketEventDto } from "@/lib/data/marketEvents";
import { EVENT_IMPORTANCE_LABELS, formatEventOccurredAt } from "@/lib/data/marketEvents";
import { buildEventTimeline, formatEraDateRange } from "@/lib/data/marketEventTimeline";
import {
  eraTimelineHeaderSections,
  eventPreviewContent,
  extractEventSection,
} from "@/lib/data/eventContentDisplay";
import {
  catalogEventImage,
  eventSeedKey,
  resolveEventTimelineImage,
} from "@/lib/data/eventTimelineMedia";

/** 浅色底的重要性标签（桌面 EventImportanceBadge 沿用深色主题配色） */
const IMPORTANCE_STYLE: Record<EventImportance, string> = {
  LOW: "border-fs-border bg-fs-elevated text-fs-muted",
  MEDIUM: "border-sky-200 bg-sky-50 text-sky-700",
  HIGH: "border-amber-200 bg-amber-50 text-amber-700",
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700",
};

/** 时代标签条高度（py-2 + h-8 + 下边框），时代标题吸顶在它下方 */
const CHIPS_ROW_H = 49;

type TimelineSection = {
  id: string;
  chipLabel: string;
  title: string;
  range: string | null;
  intro: string | null;
  eraTag: string | null;
  events: MarketEventDto[];
};

function EventThumb({ event, eraTag }: { event: MarketEventDto; eraTag: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(() =>
    catalogEventImage(eventSeedKey(event.content)),
  );
  const [broken, setBroken] = useState(false);

  // 事件可能上千条：只在接近视口时才去解析维基缩略图
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: "400px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || imageUrl) return;
    const ac = new AbortController();
    resolveEventTimelineImage(
      { content: event.content, title: event.title, sourceUrl: event.sourceUrl, eraTag },
      ac.signal,
    )
      .then((url) => {
        if (!ac.signal.aborted) setImageUrl(url);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [near, imageUrl, event.content, event.title, event.sourceUrl, eraTag]);

  return (
    <div
      ref={ref}
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-fs-border bg-fs-elevated"
    >
      {imageUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="flex h-full items-center justify-center text-[10px] text-fs-muted">
          历史影像
        </span>
      )}
    </div>
  );
}

export type MobileEventTimelineProps = {
  /** 已按筛选条件过滤（含时代阶段表头事件） */
  events: MarketEventDto[];
  onSelect: (event: MarketEventDto) => void;
};

/** 手机竖屏时间线：按时代分段上下滚动，顶部时代标签横向滑动快速跳转。 */
export function MobileEventTimeline({ events, onSelect }: MobileEventTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const sectionEls = useRef(new Map<string, HTMLElement>());
  const chipEls = useRef(new Map<string, HTMLButtonElement>());
  const rafRef = useRef<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sections = useMemo<TimelineSection[]>(() => {
    const model = buildEventTimeline(events);
    if (!model.hasEraStructure) {
      return model.orphans.length > 0
        ? [
            {
              id: "all",
              chipLabel: "全部事件",
              title: "全部事件",
              range: null,
              intro: null,
              eraTag: null,
              events: model.orphans,
            },
          ]
        : [];
    }
    const out: TimelineSection[] = model.groups
      .filter((g) => g.children.length > 0)
      .map((g) => ({
        id: g.era.id,
        chipLabel: g.meta.eraTag ?? g.era.title ?? "时代阶段",
        title: g.era.title ?? g.meta.eraTag ?? "时代阶段",
        range: formatEraDateRange(g.meta, g.era),
        intro: eraTimelineHeaderSections(g.era.content)[0]?.body ?? null,
        eraTag: g.meta.eraTag,
        events: g.children,
      }));
    if (model.orphans.length > 0) {
      out.push({
        id: "orphans",
        chipLabel: "其他事件",
        title: "其他事件",
        range: null,
        intro: null,
        eraTag: null,
        events: model.orphans,
      });
    }
    return out;
  }, [events]);

  const currentId = activeId ?? sections[0]?.id ?? null;

  useEffect(() => {
    const row = chipsRef.current;
    const chip = currentId ? chipEls.current.get(currentId) : null;
    if (!row || !chip) return;
    row.scrollTo({
      left: chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2,
      behavior: "smooth",
    });
  }, [currentId]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onScroll = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const container = scrollRef.current;
      if (!container) return;
      const y = container.scrollTop + CHIPS_ROW_H + 12;
      let next = sections[0]?.id ?? null;
      for (const s of sections) {
        const el = sectionEls.current.get(s.id);
        if (el && el.offsetTop <= y) next = s.id;
      }
      setActiveId(next);
    });
  };

  const jumpTo = (id: string) => {
    const container = scrollRef.current;
    const el = sectionEls.current.get(id);
    if (!container || !el) return;
    container.scrollTo({ top: el.offsetTop - CHIPS_ROW_H, behavior: "smooth" });
    setActiveId(id);
  };

  if (sections.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center p-6 text-sm text-fs-muted">暂无匹配事件</p>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div
        ref={chipsRef}
        className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-fs-border bg-fs-bg/95 px-3 py-2 backdrop-blur [scrollbar-width:none]"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              if (el) chipEls.current.set(s.id, el);
              else chipEls.current.delete(s.id);
            }}
            type="button"
            onClick={() => jumpTo(s.id)}
            className={`h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition ${
              s.id === currentId
                ? "border-fs-accent/30 bg-fs-accent-soft text-fs-accent-text"
                : "border-fs-border bg-white text-fs-text"
            }`}
          >
            {s.chipLabel}
          </button>
        ))}
      </div>

      {sections.map((s) => (
        <section
          key={s.id}
          ref={(el) => {
            if (el) sectionEls.current.set(s.id, el);
            else sectionEls.current.delete(s.id);
          }}
        >
          <div
            className="sticky z-10 border-b border-fs-border bg-fs-elevated px-3 py-2.5"
            style={{ top: CHIPS_ROW_H }}
          >
            <p className="text-[11px] tracking-wider text-fs-muted">时代阶段</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <h2 className="min-w-0 truncate text-[17px] font-semibold text-fs-text">{s.title}</h2>
              {s.range ? (
                <span className="shrink-0 text-[13px] tabular-nums text-fs-muted">{s.range}</span>
              ) : null}
            </div>
          </div>
          {s.intro ? (
            <p className="line-clamp-3 px-3 pt-2.5 text-[13px] leading-relaxed text-fs-secondary">
              {s.intro}
            </p>
          ) : null}
          <ol className="relative py-1">
            <span className="absolute bottom-0 left-[23px] top-0 w-0.5 bg-fs-border" aria-hidden />
            {s.events.map((event) => {
              const summary =
                extractEventSection(event.content, "事件概述") ??
                eventPreviewContent(event.content, 100);
              const critical = event.importance === "CRITICAL" || event.importance === "HIGH";
              return (
                <li key={event.id} className="relative py-2 pl-10 pr-3">
                  <span
                    className={`absolute left-[18px] top-[22px] h-3 w-3 rounded-full ${
                      critical ? "bg-fs-accent" : "border-2 border-fs-accent bg-fs-bg"
                    }`}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => onSelect(event)}
                    className="flex w-full gap-2.5 rounded-lg border border-fs-border bg-white p-2.5 text-left active:bg-fs-elevated"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <time className="text-xs font-medium tabular-nums text-fs-accent-text">
                          {formatEventOccurredAt(event)}
                        </time>
                        <span
                          className={`inline-flex rounded border px-1.5 text-[11px] font-medium ${IMPORTANCE_STYLE[event.importance]}`}
                        >
                          {EVENT_IMPORTANCE_LABELS[event.importance]}
                        </span>
                        {event.eventType ? (
                          <span className="text-[11px] text-fs-muted">{event.eventType}</span>
                        ) : null}
                      </div>
                      <h3 className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-snug text-fs-text">
                        {event.title ?? "未命名事件"}
                      </h3>
                      {summary ? (
                        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-fs-secondary">
                          {summary}
                        </p>
                      ) : null}
                    </div>
                    <EventThumb event={event} eraTag={s.eraTag} />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
